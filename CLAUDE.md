# simplebudget

React + TypeScript + Vite SPA over Firebase Realtime Database. Bank sync via
Teller, proxied through a Cloud Function (`functions/src/index.ts`) because the
Teller API needs mutual TLS.

## Commands

| Command | Use |
| --- | --- |
| `npm run verify` | **Run this before claiming anything works.** typecheck → tests → build |
| `npm test` | Vitest, non-interactive, ~4s |
| `npm test -- src/pages/Budget.test.tsx` | One file |
| `npm run typecheck` | `tsc --noEmit`. `build` runs it, so a type error fails the build |
| `npm run dev` | Vite dev server on :3000 |
| `npm run dev:local` | Dev server + Firebase emulators |

## Testing

Tests live beside the code as `*.test.ts(x)`. Firebase is replaced at the module
level by `vitest.config.ts` aliases, so **there is no mocking boilerplate** —
seed data, render, assert.

```tsx
import { describe, it, expect } from 'vitest';
import { renderPage, screen } from '@/test/render';
import { makeTransaction, seedUser, storedTransactions } from '@/test/factories';

it('does the thing', async () => {
  seedUser({ transactions: [makeTransaction({ Amount: -42.5 })] });
  const { user } = await renderPage(<Transactions />);
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(storedTransactions()).toHaveLength(1);
});
```

What's available:

- `@/test/factories` — `seedUser`, `makeTransaction`, `makeCategory`, `makeRule`,
  `makeBankAccount`, `defaultCategories`, and `monthsAgo` / `monthLabel` for
  dates relative to the frozen clock. Read back with `storedTransactions`,
  `storedCategories`, `storedRules`, `storedMappings`.
- `@/test/render` — `renderPage(ui, { route, signedOut })` wraps the providers,
  signs a user in, waits out the initial load, and returns a `user` for
  interaction. `pageText()` for coarse assertions.
- `@/test/fakes/firebase-database` — `fakeDb.seed/read/readArray/writes`.
  `fakeDb.writes()` lets you assert a change took *one* round trip.
- `@/test/fakes/firebase-auth` — `fakeAuth.signIn({ ... })`, `fakeAuth.password`.

Things that will bite you:

- **The clock is frozen** at `TEST_NOW` (11 Oct 2026) in `src/test/setup.ts`.
  The Dashboard charts the trailing N months from "now", so a real clock would
  make the suite drift. Build dates with `monthsAgo()`, never `new Date()`.
  Only `Date` is faked; `setTimeout` is real.
- **Every row renders twice.** Pages ship a mobile and a desktop variant
  (`lg:hidden` / `hidden lg:flex`) and jsdom applies no CSS, so both are in the
  tree. Use `getAllBy*`, or go through the mobile sheet — see
  `openEditSheetFor` in `Budget.test.tsx`.
- **jsdom is pinned to ^26.** 27 pulls an ESM-only CSS dep that Node 22.11
  cannot `require`. Node ≥22.12 would lift the pin.
- The fake DB mirrors Realtime Database's array handling: an array is stored as
  an index-keyed object and only comes back as an array when the keys are
  contiguous. That's why list reads go through a `toArray`-style coercion.

## Data model

Everything hangs off `users/<uid>/`: `transactions`, `categories`, `rules`,
`categoryMappings`, `bankAccounts`, `settings`, `lastUpdated`.

Two constraints that cause most of the bugs in this codebase:

1. **`transactions` is one array at one path.** Every edit is a whole-list
   read-modify-write. `useTransactions.mutateTransactions` serialises these per
   user — do not write the list from a component's rendered copy, and do not
   bypass the queue, or concurrent edits silently drop each other.
   `saveTransactions` is deliberately not exported for this reason.
2. **Categories are referenced by *name*, not id.** Transactions, rules and
   mappings all store the name string. Renaming or deleting a category must
   cascade (`cascadeRename` / `cascadeDelete` in `Budget.tsx`, built on
   `lib/categorization.ts`) or transactions are orphaned: they render as an
   invalid category and vanish from budget totals.

Dates are stored as `MM/DD/YY` strings. All parsing, formatting, month-list and
month-filter logic lives in `lib/months.ts` — use it rather than splitting on
`/`, which is how "Invalid Date" and `undefined, 20undefined` got shipped.

Subcategories of a category with `isSystem: true` ("Hide from Budget") must be
excluded from every spending calculation. Letting one through makes the enclosing
total `NaN`, which then silently renders as "No change".

## Conventions

- `@/` maps to `src/`.
- shadcn/ui components in `src/components/ui`, Tailwind for styling.
- Currency formatting goes through `useCurrency()` so the user's saved
  preference applies; `lib/utils.formatCurrency` is the unbound primitive.
- Rules match a description by **substring**, case- and whitespace-insensitive,
  most specific first (`lib/categorization.ts`). Exact matching was useless
  against bank feeds that append a reference number per transaction.

## Not wired up

- `public/` holds only `logo.svg`; the pre-React HTML app was removed.
- `server.js` serves `dist/` and duplicates `npm run preview`.
- Row checkboxes in the transactions table have no bulk actions behind them.
- Rule `matchText` is not editable after creation.
- Amounts use `Math.abs()` everywhere, so income counts toward spending.
  "Hide from Budget" is the only escape hatch. Deliberate, but revisit.
