/**
 * Sync Queue Service
 * Queues study responses for offline use and syncs when back online
 */
import { createStore, get, set } from 'idb-keyval';

// Create a custom store namespaced for sync queue
const syncStore = createStore('ace-prep-db', 'ace-prep-sync-queue');

// Key for the queue
const QUEUE_KEY = 'pending-responses';

export interface QueuedResponse {
  id: string;
  sessionId: number;
  questionId: number;
  selectedAnswers: number[];
  timeSpentSeconds: number;
  queuedAt: number;
  retryCount: number;
}

/**
 * Queue a study response for later sync
 */
export async function queueResponse(response: {
  sessionId: number;
  questionId: number;
  selectedAnswers: number[];
  timeSpentSeconds: number;
}): Promise<void> {
  const queue = await getQueue();

  const queuedItem: QueuedResponse = {
    id: `${response.sessionId}-${response.questionId}-${Date.now()}`,
    sessionId: response.sessionId,
    questionId: response.questionId,
    selectedAnswers: response.selectedAnswers,
    timeSpentSeconds: response.timeSpentSeconds,
    queuedAt: Date.now(),
    retryCount: 0,
  };

  queue.push(queuedItem);
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
 * Flush the queue by POSTing all queued items when online
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

  for (const item of queue) {
    // Apply exponential backoff delay if this is a retry
    if (item.retryCount > 0) {
      await sleep(getBackoffDelay(item.retryCount - 1));
    }

    try {
      const response = await fetch(`/api/study/sessions/${item.sessionId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          questionId: item.questionId,
          selectedAnswers: item.selectedAnswers,
          timeSpentSeconds: item.timeSpentSeconds,
        }),
      });

      if (response.ok) {
        synced++;
      } else if (response.status >= 400 && response.status < 500) {
        // Client error (4xx) - don't retry, discard the item
        failed++;
      } else {
        // Server error (5xx) - retry with backoff
        item.retryCount++;
        if (item.retryCount < 5) {
          remainingItems.push(item);
        } else {
          failed++;
        }
      }
    } catch {
      // Network error - keep in queue for retry
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

// Auto-flush when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Delay slightly to ensure connection is stable
    setTimeout(() => {
      flushQueue().catch((err) => {
        console.error('Failed to flush sync queue:', err);
      });
    }, 1000);
  });
}
