import type { Transaction } from '@/hooks/useTransactions';
import type { Rule } from '@/hooks/useRules';

function normalize(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Rules match when their text appears anywhere in the description. Bank feeds
 * append store and reference numbers to the same merchant ("AMAZON MKTPL*2A3B"),
 * so an exact comparison would only ever match the one transaction the rule was
 * created from. The most specific (longest) matching rule wins.
 */
export function matchRule(description: string, rules: Rule[]): Rule | null {
  const haystack = normalize(description);
  if (!haystack) return null;

  let best: Rule | null = null;
  let bestLength = 0;

  for (const rule of rules) {
    const needle = normalize(rule.matchText);
    if (!needle || !haystack.includes(needle)) continue;
    if (needle.length > bestLength) {
      best = rule;
      bestLength = needle.length;
    }
  }

  return best;
}

export function ruleMatches(description: string, matchText: string): boolean {
  const needle = normalize(matchText);
  return !!needle && normalize(description).includes(needle);
}

/**
 * Fills in `Category` on transactions that don't already have one: a description
 * rule first, then the bank's own category via the user's saved mappings.
 */
export function categorize(
  transactions: Transaction[],
  rules: Rule[],
  mappings: Record<string, string>
): Transaction[] {
  if (rules.length === 0 && Object.keys(mappings).length === 0) return transactions;

  return transactions.map(transaction => {
    if (transaction.Category) return transaction;

    const rule = matchRule(transaction.Description, rules);
    if (rule) return { ...transaction, Category: rule.category, hasRule: true };

    const mapped = transaction.importedCategory ? mappings[transaction.importedCategory] : undefined;
    return mapped ? { ...transaction, Category: mapped } : transaction;
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
