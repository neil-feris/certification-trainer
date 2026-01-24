/**
 * Sync Queue Service
 * Queues study responses for offline use and syncs when back online
 */
import { createStore, get, set } from 'idb-keyval';

// Create a custom store namespaced for sync queue
const syncStore = createStore('ace-prep-sync-db', 'ace-prep-sync-queue');

// Key for the queue
const QUEUE_KEY = 'pending-responses';

export interface OfflineSessionContext {
  certificationId?: number;
  sessionType: 'topic_practice' | 'learning_path';
  topicId?: number;
  domainId?: number;
  questionCount: number;
}

export interface QueuedResponse {
  id: string;
  sessionId: number;
  questionId: number;
  selectedAnswers: number[];
  timeSpentSeconds: number;
  queuedAt: number;
  retryCount: number;
  // For offline sessions, we need context to create the server session
  offlineSessionContext?: OfflineSessionContext;
  // Type of response: 'session' for study sessions, 'review' for spaced repetition
  responseType: 'session' | 'review';
  // Quality rating for review responses (again/hard/good/easy)
  quality?: 'again' | 'hard' | 'good' | 'easy';
}

/**
 * Queue a study response for later sync
 */
export async function queueResponse(response: {
  sessionId: number;
  questionId: number;
  selectedAnswers: number[];
  timeSpentSeconds: number;
  offlineSessionContext?: OfflineSessionContext;
  responseType?: 'session' | 'review';
  quality?: 'again' | 'hard' | 'good' | 'easy';
}): Promise<void> {
  const queue = await getQueue();

  // Use deterministic ID for idempotency - prevents duplicate entries
  const id = `${response.sessionId}-${response.questionId}`;
  const existingIndex = queue.findIndex((item) => item.id === id);

  const queuedItem: QueuedResponse = {
    id,
    sessionId: response.sessionId,
    questionId: response.questionId,
    selectedAnswers: response.selectedAnswers,
    timeSpentSeconds: response.timeSpentSeconds,
    queuedAt: Date.now(),
    retryCount: 0,
    offlineSessionContext: response.offlineSessionContext,
    responseType: response.responseType ?? 'session',
    quality: response.quality,
  };

  if (existingIndex >= 0) {
    // Update existing entry instead of creating duplicate
    queue[existingIndex] = queuedItem;
  } else {
    queue.push(queuedItem);
  }
  await set(QUEUE_KEY, queue, syncStore);
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(retryCount: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max)
  const baseDelay = 1000;
  const maxDelay = 16000;
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
  // Add jitter (0-500ms) to prevent thundering herd
  return delay + Math.random() * 500;
}

/**
 * Sleep helper for backoff delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a server session for offline responses
 */
async function createServerSession(context: OfflineSessionContext): Promise<number | null> {
  try {
    const response = await fetch('/api/study/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        certificationId: context.certificationId,
        sessionType: context.sessionType,
        topicId: context.topicId,
        domainId: context.domainId,
        questionCount: context.questionCount,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.sessionId;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Submit a review response (spaced repetition)
 */
async function submitReviewResponse(item: QueuedResponse): Promise<boolean> {
  if (!item.quality) {
    console.error('Review response missing quality rating');
    return false;
  }
  try {
    const response = await fetch('/api/questions/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        questionId: item.questionId,
        quality: item.quality,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Submit a session response
 */
async function submitSessionResponse(
  sessionId: number,
  item: QueuedResponse
): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch(`/api/study/sessions/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        questionId: item.questionId,
        selectedAnswers: item.selectedAnswers,
        timeSpentSeconds: item.timeSpentSeconds,
      }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Flush the queue by POSTing all queued items when online
 * Handles offline sessions by creating server sessions first
 * Uses exponential backoff on failure
 */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  if (!navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  const queue = await getQueue();
  if (queue.length === 0) {
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;
  const remainingItems: QueuedResponse[] = [];

  // Local map to track offline session ID -> server session ID mapping
  // Scoped to this flush to prevent cross-tab/concurrent flush corruption
  const offlineToServerSessionMap = new Map<number, number>();

  // Group offline session items by their offline session ID
  const offlineSessionItems = new Map<number, QueuedResponse[]>();
  const regularItems: QueuedResponse[] = [];

  for (const item of queue) {
    if (item.sessionId < 0 && item.responseType === 'session') {
      // Offline session response
      const items = offlineSessionItems.get(item.sessionId) || [];
      items.push(item);
      offlineSessionItems.set(item.sessionId, items);
    } else {
      regularItems.push(item);
    }
  }

  // Process offline sessions first - create server session, then sync responses
  for (const [offlineSessionId, items] of offlineSessionItems) {
    // Check if we already have a server session ID mapped
    let serverSessionId = offlineToServerSessionMap.get(offlineSessionId);

    // Create server session if we don't have one yet
    if (!serverSessionId) {
      const context = items[0]?.offlineSessionContext;
      if (context) {
        serverSessionId = (await createServerSession(context)) ?? undefined;
        if (serverSessionId) {
          offlineToServerSessionMap.set(offlineSessionId, serverSessionId);
        }
      }
    }

    // If we couldn't create a server session, keep items for retry
    if (!serverSessionId) {
      for (const item of items) {
        item.retryCount++;
        if (item.retryCount < 5) {
          remainingItems.push(item);
        } else {
          failed++;
        }
      }
      continue;
    }

    // Submit all responses for this offline session
    for (const item of items) {
      if (item.retryCount > 0) {
        await sleep(getBackoffDelay(item.retryCount - 1));
      }

      const result = await submitSessionResponse(serverSessionId, item);

      if (result.ok) {
        synced++;
      } else if (result.status >= 400 && result.status < 500) {
        failed++;
      } else {
        item.retryCount++;
        if (item.retryCount < 5) {
          remainingItems.push(item);
        } else {
          failed++;
        }
      }
    }
  }

  // Process regular items (online sessions and review responses)
  for (const item of regularItems) {
    if (item.retryCount > 0) {
      await sleep(getBackoffDelay(item.retryCount - 1));
    }

    let success = false;
    let status = 0;

    if (item.responseType === 'review') {
      // Review response - use review endpoint
      success = await submitReviewResponse(item);
      status = success ? 200 : 500;
    } else {
      // Regular session response
      const result = await submitSessionResponse(item.sessionId, item);
      success = result.ok;
      status = result.status;
    }

    if (success) {
      synced++;
    } else if (status >= 400 && status < 500) {
      failed++;
    } else {
      item.retryCount++;
      if (item.retryCount < 5) {
        remainingItems.push(item);
      } else {
        failed++;
      }
    }
  }

  // Update queue with remaining items
  await set(QUEUE_KEY, remainingItems, syncStore);

  return { synced, failed };
}

/**
 * Get the current queue length
 */
export async function getQueueLength(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

/**
 * Clear the entire queue (use with caution)
 */
export async function clearQueue(): Promise<void> {
  await set(QUEUE_KEY, [], syncStore);
}

/**
 * Internal helper to get the queue with type safety
 */
async function getQueue(): Promise<QueuedResponse[]> {
  const queue = await get<QueuedResponse[]>(QUEUE_KEY, syncStore);
  return queue ?? [];
}

// NOTE: Auto-flush on 'online' event is handled by the useSyncQueue hook
// to avoid duplicate flush attempts. Do not add a global listener here.
