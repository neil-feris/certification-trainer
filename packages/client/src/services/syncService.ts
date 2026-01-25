/**
 * Background Sync Service
 *
 * Handles processing of queued offline operations when connectivity is restored.
 * Features:
 * - FIFO queue processing
 * - Exponential backoff on failure (max 5 retries)
 * - Dead letter queue for permanently failed items
 * - Custom events for sync lifecycle
 * - Online/offline state management
 */
import * as Sentry from '@sentry/react';
import type { SyncQueueItem, SyncQueueItemType, OfflineStatus } from '@ace-prep/shared';
import {
  getPendingItems,
  updateQueueItem,
  removeFromQueue,
  moveToDeadLetter,
  getPendingSyncCount,
} from './offlineDb';
import { useAuthStore } from '../stores/authStore';

// Constants
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000; // 1 second
const MAX_DELAY_MS = 60000; // 60 seconds
const SYNC_TAG = 'ace-offline-sync';

// API base URL
const API_BASE = '/api';

// Custom event types
export const SYNC_EVENTS = {
  SYNC_STARTED: 'ace:sync:started',
  SYNC_COMPLETED: 'ace:sync:completed',
  SYNC_ITEM_SUCCESS: 'ace:sync:item:success',
  SYNC_ITEM_FAILED: 'ace:sync:item:failed',
  SYNC_ITEM_DEAD_LETTER: 'ace:sync:item:dead-letter',
  ONLINE_STATUS_CHANGED: 'ace:online-status-changed',
} as const;

// Sync result interface
export interface SyncResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  movedToDeadLetter: number;
  alreadySynced: number; // Items that were already synced (conflict resolved)
}

// Event detail interfaces
export interface SyncCompletedEventDetail {
  result: SyncResult;
  timestamp: Date;
}

export interface SyncItemEventDetail {
  item: SyncQueueItem;
  error?: string;
  alreadySynced?: boolean; // True if this was a duplicate/conflict resolved
  serverResponse?: Record<string, unknown>; // Server response data
}

export interface OnlineStatusEventDetail {
  isOnline: boolean;
  timestamp: Date;
}

// Type guard for checking if we're in a browser environment
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/**
 * Calculate exponential backoff delay
 * @param retryCount Current retry count (0-indexed)
 * @returns Delay in milliseconds with jitter
 */
function calculateBackoffDelay(retryCount: number): number {
  // Exponential backoff: 2^retryCount * baseDelay
  const exponentialDelay = Math.pow(2, retryCount) * BASE_DELAY_MS;

  // Cap the delay at MAX_DELAY_MS
  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);

  // Add jitter (random value between 0-25% of the delay) to prevent thundering herd
  const jitter = Math.random() * cappedDelay * 0.25;

  return Math.floor(cappedDelay + jitter);
}

/**
 * Dispatch a custom event on the window
 */
function dispatchSyncEvent<T>(eventType: string, detail: T): void {
  if (!isBrowser()) return;

  const event = new CustomEvent(eventType, { detail });
  window.dispatchEvent(event);
}

/**
 * Get the API endpoint for a sync queue item type
 */
function getEndpointForType(type: SyncQueueItemType): string {
  switch (type) {
    case 'exam_submission':
      return '/exams/offline-submit';
    case 'study_session':
      return '/study/sessions/offline-submit';
    case 'drill_result':
      return '/drills/offline-submit';
    case 'flashcard_rating':
      return '/study/flashcards/offline-rate';
    default:
      throw new Error(`Unknown sync queue item type: ${type}`);
  }
}

// Response type for sendToServer
interface SendToServerResult {
  success: boolean;
  error?: string;
  alreadySynced?: boolean;
  serverResponse?: Record<string, unknown>;
}

/**
 * Send a single sync item to the server
 */
async function sendToServer(item: SyncQueueItem): Promise<SendToServerResult> {
  const endpoint = getEndpointForType(item.type);
  const token = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        ...item.payload,
        syncQueueItemId: item.id,
        clientTimestamp: item.createdAt,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Unknown error' }));
      const errorMessage = errorBody.message || errorBody.error || `HTTP ${response.status}`;

      // Check for permanent failures (don't retry these)
      if (response.status === 400 || response.status === 404 || response.status === 409) {
        // 400: Bad Request - payload is invalid
        // 404: Resource not found
        // 409: Conflict - already processed (duplicate)
        return { success: false, error: `Permanent failure: ${errorMessage}` };
      }

      return { success: false, error: errorMessage };
    }

    // Parse success response to check for alreadySynced flag (conflict resolution)
    const responseBody = await response.json().catch(() => ({ success: true }));
    const alreadySynced = responseBody.alreadySynced === true;

    return {
      success: true,
      alreadySynced,
      serverResponse: responseBody,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    return { success: false, error: errorMessage };
  }
}

