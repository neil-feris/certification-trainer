/**
 * Offline Storage Service
 * Caches questions for offline use in IndexedDB via idb-keyval
 */
import { createStore, get, set, del } from 'idb-keyval';
import type { Question } from '@ace-prep/shared';

// Create a custom store namespaced for ace-prep
const questionsStore = createStore('ace-prep-db', 'ace-prep-questions');

// Key format for stored questions
const QUESTIONS_KEY = 'cached-questions';
const CACHE_METADATA_KEY = 'cache-metadata';

// Maximum allowed string length for text fields (prevent XSS with huge payloads)
const MAX_TEXT_LENGTH = 10000;
const MAX_OPTION_LENGTH = 2000;
const MAX_OPTIONS_COUNT = 10;

interface CacheMetadata {
  lastUpdated: number;
  questionCount: number;
}

interface CachedQuestion extends Question {
  cachedAt: number;
  topicId: number;
}

/**
 * Validate a question object to prevent storing malformed or malicious data
 * Returns true if valid, false otherwise
 */
function isValidQuestion(q: unknown): q is Question {
  if (!q || typeof q !== 'object') return false;

  const question = q as Record<string, unknown>;

  // Required fields with type checks
  if (typeof question.id !== 'number' || !Number.isFinite(question.id)) return false;
  if (typeof question.questionText !== 'string') return false;
  if (question.questionText.length > MAX_TEXT_LENGTH) return false;

  if (question.questionType !== 'single' && question.questionType !== 'multiple') return false;

  // Validate options array
  if (!Array.isArray(question.options)) return false;
  if (question.options.length > MAX_OPTIONS_COUNT) return false;
  for (const opt of question.options) {
    if (typeof opt !== 'string' || opt.length > MAX_OPTION_LENGTH) return false;
  }

  // Validate correctAnswers array
  if (!Array.isArray(question.correctAnswers)) return false;
  for (const ans of question.correctAnswers) {
    if (typeof ans !== 'number' || !Number.isFinite(ans)) return false;
  }

  // Validate optional string fields
  if (question.explanation !== undefined) {
    if (typeof question.explanation !== 'string' || question.explanation.length > MAX_TEXT_LENGTH) {
      return false;
    }
  }

  if (question.difficulty !== undefined && typeof question.difficulty !== 'string') {
    return false;
  }

  // Validate numeric IDs
  if (question.topicId !== undefined && typeof question.topicId !== 'number') return false;
  if (question.domainId !== undefined && typeof question.domainId !== 'number') return false;

  return true;
}

/**
 * Validate a cached question (has cachedAt field)
 */
function isValidCachedQuestion(q: unknown): q is CachedQuestion {
  if (!isValidQuestion(q)) return false;
  const cached = q as unknown as Record<string, unknown>;
  return typeof cached.cachedAt === 'number' && Number.isFinite(cached.cachedAt);
}

/**
 * Cache an array of questions for offline use
 * Merges with existing cache, updates existing questions by ID
 * Invalid questions are silently skipped to prevent cache corruption
 */
export async function cacheQuestions(questions: Question[]): Promise<void> {
  if (!questions.length) return;

  // Filter out invalid questions before caching
  const validQuestions = questions.filter((q) => isValidQuestion(q));
  if (!validQuestions.length) return;

  const existingQuestions = await getCachedQuestionsInternal();
  const now = Date.now();

  // Create a map of existing questions by ID
  const questionsMap = new Map<number, CachedQuestion>();
  for (const q of existingQuestions) {
    questionsMap.set(q.id, q);
  }

  // Add/update with new validated questions
  for (const question of validQuestions) {
    questionsMap.set(question.id, {
      ...question,
      cachedAt: now,
    });
  }

  const cachedQuestions = Array.from(questionsMap.values());

  // Store questions
  await set(QUESTIONS_KEY, cachedQuestions, questionsStore);

  // Update metadata
  const metadata: CacheMetadata = {
    lastUpdated: now,
    questionCount: cachedQuestions.length,
  };
  await set(CACHE_METADATA_KEY, metadata, questionsStore);
}

/**
 * Get cached questions, optionally filtered by topic ID
 */
export async function getCachedQuestions(topicId?: number): Promise<Question[]> {
  const questions = await getCachedQuestionsInternal();

  if (topicId !== undefined) {
    return questions.filter((q) => q.topicId === topicId);
  }

  return questions;
}

/**
 * Get the count of cached questions
 */
export async function getCachedQuestionCount(): Promise<number> {
  const metadata = await get<CacheMetadata>(CACHE_METADATA_KEY, questionsStore);
  return metadata?.questionCount ?? 0;
}

/**
 * Clear questions older than maxAge milliseconds
 * @param maxAge Maximum age in milliseconds (default: 7 days)
 */
export async function clearOldCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const questions = await getCachedQuestionsInternal();
  const cutoff = Date.now() - maxAge;

  const freshQuestions = questions.filter((q) => q.cachedAt > cutoff);

  if (freshQuestions.length !== questions.length) {
    await set(QUESTIONS_KEY, freshQuestions, questionsStore);

    const metadata: CacheMetadata = {
      lastUpdated: Date.now(),
      questionCount: freshQuestions.length,
    };
    await set(CACHE_METADATA_KEY, metadata, questionsStore);
  }
}

/**
 * Clear all cached questions
 */
export async function clearCache(): Promise<void> {
  await del(QUESTIONS_KEY, questionsStore);
  await del(CACHE_METADATA_KEY, questionsStore);
}

/**
 * Prune cache to keep only the most recent questions up to maxCount
 * @param maxCount Maximum number of questions to keep (default: 500)
 */
export async function pruneCache(maxCount: number = 500): Promise<number> {
  const questions = await getCachedQuestionsInternal();

  if (questions.length <= maxCount) {
    return 0;
  }

  // Sort by cachedAt descending (newest first) and keep only maxCount
  const sorted = questions.sort((a, b) => b.cachedAt - a.cachedAt);
  const pruned = sorted.slice(0, maxCount);
  const removedCount = questions.length - pruned.length;

  await set(QUESTIONS_KEY, pruned, questionsStore);

  const metadata: CacheMetadata = {
    lastUpdated: Date.now(),
    questionCount: pruned.length,
  };
  await set(CACHE_METADATA_KEY, metadata, questionsStore);

  return removedCount;
}

/**
 * Internal helper to get cached questions with type safety and validation
 * Filters out any corrupted or invalid questions from the cache
 */
async function getCachedQuestionsInternal(): Promise<CachedQuestion[]> {
  const questions = await get<unknown[]>(QUESTIONS_KEY, questionsStore);
  if (!Array.isArray(questions)) return [];

  // Validate each question on retrieval to protect against cache tampering
  return questions.filter((q): q is CachedQuestion => isValidCachedQuestion(q));
}
