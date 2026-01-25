/**
 * Service Worker Registration and Sync Management
 *
 * Handles:
 * - Service worker registration with Vite PWA
 * - Background sync registration
 * - Periodic sync registration (daily cache refresh)
 * - Fallback mechanisms for unsupported browsers
 * - Message handling from service worker
 */
import { registerSW } from 'virtual:pwa-register';
import * as Sentry from '@sentry/react';
import { processQueue } from './syncService';

// Sync tags - must match sw.ts
const SYNC_TAG = 'ace-offline-sync';
const PERIODIC_SYNC_TAG = 'ace-daily-cache-refresh';

// Periodic sync interval: 24 hours in milliseconds
const PERIODIC_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Message types from service worker
const SW_MESSAGE_TYPES = {
  SYNC_REQUESTED: 'ace:sw:sync-requested',
  PERIODIC_SYNC_REQUESTED: 'ace:sw:periodic-sync-requested',
} as const;

// Registration state
let swRegistration: ServiceWorkerRegistration | null = null;
let periodicSyncFallbackTimer: ReturnType<typeof setInterval> | null = null;
let isInitialized = false;

// =============================================================================
// SERVICE WORKER REGISTRATION
// =============================================================================

/**
 * Register the service worker and set up sync handling
 */
export function initializeServiceWorker(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Check if service workers are supported
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW Registration] Service workers not supported');
    return;
  }

  // Register service worker using Vite PWA
  const updateSW = registerSW({
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        swRegistration = registration;
        console.log('[SW Registration] Service worker registered:', swUrl);

        // Set up periodic sync or fallback
        setupPeriodicSync(registration);

        // Set up SW update checking (hourly)
        setupUpdateChecking(swUrl, registration);
      }
    },
    onRegisterError(error) {
      console.error('[SW Registration] Service worker registration failed:', error);
      Sentry.captureException(error, {
        extra: { context: 'service_worker_registration' },
      });
    },
    onNeedRefresh() {
      // New version available - could show a prompt to user
      console.log('[SW Registration] New content available, refresh needed');
    },
    onOfflineReady() {
      console.log('[SW Registration] App ready to work offline');
    },
  });

  // Set up message listener for SW communication
  setupMessageListener();

  // Store updateSW for potential future use
  (window as Window & { __updateSW?: typeof updateSW }).__updateSW = updateSW;
}

// =============================================================================
// BACKGROUND SYNC
// =============================================================================

/**
 * Request background sync registration
 * @returns true if registered successfully, false otherwise
 */
export async function requestBackgroundSync(): Promise<boolean> {
  if (!swRegistration) {
    console.warn('[SW Registration] No service worker registration available');
    return false;
  }

  // Check if Background Sync API is available
  if (!('sync' in swRegistration)) {
    console.warn('[SW Registration] Background Sync not supported');
    return false;
  }

  try {
    await (
      swRegistration as ServiceWorkerRegistration & {
        sync: { register: (tag: string) => Promise<void> };
      }
    ).sync.register(SYNC_TAG);
    console.log('[SW Registration] Background sync registered:', SYNC_TAG);
    return true;
  } catch (error) {
    console.error('[SW Registration] Background sync registration failed:', error);
    Sentry.captureException(error, {
      extra: { context: 'background_sync_registration' },
    });
    return false;
  }
}

/**
 * Check if Background Sync is supported
 */
export function supportsBackgroundSync(): boolean {
  return (
    'serviceWorker' in navigator &&
    'SyncManager' in window &&
    swRegistration !== null &&
    'sync' in swRegistration
  );
}

// =============================================================================
// PERIODIC SYNC
// =============================================================================

/**
 * Set up periodic sync for daily cache refresh
 * Falls back to setInterval if Periodic Sync API is not available
 */
async function setupPeriodicSync(registration: ServiceWorkerRegistration): Promise<void> {
  // Check if Periodic Sync is available
  if ('periodicSync' in registration) {
    try {
      // Request permission for periodic sync
      const periodicSyncManager = (
        registration as ServiceWorkerRegistration & {
          periodicSync: {
            register: (tag: string, options: { minInterval: number }) => Promise<void>;
            getTags: () => Promise<string[]>;
          };
        }
      ).periodicSync;

      // Check if already registered
      const tags = await periodicSyncManager.getTags();
      if (tags.includes(PERIODIC_SYNC_TAG)) {
        console.log('[SW Registration] Periodic sync already registered');
        return;
      }

      // Register for daily sync (86400000ms = 24 hours)
      await periodicSyncManager.register(PERIODIC_SYNC_TAG, {
        minInterval: PERIODIC_SYNC_INTERVAL_MS,
      });
      console.log('[SW Registration] Periodic sync registered (daily)');
      return;
    } catch (error) {
      // Periodic sync registration failed - browser may not grant permission
      console.warn('[SW Registration] Periodic sync not available:', error);
    }
  }

  // Fallback: Use setInterval for periodic cache refresh
  setupPeriodicSyncFallback();
}