// Result type for processItem
interface ProcessItemResult {
  success: boolean;
  movedToDeadLetter: boolean;
  alreadySynced: boolean;
}

/**
 * Process a single queue item with retry logic
 */
async function processItem(item: SyncQueueItem): Promise<ProcessItemResult> {
  // Check if item has exceeded max retries
  if (item.retryCount >= MAX_RETRIES) {
    const errorMessage = `Exceeded maximum retries (${MAX_RETRIES})`;
    await moveToDeadLetter(item.id, item.lastError || errorMessage);

    dispatchSyncEvent(SYNC_EVENTS.SYNC_ITEM_DEAD_LETTER, {
      item,
      error: errorMessage,
    } as SyncItemEventDetail);

    Sentry.addBreadcrumb({
      category: 'sync',
      message: `Item moved to dead letter: ${item.id}`,
      level: 'warning',
      data: {
        type: item.type,
        retryCount: item.retryCount,
        lastError: item.lastError,
      },
    });

    return { success: false, movedToDeadLetter: true, alreadySynced: false };
  }

  // Mark item as in_progress
  const updatedItem: SyncQueueItem = {
    ...item,
    status: 'in_progress',
    lastAttemptAt: new Date().toISOString(),
  };
  await updateQueueItem(updatedItem);

  // Attempt to send to server
  const result = await sendToServer(item);

  if (result.success) {
    // Success - remove from queue
    await removeFromQueue(item.id);

    // Check if this was a conflict resolution (duplicate submission)
    if (result.alreadySynced) {
      // Log breadcrumb for conflict resolution
      Sentry.addBreadcrumb({
        category: 'sync',
        message: `Sync conflict resolved: ${item.id}`,
        level: 'info',
        data: {
          type: item.type,
          alreadySynced: true,
          serverExamId: result.serverResponse?.examId,
          offlineExamId: (item.payload as Record<string, unknown>)?.offlineExamId,
        },
      });

      dispatchSyncEvent(SYNC_EVENTS.SYNC_ITEM_SUCCESS, {
        item,
        alreadySynced: true,
        serverResponse: result.serverResponse,
      } as SyncItemEventDetail);

      return { success: true, movedToDeadLetter: false, alreadySynced: true };
    }

    dispatchSyncEvent(SYNC_EVENTS.SYNC_ITEM_SUCCESS, {
      item,
      serverResponse: result.serverResponse,
    } as SyncItemEventDetail);

    return { success: true, movedToDeadLetter: false, alreadySynced: false };
  }

  // Check if this is a permanent failure
  const isPermanentFailure = result.error?.startsWith('Permanent failure:');

  if (isPermanentFailure) {
    await moveToDeadLetter(item.id, result.error || 'Permanent failure');

    dispatchSyncEvent(SYNC_EVENTS.SYNC_ITEM_DEAD_LETTER, {
      item,
      error: result.error,
    } as SyncItemEventDetail);

    Sentry.addBreadcrumb({
      category: 'sync',
      message: `Item moved to dead letter (permanent failure): ${item.id}`,
      level: 'warning',
      data: {
        type: item.type,
        error: result.error,
      },
    });

    return { success: false, movedToDeadLetter: true, alreadySynced: false };
  }

  // Failure - update retry count and mark as failed
  const failedItem: SyncQueueItem = {
    ...item,
    status: 'failed',
    retryCount: item.retryCount + 1,
    lastError: result.error,
    lastAttemptAt: new Date().toISOString(),
  };
  await updateQueueItem(failedItem);

  // Reset status to pending for next retry attempt
  const pendingItem: SyncQueueItem = {
    ...failedItem,
    status: 'pending',
  };
  await updateQueueItem(pendingItem);

  dispatchSyncEvent(SYNC_EVENTS.SYNC_ITEM_FAILED, {
    item: failedItem,
    error: result.error,
  } as SyncItemEventDetail);

  return { success: false, movedToDeadLetter: false, alreadySynced: false };
}

/**
 * Process all pending items in the sync queue (FIFO order)
 */
