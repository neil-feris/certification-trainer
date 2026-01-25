/**
 * Question Pre-caching Service
 *
 * Provides pre-caching of questions for offline exam use.
 * Features:
 * - Fetch and store questions for offline use
 * - Default cache of 100 questions per certification
 * - 7-day cache expiration
 * - Filter-based retrieval of cached questions
 * - Cache management (clear, status)
 */
import * as Sentry from '@sentry/react';
import type { QuestionWithDomain, CacheStatus } from '@ace-prep/shared';
import {
  saveCachedQuestions,
  getCachedQuestions as getQuestionsFromDb,
  deleteCachedQuestions,
  saveCacheMetadata,
  getCacheMetadata,
  getAllCacheMetadata,
  deleteCacheMetadata,
  type CachedQuestionFilters,
} from './offlineDb';
import { useAuthStore } from '../stores/authStore';

// Constants
const DEFAULT_CACHE_COUNT = 100;
const CACHE_EXPIRATION_DAYS = 7;
const API_BASE = '/api';

// Cache events
export const CACHE_EVENTS = {
  CACHE_STARTED: 'ace:cache:started',
  CACHE_PROGRESS: 'ace:cache:progress',
  CACHE_COMPLETED: 'ace:cache:completed',
  CACHE_FAILED: 'ace:cache:failed',
  CACHE_CLEARED: 'ace:cache:cleared',
} as const;

// Event detail interfaces
export interface CacheProgressEventDetail {
  certificationId: number;
  fetched: number;
  total: number;
  percentComplete: number;
}

export interface CacheCompletedEventDetail {
  certificationId: number;
  questionCount: number;
  cachedAt: Date;
  expiresAt: Date;
}

export interface CacheFailedEventDetail {
  certificationId: number;
  error: string;
}

/**
 * Type guard for browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/**
 * Dispatch a custom cache event
 */
function dispatchCacheEvent<T>(eventType: string, detail: T): void {
  if (!isBrowser()) return;
  const event = new CustomEvent(eventType, { detail });
  window.dispatchEvent(event);
}

/**
 * Fetch questions for caching from the server
 */
async function fetchQuestionsForCache(
  certificationId: number,
  count: number
): Promise<QuestionWithDomain[]> {
  const token = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(
    `${API_BASE}/questions/bulk?certificationId=${certificationId}&limit=${count}`,
    {
      method: 'GET',
      headers,
      credentials: 'include',
    }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorBody.message || errorBody.error || `HTTP ${response.status}`);
  }

  const data: { questions: QuestionWithDomain[] } = await response.json();
  return data.questions;
}

/**
 * Calculate expiration date (7 days from now)
 */
function calculateExpirationDate(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CACHE_EXPIRATION_DAYS);
  return expiresAt;
}

/**
 * Check if a cache entry is expired
 */
function isCacheExpired(expiresAt: Date | string): boolean {
  const expiration = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return expiration < new Date();
}

/**
 * Cache questions for a certification
 * @param certificationId The certification ID
 * @param count Number of questions to cache (default: 100)
 * @returns Cache status after caching
 */
export async function cacheQuestionsForCertification(
  certificationId: number,
  count: number = DEFAULT_CACHE_COUNT
): Promise<CacheStatus> {
  const { logger } = Sentry;

  logger.info('Starting question cache', { certificationId, count });

  dispatchCacheEvent(CACHE_EVENTS.CACHE_STARTED, {
    certificationId,
    requestedCount: count,
  });

  try {
    // Fetch questions from server
    const questions = await fetchQuestionsForCache(certificationId, count);

    if (questions.length === 0) {
      throw new Error('No questions available for caching');
    }

    // Clear existing cache for this certification
    await deleteCachedQuestions(certificationId);
    await deleteCacheMetadata(certificationId);

    // Save questions to IndexedDB
    await saveCachedQuestions(certificationId, questions);

    // Calculate expiration
    const cachedAt = new Date();
    const expiresAt = calculateExpirationDate();

    // Save cache metadata
    const cacheStatus: CacheStatus = {
      certificationId,
      questionCount: questions.length,
      cachedAt: cachedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isExpired: false,
    };

    await saveCacheMetadata(cacheStatus);

    dispatchCacheEvent(CACHE_EVENTS.CACHE_COMPLETED, {
      certificationId,
      questionCount: questions.length,
      cachedAt,
      expiresAt,
    } as CacheCompletedEventDetail);

    logger.info('Question cache completed', {
      certificationId,
      questionCount: questions.length,
    });

    Sentry.addBreadcrumb({
      category: 'cache',
      message: `Cached ${questions.length} questions for certification ${certificationId}`,
      level: 'info',
    });

    return cacheStatus;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    dispatchCacheEvent(CACHE_EVENTS.CACHE_FAILED, {
      certificationId,
      error: errorMessage,
    } as CacheFailedEventDetail);

    logger.error('Question cache failed', { certificationId, error: errorMessage });

    Sentry.captureException(error, {
      extra: {
        certificationId,
        requestedCount: count,
        context: 'cache_questions',
      },
    });

    throw error;
  }
}