/**
 * Fallback mechanism using setInterval for browsers without Periodic Sync
 */
function setupPeriodicSyncFallback(): void {
  if (periodicSyncFallbackTimer) {
    return; // Already set up
  }

  console.log('[SW Registration] Using fallback periodic sync (setInterval)');

  // Trigger immediately on app start, then every 24 hours
  // The actual cache refresh logic will be handled by the CacheService
  periodicSyncFallbackTimer = setInterval(() => {
    if (navigator.onLine) {
      // Dispatch event for cache refresh
      window.dispatchEvent(
        new CustomEvent('ace:periodic-cache-refresh', {
          detail: { timestamp: new Date().toISOString() },
        })
      );
    }
  }, PERIODIC_SYNC_INTERVAL_MS);

  // Also trigger once after a short delay on startup
  setTimeout(() => {
    if (navigator.onLine) {
      window.dispatchEvent(
        new CustomEvent('ace:periodic-cache-refresh', {
          detail: { timestamp: new Date().toISOString(), isStartup: true },
        })
      );
    }
  }, 5000); // 5 second delay after app load
}

/**
 * Check if Periodic Sync is supported
 */
export function supportsPeriodicSync(): boolean {
  return swRegistration !== null && 'periodicSync' in swRegistration;
}

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

/**
 * Set up listener for messages from service worker
 */
function setupMessageListener(): void {
  navigator.serviceWorker.addEventListener('message', async (event) => {
    const { type, payload } = event.data || {};

    switch (type) {
      case SW_MESSAGE_TYPES.SYNC_REQUESTED:
        // Service worker is requesting we process the sync queue
        console.log('[SW Registration] Sync requested by SW:', payload);
        try {
          const result = await processQueue();
          console.log('[SW Registration] Sync completed:', result);

          // Notify SW that sync is complete
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'SYNC_COMPLETE',
              payload: result,
            });
          }
        } catch (error) {
          console.error('[SW Registration] Sync failed:', error);
          Sentry.captureException(error, {
            extra: { context: 'sw_sync_request' },
          });
        }
        break;

      case SW_MESSAGE_TYPES.PERIODIC_SYNC_REQUESTED:
        // Service worker is requesting a cache refresh
        console.log('[SW Registration] Periodic sync requested by SW:', payload);
        window.dispatchEvent(
          new CustomEvent('ace:periodic-cache-refresh', {
            detail: payload,
          })
        );
        break;

      default:
        // Unknown message type
        break;
    }
  });
}

// =============================================================================
// UPDATE CHECKING
// =============================================================================

/**
 * Set up periodic checking for service worker updates
 */
function setupUpdateChecking(swUrl: string, registration: ServiceWorkerRegistration): void {
  // Check for updates every hour
  const intervalMS = 60 * 60 * 1000;

  setInterval(async () => {
    // Don't check if installing or offline
    if (registration.installing || !navigator.onLine) {
      return;
    }

    try {
      const response = await fetch(swUrl, {
        cache: 'no-store',
        headers: {
          cache: 'no-store',
          'cache-control': 'no-cache',
        },
      });

      if (response.status === 200) {
        await registration.update();
      }
    } catch {
      // Silently fail - likely offline
    }
  }, intervalMS);
}

// =============================================================================
// MANUAL SYNC TRIGGER
// =============================================================================

/**
 * Manually trigger sync processing
 * Use this when Background Sync is not available or for immediate sync
 */
export async function triggerManualSync(): Promise<void> {
  try {
    // First try to register background sync if available
    const registered = await requestBackgroundSync();

    if (!registered) {
      // Background sync not available, process directly
      console.log('[SW Registration] Fallback: Processing sync queue directly');
      await processQueue();
    }
  } catch (error) {
    console.error('[SW Registration] Manual sync failed:', error);
    Sentry.captureException(error, {
      extra: { context: 'manual_sync_trigger' },
    });
    throw error;
  }
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Clean up periodic sync fallback timer
 * Call this when the app is unmounting
 */
export function cleanupServiceWorker(): void {
  if (periodicSyncFallbackTimer) {
    clearInterval(periodicSyncFallbackTimer);
    periodicSyncFallbackTimer = null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const SwRegistration = {
  initialize: initializeServiceWorker,
  requestBackgroundSync,
  supportsBackgroundSync,
  supportsPeriodicSync,
  triggerManualSync,
  cleanup: cleanupServiceWorker,
  SYNC_TAG,
  PERIODIC_SYNC_TAG,
} as const;

export default SwRegistration;
