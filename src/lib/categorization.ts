import type { Transaction } from '@/hooks/useTransactions';
import type { Rule } from '@/hooks/useRules';

/**
 * Normalises a category *name* for comparison. Deliberately conservative:
 * category names are user-authored and legitimately contain digits
 * ("College 529") and punctuation ("Rent/Mortgage"), so nothing is stripped
 * beyond case and surrounding whitespace.
 */
function normalize(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Normalises a bank *description*, or a rule's match text, for matching.
 *
 * Bank feeds bury the merchant in noise: a payment-processor prefix
 * ("SQ *HONEY HILL CAFE", "TST* ODELLS BAGEL"), a store number
 * ("KING SOOPERS #0685 FUEL ARVADA"), a per-transaction reference
 * ("AMAZON MKTPL*MP6CQ6F53") or a support phone number. Stripping those lets
 * one rule cover every visit to a merchant instead of needing one per store and
 * per reference code.
 *
 * Store numbers earn their place: "KING SOOPERS #0685 FUEL ARVADA" only matches
 * a `king soopers fuel` rule once the "#0685" sitting between the words is gone,
 * and that rule is the only thing separating fuel from groceries at a merchant
 * that sells both.
 *
 * Reference codes are handled by dropping long digit runs rather than whole
 * starred tokens, because a star is not reliably followed by a reference: in
 * "PAYPAL *ALIPAYUSINC" it introduces the real merchant, and in
 * "WF *WAYFAIR4392057853" the merchant and the reference are run together.
 * Dropping just the digits leaves "wayfair" and "alipayusinc" intact while
 * reducing "MKTPL*MP6CQ6F53" to harmless residue that no rule matches on.
 *
 * Kept separate from `normalize` because it is far too destructive for category
 * names - it would reduce "College 529" to "college".
 */
export function normalizeMerchant(value: string | undefined | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/^\s*(sq|tst|zap|pp|sp|py|cke)\s*\*+\s*/, '')   // processor prefix
    .replace(/\b\d{3}[-.]\d{3}[-.]\d{4}\b/g, ' ')            // support number
    .replace(/#\s*\d+/g, ' ')                                  // store number
    .replace(/\*/g, ' ')                                        // star separator
    .replace(/\d{4,}/g, ' ')                                    // reference digits
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rules match when their text appears anywhere in the description. Bank feeds
 * append store and reference numbers to the same merchant ("AMAZON MKTPL*2A3B"),
 * so an exact comparison would only ever match the one transaction the rule was
 * created from. The most specific (longest) matching rule wins.
 */
export function matchRule(description: string, rules: Rule[]): Rule | null {
  const haystack = normalizeMerchant(description);
  if (!haystack) return null;

  let best: Rule | null = null;
  let bestLength = 0;

  for (const rule of rules) {
    const needle = normalizeMerchant(rule.matchText);
    if (!needle || !haystack.includes(needle)) continue;
    if (needle.length > bestLength) {
      best = rule;
      bestLength = needle.length;
    }
  }

  return best;
}

export function ruleMatches(description: string, matchText: string): boolean {
  const needle = normalizeMerchant(matchText);
  return !!needle && normalizeMerchant(description).includes(needle);
}

/**
 * Fills in `Category` on transactions that don't already have one: a description
 * rule first, then the bank's own category via the user's saved mappings.
 */
export function categorize(
  transactions: Transaction[],
  rules: Rule[],
  mappings: Record<string, string>,
  validCategories: Iterable<string> = []
): Transaction[] {
  // Normalised -> canonical, so a bank label matching one of the user's own
  // category names resolves to that name with its original casing.
  const canonical = new Map<string, string>();
  for (const name of validCategories) {
    const key = normalize(name);
    if (key) canonical.set(key, name);
  }

  if (rules.length === 0 && Object.keys(mappings).length === 0 && canonical.size === 0) {
    return transactions;
  }

  return transactions.map(transaction => {
    if (transaction.Category) return transaction;

    const rule = matchRule(transaction.Description, rules);
    if (rule) {
      // An `alwaysReview` rule identifies the merchant but not which category
      // this particular purchase belongs to - Amazon and Target each span
      // several. Record a suggestion and leave `Category` unset so the row has
      // to pass through the review screen instead of being filed silently.
      if (rule.alwaysReview) {
        return {
          ...transaction,
          suggestedCategory: rule.category,
          suggestionConfidence: 'low' as const,
        };
      }
      return { ...transaction, Category: rule.category, hasRule: true };
    }

    if (!transaction.importedCategory) return transaction;

    const mapped = mappings[transaction.importedCategory];
    if (mapped) return { ...transaction, Category: mapped };

    // A bank label that is already one of the user's categories needs no
    // mapping - a CSV saying "Groceries" means Groceries. Matching by name is
    // what keeps a foreign label like "Fast Food" out of Category, where it
    // would render as invalid and leave the budget.
    const direct = canonical.get(normalize(transaction.importedCategory));
    return direct ? { ...transaction, Category: direct } : transaction;
  });
}

/**
 * Re-files transactions from `oldName` to `newName`. Transactions store the
 * category *name*, so without this a rename silently orphans every transaction
 * filed under the old name: it renders as an invalid category and drops out of
 * the budget totals.
 */
export function renameCategoryInTransactions(
  transactions: Transaction[],
  oldName: string,
  newName: string
): Transaction[] {
  const target = normalize(oldName);
  return transactions.map(transaction =>
    normalize(transaction.Category) === target ? { ...transaction, Category: newName } : transaction
  );
}

/** Rules and bank-category mappings that point at any of `names`. */
export function referencesTo(
  names: string[],
  rules: Rule[],
  mappings: Record<string, string>
): { rules: Rule[]; mappings: string[] } {
  const targets = new Set(names.map(normalize).filter(Boolean));

  return {
    rules: rules.filter(rule => targets.has(normalize(rule.category))),
    mappings: Object.entries(mappings)
      .filter(([, budgetCategory]) => targets.has(normalize(budgetCategory)))
      .map(([importedCategory]) => importedCategory),
  };
}

/** Transactions filed under `name`, used to warn before a delete. */
export function transactionsUsingCategory(transactions: Transaction[], name: string): Transaction[] {
  const target = normalize(name);
  return transactions.filter(transaction => normalize(transaction.Category) === target);
}