/**
 * Get cached questions for a certification with optional filters
 * @param certificationId The certification ID
 * @param filters Optional filters for domain, topic, difficulty, etc.
 * @returns Array of cached questions
 */
export async function getCachedQuestions(
  certificationId: number,
  filters?: CachedQuestionFilters
): Promise<QuestionWithDomain[]> {
  // Check if cache exists and is not expired
  const metadata = await getCacheMetadata(certificationId);

  if (!metadata) {
    return [];
  }

  if (isCacheExpired(metadata.expiresAt)) {
    Sentry.addBreadcrumb({
      category: 'cache',
      message: `Cache expired for certification ${certificationId}`,
      level: 'warning',
    });
    return [];
  }

  return getQuestionsFromDb(certificationId, filters);
}

/**
 * Clear the cache for a specific certification
 * @param certificationId The certification ID
 */
export async function clearCache(certificationId: number): Promise<void> {
  const { logger } = Sentry;

  logger.info('Clearing cache', { certificationId });

  await deleteCachedQuestions(certificationId);
  await deleteCacheMetadata(certificationId);

  dispatchCacheEvent(CACHE_EVENTS.CACHE_CLEARED, {
    certificationId,
    timestamp: new Date(),
  });

  Sentry.addBreadcrumb({
    category: 'cache',
    message: `Cleared cache for certification ${certificationId}`,
    level: 'info',
  });
}

/**
 * Get cache status for a certification
 * @param certificationId The certification ID
 * @returns Cache status or null if not cached
 */
export async function getCacheStatus(certificationId: number): Promise<CacheStatus | null> {
  const metadata = await getCacheMetadata(certificationId);

  if (!metadata) {
    return null;
  }

  // Add isExpired flag
  return {
    ...metadata,
    isExpired: isCacheExpired(metadata.expiresAt),
  };
}

/**
 * Get cache status for all certifications
 * @returns Array of cache status for all cached certifications
 */
export async function getAllCacheStatus(): Promise<CacheStatus[]> {
  const allMetadata = await getAllCacheMetadata();

  return allMetadata.map((metadata) => ({
    ...metadata,
    isExpired: isCacheExpired(metadata.expiresAt),
  }));
}

/**
 * Check if a certification has valid (non-expired) cached questions
 * @param certificationId The certification ID
 * @returns True if valid cache exists
 */
export async function hasValidCache(certificationId: number): Promise<boolean> {
  const status = await getCacheStatus(certificationId);
  return status !== null && !status.isExpired && status.questionCount > 0;
}

/**
 * Refresh cache if expired, otherwise return existing cache status
 * @param certificationId The certification ID
 * @param count Number of questions to cache if refresh needed
 * @returns Cache status
 */
export async function refreshCacheIfNeeded(
  certificationId: number,
  count: number = DEFAULT_CACHE_COUNT
): Promise<CacheStatus | null> {
  const status = await getCacheStatus(certificationId);

  if (!status || status.isExpired) {
    // Check if online before attempting to refresh
    if (isBrowser() && !navigator.onLine) {
      // Can't refresh while offline
      return status;
    }

    try {
      return await cacheQuestionsForCertification(certificationId, count);
    } catch {
      // If refresh fails while we have an expired cache, return the expired status
      // UI can decide whether to use expired cache or not
      return status;
    }
  }

  return status;
}

/**
 * Get estimated storage size for cached questions (in bytes)
 * Note: This is an approximation based on JSON serialization
 */
export async function getEstimatedStorageSize(): Promise<number> {
  if (!isBrowser() || !('storage' in navigator) || !('estimate' in navigator.storage)) {
    return 0;
  }

  try {
    const estimate = await navigator.storage.estimate();
    // This gives total quota and usage, not specific to our cache
    // For more accurate per-store measurement, we'd need to iterate and measure
    return estimate.usage || 0;
  } catch {
    return 0;
  }
}

// Export the CacheService as a singleton-like object for convenient access
export const CacheService = {
  cacheQuestionsForCertification,
  getCachedQuestions,
  clearCache,
  getCacheStatus,
  getAllCacheStatus,
  hasValidCache,
  refreshCacheIfNeeded,
  getEstimatedStorageSize,
  EVENTS: CACHE_EVENTS,
  DEFAULT_CACHE_COUNT,
  CACHE_EXPIRATION_DAYS,
} as const;

export default CacheService;
