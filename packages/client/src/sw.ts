/// <reference lib="webworker" />
/**
 * Custom Service Worker for ACE Prep PWA
 *
 * Features:
 * - Precaching of static assets via Workbox
 * - Background Sync for offline queue processing
 * - Periodic Sync for daily cache updates (where supported)
 * - Runtime caching strategies for optimal performance
 */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Declare self as ServiceWorkerGlobalScope for TypeScript
declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// Sync tags
const SYNC_TAG = 'ace-offline-sync';
const PERIODIC_SYNC_TAG = 'ace-daily-cache-refresh';

// Message types for client communication
const MESSAGE_TYPES = {
  SYNC_REQUESTED: 'ace:sw:sync-requested',
  PERIODIC_SYNC_REQUESTED: 'ace:sw:periodic-sync-requested',
  SYNC_COMPLETE: 'ace:sw:sync-complete',
} as const;

// =============================================================================
// PRECACHING
// =============================================================================

// Clean up old caches from previous versions
cleanupOutdatedCaches();

// Precache static assets (injected by Workbox at build time)
precacheAndRoute(self.__WB_MANIFEST);

// =============================================================================
// RUNTIME CACHING
// =============================================================================

// Cache-first for static assets (JS, CSS, fonts, images)
registerRoute(
  ({ request }) =>
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image',
  new CacheFirst({
    cacheName: 'ace-prep-static-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  })
);

// StaleWhileRevalidate for the app shell (HTML)
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new StaleWhileRevalidate({
    cacheName: 'ace-prep-app-shell',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 1,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      }),
    ],
  })
);

// NOTE: API responses are NOT cached by the service worker.
// Offline data is managed by IndexedDB via offlineStorage service.
// This prevents stale data issues and data leakage on shared devices.

// =============================================================================
// BACKGROUND SYNC
// =============================================================================

/**
 * Send a message to all clients
 */
async function sendMessageToClients(message: { type: string; payload?: unknown }): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  for (const client of clients) {
    client.postMessage(message);
  }
}

/**
 * Handle the 'sync' event for background sync
 * When the browser triggers this event (after coming back online),
 * we notify the client to process the sync queue.
 */
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(
      (async () => {
        // Notify clients to process the sync queue
        await sendMessageToClients({
          type: MESSAGE_TYPES.SYNC_REQUESTED,
          payload: { tag: SYNC_TAG, timestamp: new Date().toISOString() },
        });
      })()
    );
  }
});

// =============================================================================
// PERIODIC SYNC (for browsers that support it)
// =============================================================================

/**
 * Handle periodic sync events for daily cache refresh
 * Not all browsers support this - Chrome/Edge on desktop do,
 * mobile support is limited.
 */
self.addEventListener('periodicsync', (event: PeriodicSyncEvent) => {
  if (event.tag === PERIODIC_SYNC_TAG) {
    event.waitUntil(
      (async () => {
        // Notify clients to refresh their cache
        await sendMessageToClients({
          type: MESSAGE_TYPES.PERIODIC_SYNC_REQUESTED,
          payload: { tag: PERIODIC_SYNC_TAG, timestamp: new Date().toISOString() },
        });
      })()
    );
  }
});

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

/**
 * Handle messages from the client
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      // Allow immediate activation of new service worker
      self.skipWaiting();
      break;

    case 'SYNC_COMPLETE':
      // Client notifies us that sync is complete (for logging/debugging)
      console.log('[SW] Sync complete:', payload);
      break;

    default:
      // Unknown message type
      break;
  }
});

// =============================================================================
// LIFECYCLE EVENTS
// =============================================================================

/**
 * Activate event - take control of all clients immediately
 */
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});

// =============================================================================
// TYPE DECLARATIONS
// =============================================================================

// Extend ServiceWorkerGlobalScope to include sync-related types
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}

interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string;
}

// Declare the global sync event listener
declare global {
  interface ServiceWorkerGlobalScopeEventMap {
    sync: SyncEvent;
    periodicsync: PeriodicSyncEvent;
  }
}

// Export sync tags for use by the registration module
export { SYNC_TAG, PERIODIC_SYNC_TAG, MESSAGE_TYPES };
