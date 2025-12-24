/**
 * Text similarity utilities for question deduplication.
 * Uses Jaccard similarity on tokenized question text.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can',
  'just', 'should', 'now', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom', 'if', 'your', 'you', 'we', 'they',
  'it', 'its', 'my', 'our', 'their', 'his', 'her', 'i', 'me', 'him',
]);

/**
 * Tokenizes text: lowercase, remove punctuation, split on whitespace,
 * filter stopwords, return unique word set.
 */
export function tokenize(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1 && !STOPWORDS.has(word));

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
  for (const item of setA) {
    if (setB.has(item)) {
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
 * Batch check multiple questions against existing questions.
 * Returns results for each question indicating if it should be accepted.
 */
export function deduplicateQuestions(
  newQuestions: string[],
  existingQuestions: { id: number; questionText: string }[],
  threshold: number = 0.7
): DeduplicationResult[] {
  // Build mutable list of all questions to check against (existing + already accepted new ones)
  const allQuestions = existingQuestions.map(q => ({
    id: q.id,
    questionText: q.questionText,
    tokens: tokenize(q.questionText),
  }));

  const results: DeduplicationResult[] = [];
  let nextTempId = -1;

  for (const newText of newQuestions) {
    const newTokens = tokenize(newText);

    let maxSimilarity = 0;
    let mostSimilar: { id: number; questionText: string } | null = null;

    for (const existing of allQuestions) {
      const similarity = jaccardSimilarity(newTokens, existing.tokens);

      if (similarity >= threshold && similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilar = { id: existing.id, questionText: existing.questionText };
      }
    }

    if (mostSimilar) {
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
