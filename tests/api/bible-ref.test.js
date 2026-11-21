import { describe, expect, it } from 'vitest';
import { parseUsfmPassageId } from '../../server/services/bibleRef';

describe('parseUsfmPassageId', () => {
  it('parses standard book chapter:verse references', () => {
    expect(parseUsfmPassageId('2 Corinthians 11:2')).toBe('2CO.11.2');
    expect(parseUsfmPassageId('John 3:16')).toBe('JHN.3.16');
    expect(parseUsfmPassageId('Psalm 119:105')).toBe('PSA.119.105');
    expect(parseUsfmPassageId('Song of Solomon 2:1')).toBe('SNG.2.1');
  });

  it('parses verse ranges with hyphens or en-dashes', () => {
    expect(parseUsfmPassageId('Ephesians 6:10-18')).toBe('EPH.6.10-EPH.6.18');
    expect(parseUsfmPassageId('Proverbs 30:5–6')).toBe('PRO.30.5-PRO.30.6');
    expect(parseUsfmPassageId('Genesis 1:1-2:3')).toBe('GEN.1.1-GEN.2.3');
  });

  it('parses whole chapters and single-chapter books', () => {
    expect(parseUsfmPassageId('Psalm 23')).toBe('PSA.23');
    expect(parseUsfmPassageId('Jude 24')).toBe('JUD.1.24');
    expect(parseUsfmPassageId('Jude 1:24')).toBe('JUD.1.24');
    expect(parseUsfmPassageId('Philemon 6')).toBe('PHM.1.6');
  });

  it('returns null for unparseable or keyword queries', () => {
    expect(parseUsfmPassageId('')).toBeNull();
    expect(parseUsfmPassageId('faith hope love')).toBeNull();
    expect(parseUsfmPassageId('UnknownBook 1:1')).toBeNull();
  });
});
