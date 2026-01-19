/**
 * useSyncQueue Hook
 * Manages sync queue state and provides auto-flush functionality with notifications
 */
import { useState, useEffect, useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { getQueueLength, flushQueue, queueResponse } from '../services/syncQueue';

interface SyncQueueState {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncResult: { synced: number; failed: number } | null;
}

interface UseSyncQueueReturn extends SyncQueueState {
  queueOfflineResponse: (response: {
    sessionId: number;
    questionId: number;
    selectedAnswers: number[];
    timeSpentSeconds: number;
  }) => Promise<void>;
  manualSync: () => Promise<{ synced: number; failed: number }>;
  refreshPendingCount: () => Promise<void>;
}

export function useSyncQueue(): UseSyncQueueReturn {
  const { isOnline } = useOnlineStatus();
  const [state, setState] = useState<SyncQueueState>({
    pendingCount: 0,
    isSyncing: false,
    lastSyncResult: null,
  });

  // Refresh pending count from IndexedDB
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getQueueLength();
      setState((prev) => ({ ...prev, pendingCount: count }));
    } catch (error) {
      console.error('Failed to get queue length:', error);
    }
  }, []);

  // Queue a response for later sync
  const queueOfflineResponse = useCallback(
    async (response: {
      sessionId: number;
      questionId: number;
      selectedAnswers: number[];
      timeSpentSeconds: number;
    }) => {
      await queueResponse(response);
      await refreshPendingCount();
    },
    [refreshPendingCount]
  );

  // Manually trigger a sync
  const manualSync = useCallback(async () => {
    if (!isOnline || state.isSyncing) {
      return { synced: 0, failed: 0 };
    }

    setState((prev) => ({ ...prev, isSyncing: true }));

    try {
      const result = await flushQueue();
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncResult: result,
      }));
      await refreshPendingCount();
      return result;
    } catch (error) {
      console.error('Failed to flush sync queue:', error);
      setState((prev) => ({ ...prev, isSyncing: false }));
      return { synced: 0, failed: 0 };
    }
  }, [isOnline, state.isSyncing, refreshPendingCount]);

  // Load initial pending count on mount
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && state.pendingCount > 0 && !state.isSyncing) {
      // Delay slightly to ensure connection is stable
      const timeoutId = setTimeout(() => {
        manualSync().then((result) => {
          if (result.synced > 0) {
            // Show toast notification for successful sync
            showSyncToast(result.synced, result.failed);
          }
        });
      }, 1500);

      return () => clearTimeout(timeoutId);
    }
  }, [isOnline, state.pendingCount, state.isSyncing, manualSync]);

  // Periodically refresh pending count (every 10 seconds)
  useEffect(() => {
    const interval = setInterval(refreshPendingCount, 10000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  return {
    ...state,
    queueOfflineResponse,
    manualSync,
    refreshPendingCount,
  };
}

/**
 * Show a toast notification for sync results
 * Uses a simple DOM-based toast since we don't have a toast library
 */
function showSyncToast(synced: number, failed: number): void {
  // Remove any existing toast
  const existingToast = document.getElementById('sync-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'sync-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: ${failed > 0 ? '#f59e0b' : '#10b981'};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 1000;
    animation: slideUp 0.3s ease-out;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;

  if (failed > 0) {
    toast.textContent = `Synced ${synced} response${synced !== 1 ? 's' : ''}, ${failed} failed`;
  } else {
    toast.textContent = `Synced ${synced} response${synced !== 1 ? 's' : ''}`;
  }

  // Add animation keyframes if not already present
  if (!document.getElementById('sync-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'sync-toast-styles';
    style.textContent = `
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
      @keyframes fadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  // Remove toast after 3 seconds with fade out
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
