/**
 * Text similarity utilities for question deduplication.
 * Uses Jaccard similarity on tokenized question text.
 *
 * Optimizations:
 * 1. Size-based pruning: Skip comparisons when set sizes make threshold impossible
 * 2. Pre-tokenization: Tokenize existing questions once, reuse for all comparisons
 * 3. Early termination: Stop Jaccard computation when threshold is unreachable
 */

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'can',
  'just',
  'should',
  'now',
  'this',
  'that',
  'these',
  'those',
  'what',
  'which',
  'who',
  'whom',
  'if',
  'your',
  'you',
  'we',
  'they',
  'it',
  'its',
  'my',
  'our',
  'their',
  'his',
  'her',
  'i',
  'me',
  'him',
]);

/**
 * Calculate the minimum size ratio needed for two sets to achieve a given Jaccard threshold.
 * For J(A,B) >= threshold: min(|A|,|B|) / max(|A|,|B|) >= threshold / (2 - threshold)
 */
function minSizeRatioForThreshold(threshold: number): number {
  return threshold / (2 - threshold);
}

/**
 * Check if two sets could possibly achieve the given Jaccard threshold based on sizes alone.
 * This allows us to skip expensive intersection calculations.
 */
function couldMeetThreshold(sizeA: number, sizeB: number, threshold: number): boolean {
  if (sizeA === 0 || sizeB === 0) return threshold === 0;
  const minSize = Math.min(sizeA, sizeB);
  const maxSize = Math.max(sizeA, sizeB);
  return minSize / maxSize >= minSizeRatioForThreshold(threshold);
}

/**
 * Tokenizes text: lowercase, remove punctuation, split on whitespace,
 * filter stopwords, return unique word set.
 */
export function tokenize(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));

  return new Set(normalized);
}

/**
 * Calculates Jaccard similarity between two sets.
 * J(A,B) = |A ∩ B| / |A ∪ B|
 * Returns 0-1, where 1 means identical.
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) {
    return 1; // Both empty = identical
  }

  let intersection = 0;
  // Iterate over the smaller set for efficiency
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];

  for (const item of smaller) {
    if (larger.has(item)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;

  if (union === 0) {
    return 1;
  }

  return intersection / union;
}

/**
 * Optimized Jaccard similarity with early termination.
 * Returns -1 if threshold cannot be met (allows caller to skip).
 * Returns actual similarity if >= threshold, otherwise 0.
 */
export function jaccardSimilarityWithThreshold(
  setA: Set<string>,
  setB: Set<string>,
  threshold: number
): number {
  // Size-based pruning: skip if sizes make threshold impossible
  if (!couldMeetThreshold(setA.size, setB.size, threshold)) {
    return -1; // Signal: don't bother comparing
  }

  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }

  // Iterate over smaller set
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  const union = setA.size + setB.size;

  let intersection = 0;
  let remaining = smaller.size;

  // Calculate minimum intersection needed for threshold
  // J = intersection / (union - intersection) >= threshold
  // intersection >= threshold * union / (1 + threshold)
  const minIntersectionNeeded = Math.ceil((threshold * union) / (1 + threshold));

  for (const item of smaller) {
    if (larger.has(item)) {
      intersection++;
    }
    remaining--;

    // Early termination: if we can't reach minimum intersection, bail out
    if (intersection + remaining < minIntersectionNeeded) {
      return -1;
    }
  }

  const actualUnion = union - intersection;
  if (actualUnion === 0) return 1;

  const similarity = intersection / actualUnion;
  return similarity >= threshold ? similarity : 0;
}

/**
 * Computes similarity between two question texts.
 * Returns 0-1 where 1 = identical, 0 = completely different.
 */
export function questionSimilarity(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  return jaccardSimilarity(tokensA, tokensB);
}

/**
 * Checks if a new question is too similar to any existing questions.
 * Returns the most similar question if above threshold, null otherwise.
 */
