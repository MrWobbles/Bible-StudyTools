/**
 * Convert human-readable Bible references (e.g. "2 Corinthians 11:2", "John 3:16-18")
 * into API.Bible USFM passage IDs (e.g. "2CO.11.2", "JHN.3.16-JHN.3.18").
 */

const SINGLE_CHAPTER_BOOKS = new Set(['OBA', 'PHM', '2JN', '3JN', 'JUD']);

const BOOK_ALIASES = new Map([
  ['gen', 'GEN'], ['ge', 'GEN'], ['gn', 'GEN'], ['genesis', 'GEN'],
  ['ex', 'EXO'], ['exo', 'EXO'], ['exod', 'EXO'], ['exodus', 'EXO'],
  ['lev', 'LEV'], ['le', 'LEV'], ['lv', 'LEV'], ['leviticus', 'LEV'],
  ['num', 'NUM'], ['nu', 'NUM'], ['nm', 'NUM'], ['nb', 'NUM'], ['numbers', 'NUM'],
  ['deut', 'DEU'], ['deu', 'DEU'], ['dt', 'DEU'], ['deuteronomy', 'DEU'],
  ['josh', 'JOS'], ['jos', 'JOS'], ['jsh', 'JOS'], ['joshua', 'JOS'],
  ['judg', 'JDG'], ['jdg', 'JDG'], ['jg', 'JDG'], ['jdgs', 'JDG'], ['judges', 'JDG'],
  ['ruth', 'RUT'], ['rut', 'RUT'], ['rth', 'RUT'], ['ru', 'RUT'],
  ['1 sam', '1SA'], ['1sam', '1SA'], ['1sa', '1SA'], ['1 sa', '1SA'], ['1 samuel', '1SA'], ['1samuel', '1SA'],
  ['2 sam', '2SA'], ['2sam', '2SA'], ['2sa', '2SA'], ['2 sa', '2SA'], ['2 samuel', '2SA'], ['2samuel', '2SA'],
  ['1 kgs', '1KI'], ['1kgs', '1KI'], ['1ki', '1KI'], ['1 ki', '1KI'], ['1 kings', '1KI'], ['1kings', '1KI'], ['1 k', '1KI'],
  ['2 kgs', '2KI'], ['2kgs', '2KI'], ['2ki', '2KI'], ['2 ki', '2KI'], ['2 kings', '2KI'], ['2kings', '2KI'], ['2 k', '2KI'],
  ['1 chr', '1CH'], ['1chr', '1CH'], ['1ch', '1CH'], ['1 ch', '1CH'], ['1 chron', '1CH'], ['1 chronicles', '1CH'], ['1chronicles', '1CH'],
  ['2 chr', '2CH'], ['2chr', '2CH'], ['2ch', '2CH'], ['2 ch', '2CH'], ['2 chron', '2CH'], ['2 chronicles', '2CH'], ['2chronicles', '2CH'],
  ['ezra', 'EZR'], ['ezr', 'EZR'],
  ['neh', 'NEH'], ['ne', 'NEH'], ['nehemiah', 'NEH'],
  ['esth', 'EST'], ['est', 'EST'], ['es', 'EST'], ['esther', 'EST'],
  ['job', 'JOB'], ['jb', 'JOB'],
  ['ps', 'PSA'], ['psa', 'PSA'], ['psm', 'PSA'], ['pss', 'PSA'], ['psalm', 'PSA'], ['psalms', 'PSA'],
  ['prov', 'PRO'], ['pro', 'PRO'], ['prv', 'PRO'], ['pr', 'PRO'], ['proverbs', 'PRO'],
  ['eccl', 'ECC'], ['ecc', 'ECC'], ['ec', 'ECC'], ['qoh', 'ECC'], ['ecclesiastes', 'ECC'],
  ['song', 'SNG'], ['sng', 'SNG'], ['sos', 'SNG'], ['so', 'SNG'], ['song of solomon', 'SNG'], ['song of songs', 'SNG'], ['canticles', 'SNG'],
  ['isa', 'ISA'], ['is', 'ISA'], ['isaiah', 'ISA'],
  ['jer', 'JER'], ['je', 'JER'], ['jr', 'JER'], ['jeremiah', 'JER'],
  ['lam', 'LAM'], ['la', 'LAM'], ['lamentations', 'LAM'],
  ['ezek', 'EZK'], ['ezk', 'EZK'], ['eze', 'EZK'], ['ezekiel', 'EZK'],
  ['dan', 'DAN'], ['da', 'DAN'], ['dn', 'DAN'], ['daniel', 'DAN'],
  ['hos', 'HOS'], ['ho', 'HOS'], ['hosea', 'HOS'],
  ['joel', 'JOL'], ['jol', 'JOL'], ['jl', 'JOL'],
  ['amos', 'AMO'], ['amo', 'AMO'], ['am', 'AMO'],
  ['obad', 'OBA'], ['oba', 'OBA'], ['ob', 'OBA'], ['obadiah', 'OBA'],
  ['jonah', 'JON'], ['jon', 'JON'], ['jnh', 'JON'],
  ['mic', 'MIC'], ['mc', 'MIC'], ['micah', 'MIC'],
  ['nah', 'NAM'], ['nam', 'NAM'], ['na', 'NAM'], ['nahum', 'NAM'],
  ['hab', 'HAB'], ['hb', 'HAB'], ['habakkuk', 'HAB'],
  ['zeph', 'ZEP'], ['zep', 'ZEP'], ['zp', 'ZEP'], ['zephaniah', 'ZEP'],
  ['hag', 'HAG'], ['hg', 'HAG'], ['haggai', 'HAG'],
  ['zech', 'ZEC'], ['zec', 'ZEC'], ['zc', 'ZEC'], ['zechariah', 'ZEC'],
  ['mal', 'MAL'], ['ml', 'MAL'], ['malachi', 'MAL'],
  ['matt', 'MAT'], ['mat', 'MAT'], ['mt', 'MAT'], ['matthew', 'MAT'],
  ['mark', 'MRK'], ['mrk', 'MRK'], ['mk', 'MRK'], ['mr', 'MRK'],
  ['luke', 'LUK'], ['luk', 'LUK'], ['lk', 'LUK'],
  ['john', 'JHN'], ['jhn', 'JHN'], ['jn', 'JHN'],
  ['acts', 'ACT'], ['act', 'ACT'], ['ac', 'ACT'],
  ['rom', 'ROM'], ['ro', 'ROM'], ['rm', 'ROM'], ['romans', 'ROM'],
  ['1 cor', '1CO'], ['1cor', '1CO'], ['1co', '1CO'], ['1 co', '1CO'], ['1 corinthians', '1CO'], ['1corinthians', '1CO'],
  ['2 cor', '2CO'], ['2cor', '2CO'], ['2co', '2CO'], ['2 co', '2CO'], ['2 corinthians', '2CO'], ['2corinthians', '2CO'],
  ['gal', 'GAL'], ['ga', 'GAL'], ['galatians', 'GAL'],
  ['eph', 'EPH'], ['ephes', 'EPH'], ['ephesians', 'EPH'],
  ['phil', 'PHP'], ['php', 'PHP'], ['pp', 'PHP'], ['philippians', 'PHP'],
  ['col', 'COL'], ['co', 'COL'], ['colossians', 'COL'],
  ['1 thess', '1TH'], ['1thess', '1TH'], ['1th', '1TH'], ['1 th', '1TH'], ['1 thes', '1TH'], ['1 thessalonians', '1TH'], ['1thessalonians', '1TH'],
  ['2 thess', '2TH'], ['2thess', '2TH'], ['2th', '2TH'], ['2 th', '2TH'], ['2 thes', '2TH'], ['2 thessalonians', '2TH'], ['2thessalonians', '2TH'],
  ['1 tim', '1TI'], ['1tim', '1TI'], ['1ti', '1TI'], ['1 ti', '1TI'], ['1 timothy', '1TI'], ['1timothy', '1TI'],
  ['2 tim', '2TI'], ['2tim', '2TI'], ['2ti', '2TI'], ['2 ti', '2TI'], ['2 timothy', '2TI'], ['2timothy', '2TI'],
  ['titus', 'TIT'], ['tit', 'TIT'], ['ti', 'TIT'],
  ['philem', 'PHM'], ['phm', 'PHM'], ['phlm', 'PHM'], ['philemon', 'PHM'],
  ['heb', 'HEB'], ['he', 'HEB'], ['hebrews', 'HEB'],
  ['jas', 'JAS'], ['jam', 'JAS'], ['jm', 'JAS'], ['james', 'JAS'],
  ['1 pet', '1PE'], ['1pet', '1PE'], ['1pe', '1PE'], ['1 pe', '1PE'], ['1 pt', '1PE'], ['1 peter', '1PE'], ['1peter', '1PE'],
  ['2 pet', '2PE'], ['2pet', '2PE'], ['2pe', '2PE'], ['2 pe', '2PE'], ['2 pt', '2PE'], ['2 peter', '2PE'], ['2peter', '2PE'],
  ['1 jn', '1JN'], ['1jn', '1JN'], ['1 jhn', '1JN'], ['1 john', '1JN'], ['1john', '1JN'],
  ['2 jn', '2JN'], ['2jn', '2JN'], ['2 jhn', '2JN'], ['2 john', '2JN'], ['2john', '2JN'],
  ['3 jn', '3JN'], ['3jn', '3JN'], ['3 jhn', '3JN'], ['3 john', '3JN'], ['3john', '3JN'],
  ['jude', 'JUD'], ['jud', 'JUD'], ['jd', 'JUD'],
  ['rev', 'REV'], ['re', 'REV'], ['rv', 'REV'], ['revelation', 'REV'], ['revelations', 'REV'],
]);

