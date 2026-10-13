/**
 * Builders for the shapes stored under `users/<uid>/...`, plus `seedUser` to
 * put a whole account in place in one call.
 *
 * Everything is relative to the frozen clock in setup.ts, so `monthsAgo(1)`
 * means the same month on every run.
 */
import type { Transaction } from '@/hooks/useTransactions';
import type { Category, Subcategory } from '@/hooks/useCategories';
import type { Rule } from '@/hooks/useRules';
import type { BankAccount } from '@/hooks/useBankAccounts';
import { fakeDb } from './fakes/firebase-database';
import { TEST_NOW } from './setup';

export const TEST_UID = 'test-uid';

/** `MM/DD/YY`, the format transactions are stored in. */
export function transactionDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

/** A stored date `months` before the frozen clock. */
export function monthsAgo(months: number, day = 15): string {
  return transactionDate(new Date(TEST_NOW.getFullYear(), TEST_NOW.getMonth() - months, day));
}

/** The month-picker label `months` before the frozen clock, e.g. `October, 2026`. */
export function monthLabel(months = 0): string {
  const date = new Date(TEST_NOW.getFullYear(), TEST_NOW.getMonth() - months, 1);
  return `${
    ['January', 'February', 'March', 'April', 'May', 'June',
     'July', 'August', 'September', 'October', 'November', 'December'][date.getMonth()]
  }, ${date.getFullYear()}`;
}

let transactionSeq = 0;

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  transactionSeq += 1;
  return {
    id: `t${transactionSeq}`,
    Date: monthsAgo(0),
    Amount: -10,
    Description: `MERCHANT ${transactionSeq}`,
    confirmed: false,
    ...overrides,
  };
}

export function makeSubcategory(overrides: Partial<Subcategory> = {}): Subcategory {
  return { id: 100, name: 'Groceries', amount: 400, ...overrides };
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 10,
    name: 'Food',
    subcategories: [makeSubcategory()],
    ...overrides,
  };
}

export function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule-1',
    matchText: 'KROGER',
    category: 'Groceries',
    createdAt: TEST_NOW.toISOString(),
    ...overrides,
  };
}

export function makeBankAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 'acct-1',
    institutionName: 'Test Bank',
    name: 'Checking',
    type: 'depository',
    subtype: 'checking',
    ...overrides,
  };
}

/**
 * The "Hide from Budget" system category plus Food/Transportation, matching the
 * defaults the app seeds. The extra `Reimbursements` subcategory under the
 * system category is deliberate: anything filed there must stay out of spending
 * totals.
 */
export function defaultCategories(): Category[] {
  return [
    {
      id: 1,
      name: 'Hide from Budget',
      isSystem: true,
      subcategories: [
        { id: 11, name: 'Hide from Budget', isSystem: true, amount: 0 },
        { id: 12, name: 'Reimbursements', amount: 0 },
      ],
    },
    {
      id: 2,
      name: 'Food',
      subcategories: [
        { id: 41, name: 'Groceries', amount: 400 },
        { id: 42, name: 'Restaurants', amount: 150 },
      ],
    },
    { id: 3, name: 'Transportation', subcategories: [{ id: 32, name: 'Gas', amount: 100 }] },
  ];
}

export interface SeedOptions {
  uid?: string;
  transactions?: Transaction[];
  categories?: Category[];
  rules?: Rule[];
  mappings?: Record<string, string>;
  settings?: Record<string, unknown>;
  bankAccounts?: BankAccount[];
}

/** Writes a complete account into the fake database. Only pass what matters. */
export function seedUser(options: SeedOptions = {}): string {
  const uid = options.uid ?? TEST_UID;
  const path = (child: string) => `users/${uid}/${child}`;

  if (options.transactions) fakeDb.seed(path('transactions'), options.transactions);
  fakeDb.seed(path('categories'), options.categories ?? defaultCategories());
  if (options.rules?.length) {
    fakeDb.seed(
      path('rules'),
      Object.fromEntries(options.rules.map(({ id, ...rest }) => [id, rest]))
    );
  }
  if (options.mappings) fakeDb.seed(path('categoryMappings'), options.mappings);
  if (options.settings) fakeDb.seed(path('settings'), options.settings);
  if (options.bankAccounts?.length) {
    fakeDb.seed(
      path('bankAccounts'),
      Object.fromEntries(options.bankAccounts.map((account) => [account.id, account]))
    );
  }

  return uid;
}

/** Transactions as the app stores them, for assertions. */
export function storedTransactions(uid = TEST_UID): Transaction[] {
  return fakeDb.readArray<Transaction>(`users/${uid}/transactions`);
}

export function storedCategories(uid = TEST_UID): Category[] {
  return fakeDb.readArray<Category>(`users/${uid}/categories`);
}

export function storedRules(uid = TEST_UID): Record<string, Omit<Rule, 'id'>> {
  return (fakeDb.read(`users/${uid}/rules`) ?? {}) as Record<string, Omit<Rule, 'id'>>;
}

export function storedMappings(uid = TEST_UID): Record<string, string> {
  return (fakeDb.read(`users/${uid}/categoryMappings`) ?? {}) as Record<string, string>;
}
