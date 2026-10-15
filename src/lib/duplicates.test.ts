import { describe, it, expect } from 'vitest';
import { looksLikeSameMerchant, partitionDuplicates } from './duplicates';
import { makeTransaction } from '@/test/factories';

describe('looksLikeSameMerchant', () => {
  it('sees through punctuation, store numbers and trailing locations', () => {
    expect(looksLikeSameMerchant('WAL-MART #1483 YANKTON', 'WALMART')).toBe(true);
    expect(looksLikeSameMerchant('AMAZON MKTPL*MP6CQ6F53', 'Amazon')).toBe(true);
    expect(looksLikeSameMerchant('TARGET.COM * 800-591-3869', 'Target')).toBe(true);
  });

  it('does not merge two merchants that merely share a first word', () => {
    // Discarding a real transaction is worse than keeping a duplicate the user
    // can delete, so containment is required rather than a shared prefix.
    expect(looksLikeSameMerchant('DENVER BOTANIC', 'DENVER PUBLIC SCHOOLS')).toBe(false);
  });

  it('ignores fingerprints too short to be meaningful', () => {
    expect(looksLikeSameMerchant('A', 'ANYTHING')).toBe(false);
  });
});

describe('partitionDuplicates', () => {
  it('catches the same transaction described two different ways', () => {
    // Regression: two overlapping exports of one account - one naming a purchase
    // "Amazon", the other "AMAZON MKTPL*..." - hashed to different ids and both
    // imported, which is how 70% of this database became duplicates.
    const existing = [
      makeTransaction({ id: 'old', Date: '04/05/26', Amount: 9.99, Description: 'Amazon' }),
    ];
    const incoming = [
      makeTransaction({ id: 'new', Date: '04/05/26', Amount: 9.99, Description: 'AMAZON MKTPL*MP6CQ6F53' }),
    ];
    const { fresh, duplicates } = partitionDuplicates(incoming, existing);
    expect(fresh).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].existing.id).toBe('old');
  });

  it('matches on the amount regardless of sign', () => {
    const existing = [makeTransaction({ Date: '04/05/26', Amount: 9.99, Description: 'Amazon' })];
    const incoming = [makeTransaction({ Date: '04/05/26', Amount: -9.99, Description: 'Amazon' })];
    expect(partitionDuplicates(incoming, existing).duplicates).toHaveLength(1);
  });

  it('keeps a genuine repeat purchase the stored row cannot account for', () => {
    // Two $25 donations on the same day are real. One is already stored, so only
    // one of the two incoming rows is a duplicate.
    const existing = [makeTransaction({ id: 'old', Date: '03/01/26', Amount: 25, Description: 'Pioneers' })];
    const incoming = [
      makeTransaction({ id: 'a', Date: '03/01/26', Amount: 25, Description: 'PIONEERS' }),
      makeTransaction({ id: 'b', Date: '03/01/26', Amount: 25, Description: 'PIONEERS' }),
    ];
    const { fresh, duplicates } = partitionDuplicates(incoming, existing);
    expect(duplicates).toHaveLength(1);
    expect(fresh.map((t) => t.id)).toEqual(['b']);
  });

  it('leaves a different merchant on the same day and amount alone', () => {
    const existing = [makeTransaction({ Date: '03/01/26', Amount: 25, Description: 'Pioneers' })];
    const incoming = [makeTransaction({ Date: '03/01/26', Amount: 25, Description: 'STARBUCKS' })];
    const { fresh, duplicates } = partitionDuplicates(incoming, existing);
    expect(fresh).toHaveLength(1);
    expect(duplicates).toHaveLength(0);
  });

  it('distinguishes the same merchant and amount on different days', () => {
    const existing = [makeTransaction({ Date: '03/01/26', Amount: 25, Description: 'Pioneers' })];
    const incoming = [makeTransaction({ Date: '04/01/26', Amount: 25, Description: 'Pioneers' })];
    expect(partitionDuplicates(incoming, existing).fresh).toHaveLength(1);
  });

  it('passes everything through on a first import', () => {
    const incoming = [makeTransaction()];
    expect(partitionDuplicates(incoming, []).fresh).toBe(incoming);
  });
});
