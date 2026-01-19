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

interface CacheMetadata {
  lastUpdated: number;
  questionCount: number;
}

interface CachedQuestion extends Question {
  cachedAt: number;
  topicId: number;
}

/**
 * Cache an array of questions for offline use
 * Merges with existing cache, updates existing questions by ID
 */
export async function cacheQuestions(questions: Question[]): Promise<void> {
  if (!questions.length) return;

  const existingQuestions = await getCachedQuestionsInternal();
  const now = Date.now();

  // Create a map of existing questions by ID
  const questionsMap = new Map<number, CachedQuestion>();
  for (const q of existingQuestions) {
    questionsMap.set(q.id, q);
  }

  // Add/update with new questions
  for (const question of questions) {
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
 * Internal helper to get cached questions with type safety
 */
async function getCachedQuestionsInternal(): Promise<CachedQuestion[]> {
  const questions = await get<CachedQuestion[]>(QUESTIONS_KEY, questionsStore);
  return questions ?? [];
}
