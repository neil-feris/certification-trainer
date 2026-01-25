/**
 * Offline Database Service
 *
 * Provides a unified IndexedDB database with multiple object stores for offline functionality:
 * - offlineExams: In-progress offline exam state
 * - syncQueue: Pending API requests for background sync
 * - cacheMetadata: Tracking cached content per certification
 * - cachedQuestions: Pre-cached questions for offline exam use
 *
 * Uses versioned migrations for schema updates.
 */
import type {
  SyncQueueItem,
  SyncQueueItemType,
  SyncQueueItemStatus,
  CacheStatus,
  QuestionWithDomain,
  Difficulty,
} from '@ace-prep/shared';

// Database configuration
const DB_NAME = 'ace-prep-offline';
const DB_VERSION = 2;

// Object store names
export const STORES = {
  OFFLINE_EXAMS: 'offlineExams',
  SYNC_QUEUE: 'syncQueue',
  CACHE_METADATA: 'cacheMetadata',
  CACHED_QUESTIONS: 'cachedQuestions',
} as const;

// Type for offline exam state stored in IndexedDB
export interface OfflineExamState {
  id: string; // Client-generated UUID
  certificationId: number;
  questionIds: number[];
  currentQuestionIndex: number;
  responses: Map<number, number[]>; // questionId -> selectedAnswers
  timeSpentSeconds: number;
  startedAt: string; // ISO date string
  lastUpdatedAt: string; // ISO date string
  status: 'in_progress' | 'completed' | 'abandoned';
}

// Type for serialized offline exam (Maps don't serialize to IndexedDB directly)
interface SerializedOfflineExamState {
  id: string;
  certificationId: number;
  questionIds: number[];
  currentQuestionIndex: number;
  responses: [number, number[]][]; // Array of tuples for Map serialization
  timeSpentSeconds: number;
  startedAt: string;
  lastUpdatedAt: string;
  status: 'in_progress' | 'completed' | 'abandoned';
}

// Database instance cache
let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Opens the database with migration support
 */
