import { describe, it, expect } from 'vitest';
import { buildReviewQueue, reviewBucket, reviewCount, suggestRulePattern } from './review';
import { makeTransaction } from '@/test/factories';

describe('reviewBucket', () => {
  it('has nothing to say about a confirmed transaction', () => {
    expect(reviewBucket(makeTransaction({ Category: 'Gas', confirmed: true }))).toBeNull();
    // Confirmed wins even over a leftover suggestion.
    expect(
      reviewBucket(makeTransaction({ suggestedCategory: 'Gas', confirmed: true }))
    ).toBeNull();
  });

  it('sends a rule-filed transaction to the bulk-accept bucket', () => {
    expect(reviewBucket(makeTransaction({ Category: 'Groceries', hasRule: true }))).toBe('autoFiled');
  });

  it('treats a CSV or bank category as auto-filed too', () => {
    expect(reviewBucket(makeTransaction({ Category: 'Groceries' }))).toBe('autoFiled');
  });

  it('sends a suggestion to the individual-decision bucket', () => {
    const transaction = makeTransaction({ suggestedCategory: 'Home Supplies', suggestionConfidence: 'low' });
    expect(reviewBucket(transaction)).toBe('needsDecision');
  });

  it('sends an unmatched transaction to the uncategorized bucket', () => {
    expect(reviewBucket(makeTransaction({}))).toBe('uncategorized');
  });
});

describe('buildReviewQueue', () => {
  it('splits a mixed import three ways and leaves confirmed rows out', () => {
    const queue = buildReviewQueue([
      makeTransaction({ id: '1', Category: 'Groceries', hasRule: true }),
      makeTransaction({ id: '2', suggestedCategory: 'Home Supplies' }),
      makeTransaction({ id: '3' }),
      makeTransaction({ id: '4', Category: 'Gas', confirmed: true }),
    ]);
    expect(queue.autoFiled.map((t) => t.id)).toEqual(['1']);
    expect(queue.needsDecision.map((t) => t.id)).toEqual(['2']);
    expect(queue.uncategorized.map((t) => t.id)).toEqual(['3']);
    expect(reviewCount(queue)).toBe(3);
  });

  it('is empty once everything is confirmed', () => {
    const queue = buildReviewQueue([makeTransaction({ Category: 'Gas', confirmed: true })]);
    expect(reviewCount(queue)).toBe(0);
  });
});

describe('suggestRulePattern', () => {
  it('drops the processor prefix, store number and city', () => {
    expect(suggestRulePattern('SQ *HONEY HILL CAFE')).toBe('honey hill');
    expect(suggestRulePattern('KING SOOPERS #0045 ARVADA')).toBe('king soopers');
    expect(suggestRulePattern('TRADER JOE S #308 WESTMINSTER')).toBe('trader joe');
  });

  it('drops the reference digits but keeps the merchant', () => {
    expect(suggestRulePattern('WF *WAYFAIR4392057853 866-263-8325')).toBe('wf wayfair');
  });

  it('skips words that identify no merchant', () => {
    expect(suggestRulePattern('AMAZON MKTPL*MP6CQ6F53 Amzn.com/bill')).toBe('amazon mktpl');
  });

  it('keeps the whole description when stripping noise leaves too little', () => {
    // "co" is a corporate suffix and gets dropped, leaving just "op" - a
    // two-character pattern would match half the file.
    expect(suggestRulePattern('CO OP')).toBe('co op');
  });

  it('falls back to the normalised description when every word is noise', () => {
    expect(suggestRulePattern('the and')).toBe('the and');
  });
});
