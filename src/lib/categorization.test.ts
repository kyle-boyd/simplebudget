import { describe, it, expect } from 'vitest';
import {
  categorize,
  matchRule,
  referencesTo,
  renameCategoryInTransactions,
  ruleMatches,
  transactionsUsingCategory,
} from './categorization';
import { makeRule, makeTransaction } from '@/test/factories';

describe('matchRule', () => {
  const rules = [
    makeRule({ id: 'broad', matchText: 'AMAZON', category: 'Shopping' }),
    makeRule({ id: 'specific', matchText: 'AMAZON MKTPL', category: 'Groceries' }),
  ];

  it('matches on a substring, not the whole description', () => {
    // Regression: rules compared the full description, so a rule created from
    // "AMAZON MKTPL*2A3B4" could never match the next order from the same
    // merchant, because banks append a different reference number each time.
    expect(matchRule('AMAZON MKTPL*2A3B4 AMZN', rules)?.category).toBe('Groceries');
  });

  it('prefers the most specific rule when several match', () => {
    expect(matchRule('AMAZON MKTPL order', rules)?.category).toBe('Groceries');
    expect(matchRule('AMAZON.COM order', rules)?.category).toBe('Shopping');
  });

  it('ignores case and collapses whitespace', () => {
    expect(matchRule('  amazon   mktpl  #9', rules)?.category).toBe('Groceries');
  });

  it('returns null when nothing matches', () => {
    expect(matchRule('STARBUCKS', rules)).toBeNull();
  });

  it('never matches on a blank rule', () => {
    expect(matchRule('anything', [makeRule({ matchText: '   ' })])).toBeNull();
  });

  it('never matches a blank description', () => {
    expect(matchRule('', rules)).toBeNull();
  });
});

describe('ruleMatches', () => {
  it('agrees with matchRule, so "apply to all matching" selects the same rows', () => {
    expect(ruleMatches('KROGER #123', 'kroger')).toBe(true);
    expect(ruleMatches('SAFEWAY', 'kroger')).toBe(false);
  });

  it('treats a blank pattern as matching nothing', () => {
    expect(ruleMatches('KROGER', '  ')).toBe(false);
  });
});

describe('categorize', () => {
  const rules = [makeRule({ matchText: 'KROGER', category: 'Groceries' })];
  const mappings = { food_and_drink: 'Restaurants' };

  it('files an incoming transaction by rule', () => {
    // Regression: nothing applied rules on import, so the "applies to future
    // transactions" promise in the rule dialog never actually held.
    const [result] = categorize([makeTransaction({ Description: 'KROGER #99' })], rules, mappings);
    expect(result.Category).toBe('Groceries');
    expect(result.hasRule).toBe(true);
  });

  it('falls back to the bank category mapping', () => {
    const [result] = categorize(
      [makeTransaction({ Description: 'UNKNOWN', importedCategory: 'food_and_drink' })],
      rules,
      mappings
    );
    expect(result.Category).toBe('Restaurants');
  });

  it('prefers a rule over a mapping', () => {
    const [result] = categorize(
      [makeTransaction({ Description: 'KROGER', importedCategory: 'food_and_drink' })],
      rules,
      mappings
    );
    expect(result.Category).toBe('Groceries');
  });

  it('never overwrites a category that is already set', () => {
    const [result] = categorize(
      [makeTransaction({ Description: 'KROGER', Category: 'Chosen By Hand' })],
      rules,
      mappings
    );
    expect(result.Category).toBe('Chosen By Hand');
  });

  it('leaves unmatched transactions alone', () => {
    const input = [makeTransaction({ Description: 'MYSTERY' })];
    expect(categorize(input, rules, mappings)[0].Category).toBeUndefined();
  });

  it('is a no-op with no rules and no mappings', () => {
    const input = [makeTransaction()];
    expect(categorize(input, [], {})).toBe(input);
  });
});

describe('renameCategoryInTransactions', () => {
  const filed = [
    makeTransaction({ id: 'a', Category: 'Gas' }),
    makeTransaction({ id: 'b', Category: ' gas ' }),
    makeTransaction({ id: 'c', Category: 'Groceries' }),
  ];

  it('re-files every transaction under the old name', () => {
    // Regression: transactions store the category name, so a rename used to
    // orphan them - they showed as an invalid category and left the budget.
    expect(renameCategoryInTransactions(filed, 'Gas', 'Fuel').map((t) => t.Category)).toEqual([
      'Fuel',
      'Fuel',
      'Groceries',
    ]);
  });

  it('leaves untouched rows identical by reference', () => {
    const result = renameCategoryInTransactions(filed, 'Gas', 'Fuel');
    expect(result[2]).toBe(filed[2]);
  });
});

describe('referencesTo', () => {
  const rules = [
    makeRule({ id: 'r1', category: 'Gas' }),
    makeRule({ id: 'r2', category: 'Groceries' }),
  ];
  const mappings = { transport: 'Gas', food: 'Groceries', misc: 'gas' };

  it('finds rules and mappings pointing at a name', () => {
    const result = referencesTo(['Gas'], rules, mappings);
    expect(result.rules.map((r) => r.id)).toEqual(['r1']);
    expect(result.mappings).toEqual(['transport', 'misc']);
  });

  it('handles several names in one pass', () => {
    // A category delete removes the parent and all its subcategories at once;
    // looking them up one at a time caused each write to clobber the last.
    const result = referencesTo(['Gas', 'Groceries'], rules, mappings);
    expect(result.rules).toHaveLength(2);
    expect(result.mappings).toHaveLength(3);
  });

  it('ignores blank names', () => {
    expect(referencesTo(['', '  '], rules, mappings)).toEqual({ rules: [], mappings: [] });
  });
});

describe('transactionsUsingCategory', () => {
  it('counts matches ignoring case and padding, for the delete prompt', () => {
    const filed = [
      makeTransaction({ Category: 'Gas' }),
      makeTransaction({ Category: ' gas ' }),
      makeTransaction({ Category: 'Groceries' }),
      makeTransaction({}),
    ];
    expect(transactionsUsingCategory(filed, 'GAS')).toHaveLength(2);
  });
});