function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbInitPromise = null;
      reject(new Error(`Failed to open database: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Handle connection errors
      dbInstance.onerror = (event) => {
        console.error('Database error:', (event.target as IDBDatabase).onerror);
      };

      // Handle database closure (e.g., version change from another tab)
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
        dbInitPromise = null;
      };

      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // Run migrations based on version
      runMigrations(db, oldVersion);
    };
  });

  return dbInitPromise;
}

/**
 * Run database migrations based on version
 */
function runMigrations(db: IDBDatabase, oldVersion: number): void {
  // Version 1: Initial schema
  if (oldVersion < 1) {
    // Create offlineExams store
    if (!db.objectStoreNames.contains(STORES.OFFLINE_EXAMS)) {
      const offlineExamsStore = db.createObjectStore(STORES.OFFLINE_EXAMS, {
        keyPath: 'id',
      });
      offlineExamsStore.createIndex('certificationId', 'certificationId', {
        unique: false,
      });
      offlineExamsStore.createIndex('status', 'status', { unique: false });
      offlineExamsStore.createIndex('startedAt', 'startedAt', { unique: false });
    }

    // Create syncQueue store
    if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
      const syncQueueStore = db.createObjectStore(STORES.SYNC_QUEUE, {
        keyPath: 'id',
      });
      syncQueueStore.createIndex('type', 'type', { unique: false });
      syncQueueStore.createIndex('status', 'status', { unique: false });
      syncQueueStore.createIndex('createdAt', 'createdAt', { unique: false });
    }

    // Create cacheMetadata store
    if (!db.objectStoreNames.contains(STORES.CACHE_METADATA)) {
      db.createObjectStore(STORES.CACHE_METADATA, {
        keyPath: 'certificationId',
      });
    }
  }

  // Version 2: Add cachedQuestions store
  if (oldVersion < 2) {
    if (!db.objectStoreNames.contains(STORES.CACHED_QUESTIONS)) {
      const cachedQuestionsStore = db.createObjectStore(STORES.CACHED_QUESTIONS, {
        keyPath: 'id',
      });
      cachedQuestionsStore.createIndex('certificationId', 'certificationId', { unique: false });
      cachedQuestionsStore.createIndex('domainId', 'domainId', { unique: false });
      cachedQuestionsStore.createIndex('topicId', 'topicId', { unique: false });
      cachedQuestionsStore.createIndex('difficulty', 'difficulty', { unique: false });
    }
  }

  // Future migrations would be added here:
  // if (oldVersion < 3) { ... }
}

/**
 * Helper to get a transaction and object store
 */
async function getStore(
  storeName: string,
  mode: IDBTransactionMode = 'readonly'
): Promise<IDBObjectStore> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

/**
 * Helper to wrap IDBRequest in a Promise
 */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============ OFFLINE EXAMS ============

/**
 * Save an offline exam state
 */
export async function saveOfflineExam(exam: OfflineExamState): Promise<void> {
  const store = await getStore(STORES.OFFLINE_EXAMS, 'readwrite');

  // Serialize the Map to an array of tuples
  const serialized: SerializedOfflineExamState = {
    ...exam,
    responses: Array.from(exam.responses.entries()),
    lastUpdatedAt: new Date().toISOString(),
  };

  await promisifyRequest(store.put(serialized));
}

/**
 * Get an offline exam by ID
 */
export async function getOfflineExam(id: string): Promise<OfflineExamState | null> {
  const store = await getStore(STORES.OFFLINE_EXAMS);
  const result = await promisifyRequest<SerializedOfflineExamState | undefined>(store.get(id));

  if (!result) return null;

  // Deserialize the array of tuples back to a Map
  return {
    ...result,
    responses: new Map(result.responses),
  };
}

/**
 * Get all in-progress offline exams
 */
export async function getInProgressOfflineExams(): Promise<OfflineExamState[]> {
  const store = await getStore(STORES.OFFLINE_EXAMS);
  const index = store.index('status');
  const results = await promisifyRequest<SerializedOfflineExamState[]>(
    index.getAll(IDBKeyRange.only('in_progress'))
  );

  return results.map((result) => ({
    ...result,
    responses: new Map(result.responses),
  }));
}

/**
 * Delete an offline exam
 */
export async function deleteOfflineExam(id: string): Promise<void> {
  const store = await getStore(STORES.OFFLINE_EXAMS, 'readwrite');
  await promisifyRequest(store.delete(id));
}

// ============ SYNC QUEUE ============

/**
 * Generate a unique ID for sync queue items
 */
function generateSyncId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Maximum sync queue size to prevent IndexedDB quota exhaustion
const MAX_QUEUE_SIZE = 500;

/**
 * Queue an item for sync with size limit enforcement.
 * If queue exceeds MAX_QUEUE_SIZE, oldest items are evicted (FIFO).
 */
export async function queueForSync(
  type: SyncQueueItemType,
  payload: Record<string, unknown>
): Promise<string> {
  const db = await openDatabase();

  // Check and enforce queue size limit first
  const currentCount = await new Promise<number>((resolve, reject) => {
    const transaction = db.transaction(STORES.SYNC_QUEUE, 'readonly');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const countRequest = store.count();
    countRequest.onsuccess = () => resolve(countRequest.result);
    countRequest.onerror = () => reject(countRequest.error);
  });

  // If at or over limit, evict oldest items (FIFO)
  if (currentCount >= MAX_QUEUE_SIZE) {
    const evictCount = Math.max(1, currentCount - MAX_QUEUE_SIZE + 1);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const cursorRequest = store.openCursor();
      let evicted = 0;

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && evicted < evictCount) {
          cursor.delete();
          evicted++;
          cursor.continue();
        }
      };
    });
  }

  // Create and add the new item
  const item: SyncQueueItem = {
    id: generateSyncId(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: 'pending',
  };

  const store = await getStore(STORES.SYNC_QUEUE, 'readwrite');
  await promisifyRequest(store.add(item));
  return item.id;
}

/**
 * Get all queued items, optionally filtered by status
 */
export async function getQueuedItems(status?: SyncQueueItemStatus): Promise<SyncQueueItem[]> {
  const store = await getStore(STORES.SYNC_QUEUE);

  if (status) {
    const index = store.index('status');
    return promisifyRequest(index.getAll(IDBKeyRange.only(status)));
  }

  return promisifyRequest(store.getAll());
}

/**
 * Get pending items for sync (status = 'pending'), ordered by createdAt
 */
export async function getPendingItems(): Promise<SyncQueueItem[]> {
  const items = await getQueuedItems('pending');
  // Sort by createdAt for FIFO processing
  return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/**
 * Update a sync queue item
 */
export async function updateQueueItem(item: SyncQueueItem): Promise<void> {
  const store = await getStore(STORES.SYNC_QUEUE, 'readwrite');
  await promisifyRequest(store.put(item));
}

/**
 * Remove an item from the sync queue
 */
export async function removeFromQueue(id: string): Promise<void> {
  const store = await getStore(STORES.SYNC_QUEUE, 'readwrite');
  await promisifyRequest(store.delete(id));
}

/**
 * Get count of pending sync items
 */
export async function getPendingSyncCount(): Promise<number> {
  const store = await getStore(STORES.SYNC_QUEUE);
  const index = store.index('status');
  return promisifyRequest(index.count(IDBKeyRange.only('pending')));
}

/**
 * Move a failed item to dead letter (after max retries)
 */
export async function moveToDeadLetter(id: string, error: string): Promise<void> {
  const store = await getStore(STORES.SYNC_QUEUE, 'readwrite');
  const item = await promisifyRequest<SyncQueueItem | undefined>(store.get(id));

  if (item) {
    item.status = 'dead_letter';
    item.lastError = error;
    item.lastAttemptAt = new Date().toISOString();
    await promisifyRequest(store.put(item));
  }
}

/**
 * Clear all items from sync queue (use with caution)
 */
export async function clearSyncQueue(): Promise<void> {
  const store = await getStore(STORES.SYNC_QUEUE, 'readwrite');
  await promisifyRequest(store.clear());
}

// ============ CACHE METADATA ============

/**
 * Save cache metadata for a certification
 */
export async function saveCacheMetadata(metadata: CacheStatus): Promise<void> {
  const store = await getStore(STORES.CACHE_METADATA, 'readwrite');
  await promisifyRequest(store.put(metadata));
}

/**
 * Get cache metadata for a certification
 */
export async function getCacheMetadata(certificationId: number): Promise<CacheStatus | null> {
  const store = await getStore(STORES.CACHE_METADATA);
  const result = await promisifyRequest<CacheStatus | undefined>(store.get(certificationId));
  return result ?? null;
}

/**
 * Get all cache metadata
 */
export async function getAllCacheMetadata(): Promise<CacheStatus[]> {
  const store = await getStore(STORES.CACHE_METADATA);
  return promisifyRequest(store.getAll());
}

/**
 * Delete cache metadata for a certification
 */
export async function deleteCacheMetadata(certificationId: number): Promise<void> {
  const store = await getStore(STORES.CACHE_METADATA, 'readwrite');
  await promisifyRequest(store.delete(certificationId));
}

// ============ CACHED QUESTIONS ============

/**
 * Cached question with certification ID for indexing
 */
export interface CachedQuestion extends QuestionWithDomain {
  certificationId: number;
}

/**
 * Filter options for retrieving cached questions
 */
export interface CachedQuestionFilters {
  domainId?: number;
  topicId?: number;
  difficulty?: Difficulty;
  limit?: number;
  excludeIds?: number[];
}

/**
 * Save multiple questions to the cache
 */
export async function saveCachedQuestions(
  certificationId: number,
  questions: QuestionWithDomain[]
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CACHED_QUESTIONS, 'readwrite');
    const store = transaction.objectStore(STORES.CACHED_QUESTIONS);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    for (const question of questions) {
      const cachedQuestion: CachedQuestion = {
        ...question,
        certificationId,
      };
      store.put(cachedQuestion);
    }
  });
}

/**
 * Get cached questions for a certification with optional filters
 */
export async function getCachedQuestions(
  certificationId: number,
  filters?: CachedQuestionFilters
): Promise<QuestionWithDomain[]> {
  const store = await getStore(STORES.CACHED_QUESTIONS);
  const index = store.index('certificationId');
  const results = await promisifyRequest<CachedQuestion[]>(
    index.getAll(IDBKeyRange.only(certificationId))
  );

  let filtered = results;

  // Apply filters
  if (filters?.domainId) {
    filtered = filtered.filter((q) => q.domainId === filters.domainId);
  }
  if (filters?.topicId) {
    filtered = filtered.filter((q) => q.topicId === filters.topicId);
  }
  if (filters?.difficulty) {
    filtered = filtered.filter((q) => q.difficulty === filters.difficulty);
  }
  if (filters?.excludeIds && filters.excludeIds.length > 0) {
    const excludeSet = new Set(filters.excludeIds);
    filtered = filtered.filter((q) => !excludeSet.has(q.id));
  }

  // Apply limit
  if (filters?.limit && filters.limit > 0) {
    filtered = filtered.slice(0, filters.limit);
  }

  // Return as QuestionWithDomain (strip certificationId)
  return filtered.map(({ certificationId: _, ...question }) => question);
}

/**
 * Get count of cached questions for a certification
 */
export async function getCachedQuestionCount(certificationId: number): Promise<number> {
  const store = await getStore(STORES.CACHED_QUESTIONS);
  const index = store.index('certificationId');
  return promisifyRequest(index.count(IDBKeyRange.only(certificationId)));
}

/**
 * Delete all cached questions for a certification
 */
export async function deleteCachedQuestions(certificationId: number): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CACHED_QUESTIONS, 'readwrite');
    const store = transaction.objectStore(STORES.CACHED_QUESTIONS);
    const index = store.index('certificationId');

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    const request = index.openCursor(IDBKeyRange.only(certificationId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all cached questions (all certifications)
 */
export async function clearAllCachedQuestions(): Promise<void> {
  const store = await getStore(STORES.CACHED_QUESTIONS, 'readwrite');
  await promisifyRequest(store.clear());
}

// ============ DATABASE MANAGEMENT ============

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbInitPromise = null;
  }
}

/**
 * Delete the entire database (use with extreme caution)
 */
export function deleteDatabase(): Promise<void> {
  closeDatabase();

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  offlineExamCount: number;
  pendingSyncCount: number;
  cacheMetadataCount: number;
  cachedQuestionCount: number;
}> {
  const db = await openDatabase();

  const getCount = (storeName: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const [offlineExamCount, pendingSyncCount, cacheMetadataCount, cachedQuestionCount] =
    await Promise.all([
      getCount(STORES.OFFLINE_EXAMS),
      getPendingSyncCount(),
      getCount(STORES.CACHE_METADATA),
      getCount(STORES.CACHED_QUESTIONS),
    ]);

  return {
    offlineExamCount,
    pendingSyncCount,
    cacheMetadataCount,
    cachedQuestionCount,
  };
}

/**
 * Clear all user-specific data from IndexedDB.
 * SECURITY: Call this on logout to remove sensitive data like cached questions
 * (which contain correctAnswers) and offline exam progress.
 */
export async function clearAllUserData(): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.OFFLINE_EXAMS, STORES.SYNC_QUEUE, STORES.CACHE_METADATA, STORES.CACHED_QUESTIONS],
      'readwrite'
    );

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    // Clear all user data stores
    transaction.objectStore(STORES.OFFLINE_EXAMS).clear();
    transaction.objectStore(STORES.SYNC_QUEUE).clear();
    transaction.objectStore(STORES.CACHE_METADATA).clear();
    transaction.objectStore(STORES.CACHED_QUESTIONS).clear();
  });
}
