/**
 * Offline Status Indicator Component
 *
 * A persistent indicator showing:
 * - Online/offline status
 * - Pending sync count badge
 * - Expandable panel with sync details
 * - 'Sync Now' button for manual trigger
 * - Toast notifications on connectivity changes
 */
import { useState, useEffect, useRef } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSyncQueue } from '../../hooks/useSyncQueue';
import { showToast } from './Toast';
import styles from './OfflineStatusIndicator.module.css';

interface OfflineStatusIndicatorProps {
  variant?: 'compact' | 'full';
}

export function OfflineStatusIndicator({ variant = 'compact' }: OfflineStatusIndicatorProps) {
  const { isOnline } = useOnlineStatus();
  const { pendingCount, isSyncing, manualSync, lastSyncResult } = useSyncQueue();
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Track previous online status for connectivity change toasts
  const prevOnlineRef = useRef(isOnline);

  // Show toast on connectivity change
  useEffect(() => {
    if (prevOnlineRef.current !== isOnline) {
      if (isOnline) {
        showToast({
          message:
            pendingCount > 0
              ? `Back online — ${pendingCount} item${pendingCount !== 1 ? 's' : ''} will sync`
              : 'Back online',
          type: 'success',
          duration: 3000,
        });
      } else {
        showToast({
          message: 'You are offline — changes will sync when connected',
          type: 'warning',
          duration: 4000,
        });
      }
      prevOnlineRef.current = isOnline;
    }
  }, [isOnline, pendingCount]);

  // Update last sync time when sync completes
  useEffect(() => {
    if (lastSyncResult && lastSyncResult.synced > 0) {
      setLastSyncTime(new Date());
    }
  }, [lastSyncResult]);

  // Close panel on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
      }
    }

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded]);

  // Close panel on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsExpanded(false);
      }
    }

    if (isExpanded) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isExpanded]);

  const handleSyncNow = async () => {
    if (!isOnline || isSyncing || pendingCount === 0) return;

    const result = await manualSync();
    if (result.synced > 0) {
      showToast({
        message: `Synced ${result.synced} item${result.synced !== 1 ? 's' : ''}${result.failed > 0 ? `, ${result.failed} failed` : ''}`,
        type: result.failed > 0 ? 'warning' : 'success',
        duration: 3000,
      });
    }
  };

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - lastSyncTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    return `${diffHours} hours ago`;
  };

  // Don't render if online and no pending items (nothing to show)
  const shouldShow = !isOnline || pendingCount > 0;

  if (!shouldShow && variant === 'compact') {
    return null;
  }

  return (
    <div className={`${styles.container} ${styles[variant]}`}>
      <button
        ref={buttonRef}
        className={`${styles.indicator} ${isOnline ? styles.online : styles.offline}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-label={`${isOnline ? 'Online' : 'Offline'}${pendingCount > 0 ? `, ${pendingCount} items pending sync` : ''}`}
      >
        {/* Status Icon */}
        <span className={styles.statusIcon}>
          {isOnline ? (
            isSyncing ? (
              <svg
                className={styles.spinIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            ) : pendingCount > 0 ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728m12.728 0L5.636 18.364"
              />
            </svg>
          )}
        </span>

        {/* Badge for pending count */}
        {pendingCount > 0 && (
          <span className={styles.badge}>{pendingCount > 99 ? '99+' : pendingCount}</span>
        )}

        {/* Label (only in full variant) */}
        {variant === 'full' && (
          <span className={styles.label}>
            {isOnline
              ? isSyncing
                ? 'Syncing...'
                : pendingCount > 0
                  ? 'Pending'
                  : 'Online'
              : 'Offline'}
          </span>
        )}
      </button>

      {/* Expanded Details Panel */}
      {isExpanded && (
        <div ref={panelRef} className={styles.panel}>
          <div className={styles.panelHeader}>
            <div
              className={`${styles.statusDot} ${isOnline ? styles.statusDotOnline : styles.statusDotOffline}`}
            />
            <span className={styles.statusText}>{isOnline ? 'Connected' : 'Offline'}</span>
          </div>

          <div className={styles.panelBody}>
            {/* Sync Status */}
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Pending sync</span>
              <span className={styles.statusValue}>
                {pendingCount} item{pendingCount !== 1 ? 's' : ''}
              </span>
            </div>

            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Last synced</span>
              <span className={styles.statusValue}>{formatLastSyncTime()}</span>
            </div>

            {/* Sync Now Button */}
            {isOnline && pendingCount > 0 && (
              <button className={styles.syncButton} onClick={handleSyncNow} disabled={isSyncing}>
                {isSyncing ? (
                  <>
                    <svg
                      className={styles.spinIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Sync Now
                  </>
                )}
              </button>
            )}

            {/* Offline Message */}
            {!isOnline && (
              <div className={styles.offlineMessage}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={styles.infoIcon}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Your changes will sync automatically when you reconnect.</span>
              </div>
            )}

            {/* No Pending Items Message */}
            {isOnline && pendingCount === 0 && (
              <div className={styles.syncedMessage}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={styles.checkIcon}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>All changes synced</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
