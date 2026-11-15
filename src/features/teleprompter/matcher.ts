import { debug } from './debug';
import { CONFIG, state } from './state';
import type { SequentialMatchResult } from './types';

const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'in',
  'at', 'of', 'to', 'for', 'from', 'with', 'by', 'about', 'be', 'have', 'do'
]);

const isNumericWord = (w: string): boolean => /^\d+$/.test(w);

function extractKeyWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w.replace(/[^\w]/g, ''))
    .filter(w => !COMMON_WORDS.has(w.toLowerCase()) && !isNumericWord(w) && w.length > 0);
}

// Levenshtein distance for fuzzy word matching
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array.from({ length: len1 + 1 }, () => Array<number>(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

// Calculate fuzzy match score (0-1) between two words
export function fuzzyMatchWords(spokenWord: string, expectedWord: string): number {
  const s1 = spokenWord.toLowerCase();
  const s2 = expectedWord.toLowerCase();

  if (s1 === s2) return 1;

  // Allow phonetic variations (similar start = higher score)
  if (s1.startsWith(s2.substring(0, 3)) || s2.startsWith(s1.substring(0, 3))) {
    return 0.85;
  }

  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  const similarity = 1 - (distance / maxLen);

  return similarity > 0.6 ? similarity : 0;
}

// Mark words as read based on spoken transcript
export function markWordsAsRead(transcript: string): void {
  if (!transcript || transcript.trim().length === 0) return;

  const currentPoint = state.allOutlinePoints[state.currentPointIndex];
  if (!currentPoint) return;

  const transcriptWords = transcript.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const wordSpans = document.querySelectorAll('#script-flow .teleprompter__line.current .teleprompter__word');
  if (wordSpans.length === 0) return;

  const pointWords = currentPoint.text
    .toLowerCase()
    .split(/(\s+)/)
    .filter(w => w.length > 0 && !/^\s+$/.test(w));

  let pointWordIdx = 0;

  transcriptWords.forEach((transcriptWord) => {
    while (pointWordIdx < pointWords.length) {
      const pointWord = pointWords[pointWordIdx];
      const stripped = pointWord.replace(/[^\w]/g, '');

      if (stripped.startsWith(transcriptWord) || transcriptWord.startsWith(stripped)) {
        wordSpans.forEach((span) => {
          const spanText = (span.textContent || '').toLowerCase().replace(/[^\w]/g, '');
          if (spanText === stripped) {
            span.classList.add('read');
          }
        });
        pointWordIdx++;
        break;
      }

      pointWordIdx++;
    }
  });
}

// Detect rewinds: if user repeats a line they already said, move backward
export function checkForRewind(spokenText: string): number | null {
  if (state.currentPointIndex === 0) return null;

  const spokenKeyWords = extractKeyWords(spokenText);
  if (spokenKeyWords.length === 0) return null;

  for (let i = Math.max(0, state.currentPointIndex - 3); i < state.currentPointIndex; i++) {
    const prevPoint = state.allOutlinePoints[i];
    const prevWords = extractKeyWords(prevPoint.text);
    if (prevWords.length === 0) continue;

    let matchedCount = 0;
    for (const spokenWord of spokenKeyWords) {
      for (const prevWord of prevWords) {
        if (fuzzyMatchWords(spokenWord, prevWord) > 0.7) {
          matchedCount++;
          break;
        }
      }
    }

    const matchPercentage = matchedCount / Math.max(prevWords.length, spokenKeyWords.length);
    if (matchPercentage > CONFIG.REWIND_THRESHOLD) {
      debug(`🔄 REWIND DETECTED: Speaker repeated "${prevPoint.text.substring(0, 40)}..."`);
      return i;
    }
  }

  return null;
}

// Match spoken words sequentially to current point
export function matchWordsSequential(spokenText: string): SequentialMatchResult {
  if (!spokenText || state.allOutlinePoints.length === 0) {
    return { matchedCount: 0, totalWords: 0, percentage: 0 };
  }

  const currentPoint = state.allOutlinePoints[state.currentPointIndex];
  if (!currentPoint) {
    return { matchedCount: 0, totalWords: 0, percentage: 0 };
  }

  const pointWords = extractKeyWords(currentPoint.text);
  const spokenKeyWords = extractKeyWords(spokenText);

  if (pointWords.length === 0) {
    return { matchedCount: 0, totalWords: 0, percentage: 0 };
  }

  let matchedCount = 0;
  let pointWordIndex = 0;

  for (const spokenWord of spokenKeyWords) {
    if (pointWordIndex >= pointWords.length) break;

    const expectedWord = pointWords[pointWordIndex];
    const matchScore = fuzzyMatchWords(spokenWord, expectedWord);

    if (matchScore > 0.65) {
      matchedCount++;
      pointWordIndex++;
    }
  }

  const percentage = pointWords.length > 0 ? matchedCount / pointWords.length : 0;

  return {
    matchedCount,
    totalWords: pointWords.length,
    percentage,
    spokenWords: spokenKeyWords,
    pointWords
  };
}
