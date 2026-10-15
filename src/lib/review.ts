import type { Transaction } from '@/hooks/useTransactions';
import { normalizeMerchant } from './categorization';

/**
 * Sorting imported transactions into what can be accepted in bulk and what
 * needs a decision, and proposing the rule to save once a decision is made.
 *
 * Kept free of React and Firebase so the same logic can back the review screen
 * today and a conversational interface later.
 */

export type ReviewBucket = 'autoFiled' | 'needsDecision' | 'uncategorized';

/**
 * Which review bucket a transaction belongs to, or `null` when there is nothing
 * left to review.
 *
 * `confirmed` is the existing signal for "the user has signed this off", so a
 * confirmed row never reappears here however it was categorised.
 */
export function reviewBucket(transaction: Transaction): ReviewBucket | null {
  if (transaction.confirmed) return null;
  // A suggestion deliberately leaves Category unset, so check it first.
  if (transaction.suggestedCategory && !transaction.Category) return 'needsDecision';
  if (transaction.Category) return 'autoFiled';
  return 'uncategorized';
}

export interface ReviewQueue {
  /** Filed automatically by a rule, bank category or the CSV. Safe to accept together. */
  autoFiled: Transaction[];
  /** A merchant spanning several categories guessed at one. Needs confirming individually. */
  needsDecision: Transaction[];
  /** Nothing matched. Needs a category chosen from scratch. */
  uncategorized: Transaction[];
}

export function buildReviewQueue(transactions: Transaction[]): ReviewQueue {
  const queue: ReviewQueue = { autoFiled: [], needsDecision: [], uncategorized: [] };
  for (const transaction of transactions) {
    const bucket = reviewBucket(transaction);
    if (bucket) queue[bucket].push(transaction);
  }
  return queue;
}

export function reviewCount(queue: ReviewQueue): number {
  return queue.autoFiled.length + queue.needsDecision.length + queue.uncategorized.length;
}

/** Words that identify no merchant, so they never belong in a rule pattern. */
const NOISE = new Set([
  'the', 'and', 'llc', 'inc', 'co', 'corp', 'com', 'org', 'net', 'usa', 'us',
  'bill', 'pmts', 'pmt', 'payments', 'purchase', 'web', 'recurring', 'online',
  'store', 'pos',
]);

/**
 * Proposes the match pattern to offer when saving a rule from a correction.
 *
 * Two words is the sweet spot. One is often too broad ("king" would catch
 * unrelated merchants), while the whole description carries a store number and
 * a city that would stop the rule ever matching another visit. The user can
 * edit it before saving, which is why this only has to be a good starting
 * point rather than correct.
 */
export function suggestRulePattern(description: string): string {
  const normalized = normalizeMerchant(description);
  const words = normalized
    .split(' ')
    .filter((word) => word.length > 1 && !NOISE.has(word));
  const pattern = words.slice(0, 2).join(' ');
  // Stripping noise can leave almost nothing ("CO OP" keeps only "op"). A
  // pattern that short matches half the file, so fall back to the whole
  // normalised description: too specific is recoverable by editing, too broad
  // silently mis-files transactions the user then has to hunt down.
  return pattern.length >= 4 ? pattern : normalized;
}