export function findDuplicate(
  newQuestionText: string,
  existingQuestions: { id: number; questionText: string }[],
  threshold: number = 0.7
): { id: number; questionText: string; similarity: number } | null {
  const newTokens = tokenize(newQuestionText);

  let maxSimilarity = 0;
  let mostSimilar: { id: number; questionText: string } | null = null;

  for (const existing of existingQuestions) {
    const existingTokens = tokenize(existing.questionText);
    const similarity = jaccardSimilarity(newTokens, existingTokens);

    if (similarity >= threshold && similarity > maxSimilarity) {
      maxSimilarity = similarity;
      mostSimilar = existing;
    }
  }

  if (mostSimilar) {
    return {
      ...mostSimilar,
      similarity: maxSimilarity,
    };
  }

  return null;
}

export interface DeduplicationResult {
  accepted: boolean;
  duplicate?: {
    id: number;
    questionText: string;
    similarity: number;
  };
}

/**
 * Pre-tokenized question for efficient batch comparisons.
 */
export interface TokenizedQuestion {
  id: number;
  questionText: string;
  tokens: Set<string>;
}

/**
 * Pre-tokenize questions for batch deduplication.
 * Call this once for existing questions, then reuse for multiple deduplication calls.
 */
export function preTokenizeQuestions(
  questions: { id: number; questionText: string }[]
): TokenizedQuestion[] {
  return questions.map((q) => ({
    id: q.id,
    questionText: q.questionText,
    tokens: tokenize(q.questionText),
  }));
}

/**
 * Batch check multiple questions against existing questions.
 * Returns results for each question indicating if it should be accepted.
 *
 * Optimizations applied:
 * 1. Pre-tokenizes all existing questions once (O(n) instead of O(n*m) tokenization)
 * 2. Size-based pruning skips comparisons when threshold is mathematically impossible
 * 3. Early termination stops Jaccard computation when threshold is unreachable
 * 4. Iterates over smaller set in Jaccard calculation
 */
export function deduplicateQuestions(
  newQuestions: string[],
  existingQuestions: { id: number; questionText: string }[],
  threshold: number = 0.7
): DeduplicationResult[] {
  // Pre-tokenize existing questions once (major optimization for large existing sets)
  const allQuestions: TokenizedQuestion[] = preTokenizeQuestions(existingQuestions);

  const results: DeduplicationResult[] = [];
  let nextTempId = -1;

  for (const newText of newQuestions) {
    const newTokens = tokenize(newText);

    let maxSimilarity = 0;
    let mostSimilar: { id: number; questionText: string } | null = null;

    for (const existing of allQuestions) {
      // Use optimized comparison with early termination
      const similarity = jaccardSimilarityWithThreshold(newTokens, existing.tokens, threshold);

      // -1 means skipped due to size pruning or early termination
      if (similarity === -1) continue;

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilar = { id: existing.id, questionText: existing.questionText };
      }
    }

    if (mostSimilar && maxSimilarity >= threshold) {
      results.push({
        accepted: false,
        duplicate: {
          ...mostSimilar,
          similarity: maxSimilarity,
        },
      });
    } else {
      results.push({ accepted: true });
      // Add this question to the pool so subsequent new questions check against it
      allQuestions.push({
        id: nextTempId--,
        questionText: newText,
        tokens: newTokens,
      });
    }
  }

  return results;
}

/**
 * Optimized batch deduplication with pre-tokenized existing questions.
 * Use this when you have a cached set of tokenized questions.
 */
export function deduplicateQuestionsWithCache(
  newQuestions: string[],
  existingTokenized: TokenizedQuestion[],
  threshold: number = 0.7
): DeduplicationResult[] {
  // Clone the array so we can add accepted new questions without mutating input
  const allQuestions = [...existingTokenized];

  const results: DeduplicationResult[] = [];
  let nextTempId = -1;

  for (const newText of newQuestions) {
    const newTokens = tokenize(newText);

    let maxSimilarity = 0;
    let mostSimilar: { id: number; questionText: string } | null = null;

    for (const existing of allQuestions) {
      const similarity = jaccardSimilarityWithThreshold(newTokens, existing.tokens, threshold);

      if (similarity === -1) continue; // Skipped

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilar = { id: existing.id, questionText: existing.questionText };
      }
    }

    if (mostSimilar && maxSimilarity >= threshold) {
      results.push({
        accepted: false,
        duplicate: {
          ...mostSimilar,
          similarity: maxSimilarity,
        },
      });
    } else {
      results.push({ accepted: true });
      allQuestions.push({
        id: nextTempId--,
        questionText: newText,
        tokens: newTokens,
      });
    }
  }

  return results;
}
