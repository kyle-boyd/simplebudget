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

describe('matchRule merchant normalisation', () => {
  it('strips a store number sitting between the words of a match', () => {
    // The only thing separating fuel from groceries at King Soopers is a rule
    // on "king soopers fuel", and the raw description interleaves a store
    // number: "KING SOOPERS #0685 FUEL ARVADA". Without stripping it the
    // specific rule never matches and fuel is silently filed as groceries.
    const rules = [
      makeRule({ id: 'grocery', matchText: 'king soopers', category: 'Groceries' }),
      makeRule({ id: 'fuel', matchText: 'king soopers fuel', category: 'Gas' }),
    ];
    expect(matchRule('KING SOOPERS #0685 FUEL ARVADA', rules)?.category).toBe('Gas');
    expect(matchRule('KING SOOPERS #0045 ARVADA', rules)?.category).toBe('Groceries');
  });

  it('strips a payment-processor prefix', () => {
    const rules = [makeRule({ matchText: 'honey hill cafe', category: 'Coffee Shops' })];
    expect(matchRule('SQ *HONEY HILL CAFE', rules)?.category).toBe('Coffee Shops');
    expect(matchRule('TST* ODELLS BAGEL', [makeRule({ matchText: 'odells bagel' })])).not.toBeNull();
  });

  it('strips a per-transaction reference code', () => {
    const rules = [makeRule({ matchText: 'amazon mktpl', category: 'Home Supplies' })];
    expect(matchRule('AMAZON MKTPL*MP6CQ6F53 Amzn.com/bill', rules)?.category).toBe('Home Supplies');
  });

  it('keeps a merchant name that follows a star', () => {
    // A star does not reliably introduce a reference code: in "PAYPAL
    // *ALIPAYUSINC" it introduces the merchant. Dropping the whole starred
    // token would collapse every PayPal row onto one meaningless rule.
    const rules = [makeRule({ matchText: 'alipayusinc', category: 'Home Supplies' })];
    expect(matchRule('PAYPAL *ALIPAYUSINC', rules)?.category).toBe('Home Supplies');
  });

  it('keeps a merchant name run together with its reference digits', () => {
    // "WF *WAYFAIR4392057853" concatenates merchant and reference, so only the
    // digit run can be dropped if the merchant is to survive.
    const rules = [makeRule({ matchText: 'wayfair', category: 'Home Supplies' })];
    expect(matchRule('WF *WAYFAIR4392057853 866-263-8325', rules)?.category).toBe('Home Supplies');
  });

  it('strips a support phone number', () => {
    const rules = [makeRule({ matchText: 'vsp', category: 'Insurance' })];
    expect(matchRule('VSP 800-785-0699 800-785-0699', rules)?.category).toBe('Insurance');
  });
});

describe('categorize with an always-review rule', () => {
  const rules = [
    makeRule({ matchText: 'amazon', category: 'Home Supplies', alwaysReview: true }),
  ];

  it('records a suggestion instead of filing the transaction', () => {
    // Amazon spans several categories, so the merchant alone cannot decide this
    // purchase. The row must reach the review screen rather than land in budget
    // totals, which is why Category stays unset.
    const [result] = categorize([makeTransaction({ Description: 'AMAZON MKTPL' })], rules, {});
    expect(result.suggestedCategory).toBe('Home Supplies');
    expect(result.suggestionConfidence).toBe('low');
    expect(result.Category).toBeUndefined();
    expect(result.hasRule).toBeUndefined();
  });

  it('wins over the bank category mapping', () => {
    const [result] = categorize(
      [makeTransaction({ Description: 'AMAZON', importedCategory: 'food_and_drink' })],
      rules,
      { food_and_drink: 'Restaurants' }
    );
    expect(result.Category).toBeUndefined();
    expect(result.suggestedCategory).toBe('Home Supplies');
  });

  it('still leaves a hand-picked category alone', () => {
    const [result] = categorize(
      [makeTransaction({ Description: 'AMAZON', Category: 'Gift' })],
      rules,
      {}
    );
    expect(result.Category).toBe('Gift');
    expect(result.suggestedCategory).toBeUndefined();
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

describe("categorize and the CSV's own category column", () => {
  const rules = [makeRule({ matchText: 'king soopers', category: 'Groceries' })];
  const names = ['Groceries', 'Gas', 'Restaurants'];

  it('lets a rule win over the label the bank supplied', () => {
    // Regression: the importer wrote the CSV category straight to Category, and
    // categorize() skips rows that already have one - so mapping a Category
    // column silently disabled every rule. 2,578 rows imported with zero rule
    // matches before this was found.
    const [result] = categorize(
      [makeTransaction({ Description: 'KING SOOPERS #0045', importedCategory: 'Fast Food' })],
      rules,
      {},
      names
    );
    expect(result.Category).toBe('Groceries');
    expect(result.hasRule).toBe(true);
  });

  it('accepts a bank label that is already one of the user\'s categories', () => {
    const [result] = categorize(
      [makeTransaction({ Description: 'SOMEWHERE', importedCategory: 'Groceries' })],
      [],
      {},
      names
    );
    expect(result.Category).toBe('Groceries');
  });

  it('matches such a label ignoring case', () => {
    const [result] = categorize(
      [makeTransaction({ Description: 'SOMEWHERE', importedCategory: 'groceries' })],
      [],
      {},
      names
    );
    expect(result.Category).toBe('Groceries'); // the user's casing, not the CSV's
  });

  it('leaves a foreign label uncategorized rather than filing it as invalid', () => {
    // "Fast Food" is not one of the user's categories. Writing it to Category
    // is what orphaned 2,602 rows: they render as an error and vanish from
    // budget totals. Better to leave Category empty and keep the hint.
    const [result] = categorize(
      [makeTransaction({ Description: 'SOMEWHERE', importedCategory: 'Fast Food' })],
      [],
      {},
      names
    );
    expect(result.Category).toBeUndefined();
    expect(result.importedCategory).toBe('Fast Food');
  });

  it('prefers an explicit mapping over a name match', () => {
    const [result] = categorize(
      [makeTransaction({ Description: 'SOMEWHERE', importedCategory: 'Groceries' })],
      [],
      { Groceries: 'Restaurants' },
      names
    );
    expect(result.Category).toBe('Restaurants');
  });

  it('is still a no-op with nothing to go on', () => {
    const input = [makeTransaction()];
    expect(categorize(input, [], {}, [])).toBe(input);
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

describe('category names are not merchant-normalised', () => {
  it('keeps digits in a category name', () => {
    // Merchant matching strips store numbers and reference codes. Running that
    // over category names would reduce "College 529" to "college" and quietly
    // merge it with any other category sharing the first word.
    const filed = [
      makeTransaction({ id: 'a', Category: 'College 529' }),
      makeTransaction({ id: 'b', Category: 'College' }),
    ];
    expect(transactionsUsingCategory(filed, 'College 529')).toHaveLength(1);

    const renamed = renameCategoryInTransactions(filed, 'College 529', '529 Plan');
    expect(renamed.map((t) => t.Category)).toEqual(['529 Plan', 'College']);
  });

  it('keeps punctuation in a category name', () => {
    const filed = [makeTransaction({ Category: 'Rent/Mortgage' })];
    expect(transactionsUsingCategory(filed, 'rent/mortgage')).toHaveLength(1);
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
