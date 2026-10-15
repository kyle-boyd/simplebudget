import type { Transaction } from '@/hooks/useTransactions';
import { normalizeMerchant } from './categorization';

/**
 * Catching the same transaction arriving twice under two different descriptions.
 *
 * `createTransactionId` hashes the description, so one export calling a purchase
 * "Amazon" and another calling it "AMAZON MKTPL*MP6CQ6F53" produce different
 * ids and both survive the id-based de-duplication. Importing two overlapping
 * exports of the same account that way put 1,834 duplicate pairs - about 70% of
 * all rows - into this database and roughly doubled every budget total.
 *
 * Date and amount are the trustworthy parts of a bank export, so they key the
 * comparison; the description only has to look like the same merchant.
 */

export interface DuplicateMatch {
  incoming: Transaction;
  existing: Transaction;
}

/** Date + amount: the two fields both exports agree on. */
function amountKey(transaction: Transaction): string {
  const amount = Math.abs(Number(transaction.Amount));
  return `${transaction.Date}|${Number.isFinite(amount) ? amount.toFixed(2) : 'NaN'}`;
}

/**
 * Merchant text reduced to bare letters and digits, so punctuation and spacing
 * differences between two exports of the same merchant stop mattering:
 * "WAL-MART #1483 YANKTON" and "WALMART" both start "walmart".
 */
function merchantFingerprint(description: string): string {
  return normalizeMerchant(description).replace(/[^a-z0-9]/g, '');
}

/**
 * Whether two descriptions look like the same merchant.
 *
 * Containment only, deliberately. A looser test (sharing a first word) would
 * call "DENVER BOTANIC" and "DENVER PUBLIC SCHOOLS" the same merchant, and
 * wrongly discarding a real transaction is worse than keeping a duplicate the
 * user can still delete. Short fingerprints are rejected because almost
 * anything contains a two-character string.
 */
export function looksLikeSameMerchant(a: string, b: string): boolean {
  const left = merchantFingerprint(a);
  const right = merchantFingerprint(b);
  if (left.length < 4 || right.length < 4) return false;
  return left.includes(right) || right.includes(left);
}

/**
 * Splits incoming transactions into those worth adding and those that look like
 * duplicates of something already stored.
 *
 * Each stored row can only absorb one incoming duplicate: two genuine $25
 * donations on the same day are a real pair, and if one is already stored the
 * second should still import.
 */
export function partitionDuplicates(
  incoming: Transaction[],
  existing: Transaction[]
): { fresh: Transaction[]; duplicates: DuplicateMatch[] } {
  if (existing.length === 0) return { fresh: incoming, duplicates: [] };

  const byDateAndAmount = new Map<string, Transaction[]>();
  for (const transaction of existing) {
    const key = amountKey(transaction);
    const bucket = byDateAndAmount.get(key);
    if (bucket) bucket.push(transaction);
    else byDateAndAmount.set(key, [transaction]);
  }

  const claimed = new Set<Transaction>();
  const fresh: Transaction[] = [];
  const duplicates: DuplicateMatch[] = [];

  for (const transaction of incoming) {
    const candidates = byDateAndAmount.get(amountKey(transaction)) ?? [];
    const match = candidates.find(
      (candidate) =>
        !claimed.has(candidate) &&
        looksLikeSameMerchant(transaction.Description, candidate.Description)
    );

    if (match) {
      claimed.add(match);
      duplicates.push({ incoming: transaction, existing: match });
    } else {
      fresh.push(transaction);
    }
  }

  return { fresh, duplicates };
}
