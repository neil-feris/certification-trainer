import { useState, useEffect, useCallback } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { getPendingSyncCount } from '../../services/offlineDb';
import { SYNC_EVENTS, triggerManualSync } from '../../services/syncService';
import type { SyncCompletedEventDetail } from '../../services/syncService';
import styles from './SyncStatusWidget.module.css';

/**
 * Widget that shows pending offline sync status.
 * Only visible when there are items pending sync.
 */
export function SyncStatusWidget() {
  const { isOnline } = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  // Load pending count
  const loadPendingCount = useCallback(async () => {
    const count = await getPendingSyncCount();
    setPendingCount(count);
  }, []);

  // Load on mount
  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  // Listen for sync events
  useEffect(() => {
    const handleSyncStarted = () => {
      setIsSyncing(true);
      setLastSyncResult(null);
    };

    const handleSyncCompleted = (e: Event) => {
      const detail = (e as CustomEvent<SyncCompletedEventDetail>).detail;
      setIsSyncing(false);
      loadPendingCount();

      if (detail.result.successful > 0) {
        const conflictNote =
          detail.result.alreadySynced > 0 ? ` (${detail.result.alreadySynced} already synced)` : '';
        setLastSyncResult(`Synced ${detail.result.successful} item(s)${conflictNote}`);
      } else if (detail.result.failed > 0) {
        setLastSyncResult(`${detail.result.failed} item(s) failed - will retry`);
      }

      // Clear result message after 5 seconds
      setTimeout(() => setLastSyncResult(null), 5000);
    };

    const handleOnlineChange = () => {
      loadPendingCount();
    };

    window.addEventListener(SYNC_EVENTS.SYNC_STARTED, handleSyncStarted);
    window.addEventListener(SYNC_EVENTS.SYNC_COMPLETED, handleSyncCompleted);
    window.addEventListener(SYNC_EVENTS.ONLINE_STATUS_CHANGED, handleOnlineChange);

    return () => {
      window.removeEventListener(SYNC_EVENTS.SYNC_STARTED, handleSyncStarted);
      window.removeEventListener(SYNC_EVENTS.SYNC_COMPLETED, handleSyncCompleted);
      window.removeEventListener(SYNC_EVENTS.ONLINE_STATUS_CHANGED, handleOnlineChange);
    };
  }, [loadPendingCount]);

  // Don't render if nothing pending
  if (pendingCount === 0 && !lastSyncResult) {
    return null;
  }

  const handleManualSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      await triggerManualSync();
    } finally {
      setIsSyncing(false);
      loadPendingCount();
    }
  };

  return (
    <div className={styles.widget}>
      <div className={styles.icon}>{isSyncing ? '⏳' : isOnline ? '☁️' : '📶'}</div>
      <div className={styles.content}>
        {lastSyncResult ? (
          <span className={styles.result}>{lastSyncResult}</span>
        ) : isSyncing ? (
          <span className={styles.syncing}>Syncing offline results...</span>
        ) : pendingCount > 0 ? (
          <>
            <span className={styles.pending}>
              {pendingCount} offline result{pendingCount !== 1 ? 's' : ''} pending sync
            </span>
            {isOnline ? (
              <button className={styles.syncBtn} onClick={handleManualSync} disabled={isSyncing}>
                Sync Now
              </button>
            ) : (
              <span className={styles.offlineNote}>Will sync when online</span>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