export async function processQueue(): Promise<SyncResult> {
  const result: SyncResult = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    movedToDeadLetter: 0,
    alreadySynced: 0,
  };

  // Check if online before processing
  if (isBrowser() && !navigator.onLine) {
    return result;
  }

  // Get pending items in FIFO order
  const items = await getPendingItems();

  if (items.length === 0) {
    return result;
  }

  // Dispatch sync started event
  dispatchSyncEvent(SYNC_EVENTS.SYNC_STARTED, {
    itemCount: items.length,
    timestamp: new Date(),
  });

  Sentry.addBreadcrumb({
    category: 'sync',
    message: `Starting sync queue processing`,
    level: 'info',
    data: { itemCount: items.length },
  });

  // Process items sequentially in FIFO order
  for (const item of items) {
    // Check if still online before processing each item
    if (isBrowser() && !navigator.onLine) {
      break;
    }

    try {
      const itemResult = await processItem(item);
      result.totalProcessed++;

      if (itemResult.success) {
        result.successful++;
        // Track conflict resolutions separately
        if (itemResult.alreadySynced) {
          result.alreadySynced++;
        }
      } else if (itemResult.movedToDeadLetter) {
        result.movedToDeadLetter++;
      } else {
        result.failed++;

        // Calculate backoff delay for failed item
        const delay = calculateBackoffDelay(item.retryCount);

        // Wait before processing next item (simple backoff between items)
        if (delay > 0 && items.indexOf(item) < items.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 2000)));
        }
      }
    } catch (error) {
      result.totalProcessed++;
      result.failed++;

      Sentry.captureException(error, {
        extra: {
          itemId: item.id,
          itemType: item.type,
          context: 'sync_queue_processing',
        },
      });
    }
  }

  // Dispatch sync completed event
  dispatchSyncEvent(SYNC_EVENTS.SYNC_COMPLETED, {
    result,
    timestamp: new Date(),
  } as SyncCompletedEventDetail);

  Sentry.addBreadcrumb({
    category: 'sync',
    message: `Sync queue processing completed`,
    level: 'info',
    data: result,
  });

  return result;
}

/**
 * Get current offline status
 */
export async function getOfflineStatus(): Promise<OfflineStatus> {
  const isOnline = isBrowser() ? navigator.onLine : true;
  const pendingSyncCount = await getPendingSyncCount();

  return {
    isOnline,
    pendingSyncCount,
    lastSyncAt: null, // Will be updated by the sync process
  };
}

// Online/offline event handlers
let onlineHandler: (() => void) | null = null;
let offlineHandler: (() => void) | null = null;
let isListening = false;

/**
 * Handle online event - trigger sync processing
 */
function handleOnline(): void {
  dispatchSyncEvent(SYNC_EVENTS.ONLINE_STATUS_CHANGED, {
    isOnline: true,
    timestamp: new Date(),
  } as OnlineStatusEventDetail);

  // Automatically trigger sync when coming back online
  processQueue().catch((error) => {
    Sentry.captureException(error, {
      extra: { context: 'auto_sync_on_online' },
    });
  });
}

/**
 * Handle offline event
 */
function handleOffline(): void {
  dispatchSyncEvent(SYNC_EVENTS.ONLINE_STATUS_CHANGED, {
    isOnline: false,
    timestamp: new Date(),
  } as OnlineStatusEventDetail);
}

/**
 * Start listening for online/offline events
 */
export function startListening(): void {
  if (!isBrowser() || isListening) return;

  onlineHandler = handleOnline;
  offlineHandler = handleOffline;

  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);
  isListening = true;

  // If currently online and there are pending items, process them
  if (navigator.onLine) {
    getPendingSyncCount().then((count) => {
      if (count > 0) {
        processQueue().catch((error) => {
          Sentry.captureException(error, {
            extra: { context: 'initial_sync_check' },
          });
        });
      }
    });
  }
}

/**
 * Stop listening for online/offline events
 */
export function stopListening(): void {
  if (!isBrowser() || !isListening) return;

  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler);
  }
  if (offlineHandler) {
    window.removeEventListener('offline', offlineHandler);
  }

  onlineHandler = null;
  offlineHandler = null;
  isListening = false;
}

/**
 * Request background sync registration (for service worker)
 */
export async function requestBackgroundSync(): Promise<boolean> {
  if (!isBrowser()) return false;

  // Check if service worker and sync are supported
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Check if sync is available on this registration
    if ('sync' in registration) {
      await (
        registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> };
        }
      ).sync.register(SYNC_TAG);
      return true;
    }

    return false;
  } catch (error) {
    // Background sync registration failed
    Sentry.captureException(error, {
      extra: { context: 'background_sync_registration' },
    });
    return false;
  }
}

/**
 * Manually trigger sync (for when background sync is not available)
 */
export async function triggerManualSync(): Promise<SyncResult> {
  return processQueue();
}

/**
 * Check if browser supports background sync
 */
export function supportsBackgroundSync(): boolean {
  if (!isBrowser()) return false;
  return 'serviceWorker' in navigator && 'SyncManager' in window;
}

/**
 * Get the sync tag used for background sync registration
 */
export function getSyncTag(): string {
  return SYNC_TAG;
}

// Export the SyncService as a singleton-like object for convenient access
export const SyncService = {
  processQueue,
  getOfflineStatus,
  startListening,
  stopListening,
  requestBackgroundSync,
  triggerManualSync,
  supportsBackgroundSync,
  getSyncTag,
  EVENTS: SYNC_EVENTS,
} as const;

export default SyncService;