/**
 * Parse a human-readable Bible reference into an API.Bible USFM passage ID.
 * Returns null if the reference cannot be parsed unambiguously.
 */
function parseUsfmPassageId(reference) {
  const normalized = String(reference || '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u00a0\u2000-\u200b]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  // Match "<book name> <chapter/verse spec>"
  const match = normalized.match(/^([1-3]?\s*[a-zA-Z]+(?:\s+[a-zA-Z]+)*?)\.?\s+(\d+(?::\d+)?(?:\s*-\s*\d+(?::\d+)?)?)$/);
  if (!match) return null;

  const rawBook = match[1].toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const bookId = BOOK_ALIASES.get(rawBook);
  if (!bookId) return null;

  const spec = match[2].replace(/\s+/g, '');
  const parts = spec.split('-');
  if (parts.length > 2) return null;

  const startPart = parts[0];
  const endPart = parts[1] || null;

  const startNums = startPart.split(':');
  if (startNums.length > 2) return null;

  let startChapter;
  let startVerse = null;

  if (startNums.length === 2) {
    startChapter = startNums[0];
    startVerse = startNums[1];
  } else if (SINGLE_CHAPTER_BOOKS.has(bookId) && !endPart?.includes(':')) {
    startChapter = '1';
    startVerse = startNums[0];
  } else {
    startChapter = startNums[0];
  }

  const startId = startVerse ? `${bookId}.${startChapter}.${startVerse}` : `${bookId}.${startChapter}`;
  if (!endPart) return startId;

  const endNums = endPart.split(':');
  if (endNums.length > 2) return null;

  let endId;
  if (endNums.length === 2) {
    endId = `${bookId}.${endNums[0]}.${endNums[1]}`;
  } else if (startVerse) {
    endId = `${bookId}.${startChapter}.${endNums[0]}`;
  } else {
    endId = `${bookId}.${endNums[0]}`;
  }

  return `${startId}-${endId}`;
}

module.exports = {
  parseUsfmPassageId,
};
