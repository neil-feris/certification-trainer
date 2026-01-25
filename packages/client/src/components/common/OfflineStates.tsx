/**
 * Offline Empty and Error State Components
 *
 * Provides user-friendly feedback for various offline scenarios:
 * - NoCachedQuestions: When offline without cached questions
 * - SyncFailed: When sync permanently fails
 * - StorageFullError: When storage quota is exceeded
 * - OfflineFeatureGuide: First-time explanation of offline mode
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSyncQueue } from '../../hooks/useSyncQueue';
import { CacheService } from '../../services/cacheService';
import styles from './OfflineStates.module.css';

// Local storage key for first-time guide
const OFFLINE_GUIDE_SHOWN_KEY = 'ace-offline-guide-shown';

interface NoCachedQuestionsProps {
  certificationName?: string;
  onDownload?: () => void;
}

/**
 * Empty state when offline with no cached questions
 * Shows download CTA to prompt users to cache questions while online
 */
export function NoCachedQuestions({
  certificationName = 'this certification',
  onDownload,
}: NoCachedQuestionsProps) {
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();

  const handleDownloadClick = () => {
    if (onDownload) {
      onDownload();
    } else {
      // Navigate to settings offline section
      navigate('/settings', { state: { scrollTo: 'offline-mode' } });
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.iconContainer}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={styles.icon}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>

      <h3 className={styles.title}>No Cached Questions</h3>

      <p className={styles.description}>
        {isOnline
          ? `You haven't downloaded any questions for ${certificationName} yet. Download questions now to practice offline.`
          : `You're offline and don't have any questions cached for ${certificationName}. Connect to the internet to download questions for offline use.`}
      </p>

      <div className={styles.actions}>
        {isOnline ? (
          <button className={`${styles.primaryButton}`} onClick={handleDownloadClick}>
            <svg viewBox="0 0 20 20" fill="currentColor" className={styles.buttonIcon}>
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            Download for Offline
          </button>
        ) : (
          <button className={`${styles.secondaryButton}`} onClick={() => navigate('/settings')}>
            <svg viewBox="0 0 20 20" fill="currentColor" className={styles.buttonIcon}>
              <path
                fillRule="evenodd"
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
            Go to Settings
          </button>
        )}
      </div>

      <p className={styles.hint}>
        <svg viewBox="0 0 20 20" fill="currentColor" className={styles.hintIcon}>
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        Download up to {CacheService.DEFAULT_CACHE_COUNT} questions per certification for offline
        practice
      </p>
    </div>
  );
}

interface SyncFailedProps {
  error?: string;
  itemType?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/**
 * Error state when sync permanently fails (moved to dead letter queue)
 */
export function SyncFailed({ error, itemType = 'item', onRetry, onDismiss }: SyncFailedProps) {
  const { isOnline } = useOnlineStatus();
  const { manualSync } = useSyncQueue();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (!isOnline) return;

    setIsRetrying(true);
    try {
      if (onRetry) {
        onRetry();
      } else {
        await manualSync();
      }
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className={`${styles.container} ${styles.errorContainer}`}>
      <div className={`${styles.iconContainer} ${styles.errorIcon}`}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={styles.icon}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>

      <h3 className={styles.title}>Sync Failed</h3>

      <p className={styles.description}>
        Your {itemType} couldn't be synced to the server.
        {error && <span className={styles.errorDetail}>{error}</span>}
      </p>

      <div className={styles.actions}>
        {isOnline ? (
          <button className={`${styles.primaryButton}`} onClick={handleRetry} disabled={isRetrying}>
            {isRetrying ? (
              <>
                <span className={styles.spinner} />
                Retrying...
              </>
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" className={styles.buttonIcon}>
                  <path
                    fillRule="evenodd"
                    d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                    clipRule="evenodd"
                  />
                </svg>
                Retry Sync
              </>
            )}
          </button>
        ) : (
          <div className={styles.offlineNote}>
            <svg viewBox="0 0 20 20" fill="currentColor" className={styles.noteIcon}>
              <path
                fillRule="evenodd"
                d="M5.05 3.636a1 1 0 010 1.414 7 7 0 000 9.9 1 1 0 11-1.414 1.414 9 9 0 010-12.728 1 1 0 011.414 0zm9.9 0a1 1 0 011.414 0 9 9 0 010 12.728 1 1 0 11-1.414-1.414 7 7 0 000-9.9 1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            Connect to internet to retry
          </div>
        )}

        {onDismiss && (
          <button className={styles.dismissButton} onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

interface StorageFullErrorProps {
  onClearCache?: () => void;
}

/**
 * Error state when storage quota is exceeded
 */
export function StorageFullError({ onClearCache }: StorageFullErrorProps) {
  const navigate = useNavigate();
  const [storageInfo, setStorageInfo] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    async function loadStorageInfo() {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        try {
          const estimate = await navigator.storage.estimate();
          setStorageInfo({
            used: estimate.usage || 0,
            quota: estimate.quota || 0,
          });
        } catch {
          // Storage API not available
        }
      }
    }
    loadStorageInfo();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleClearCache = () => {
    if (onClearCache) {
      onClearCache();
    } else {
      navigate('/settings', { state: { scrollTo: 'offline-mode' } });
    }
  };

  return (
    <div className={`${styles.container} ${styles.errorContainer}`}>
      <div className={`${styles.iconContainer} ${styles.warningIcon}`}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={styles.icon}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
          />
        </svg>
      </div>

      <h3 className={styles.title}>Storage Full</h3>

      <p className={styles.description}>
        Your device storage is full. Clear some cached questions to free up space.
      </p>

      {storageInfo && storageInfo.quota > 0 && (
        <div className={styles.storageInfo}>
          <div className={styles.storageHeader}>
            <span>Storage Used</span>
            <span className={styles.storageValue}>
              {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.quota)}
            </span>
          </div>
          <div className={styles.storageBar}>
            <div
              className={styles.storageFill}
              style={{ width: `${Math.min((storageInfo.used / storageInfo.quota) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button className={`${styles.primaryButton}`} onClick={handleClearCache}>
          <svg viewBox="0 0 20 20" fill="currentColor" className={styles.buttonIcon}>
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          Manage Cache
        </button>
      </div>

      <p className={styles.hint}>
        <svg viewBox="0 0 20 20" fill="currentColor" className={styles.hintIcon}>
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        Clearing old or unused certification caches will free up storage space
      </p>
    </div>
  );
}

interface OfflineFeatureGuideProps {
  onDismiss: () => void;
  onLearnMore?: () => void;
}

/**
 * First-time user guide explaining offline mode features
 */
export function OfflineFeatureGuide({ onDismiss, onLearnMore }: OfflineFeatureGuideProps) {
  const navigate = useNavigate();

  const handleLearnMore = () => {
    if (onLearnMore) {
      onLearnMore();
    } else {
      navigate('/settings', { state: { scrollTo: 'offline-mode' } });
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(OFFLINE_GUIDE_SHOWN_KEY, 'true');
    onDismiss();
  };

  return (
    <div className={styles.guideOverlay}>
      <div className={styles.guideContainer}>
        <button className={styles.guideClose} onClick={handleDismiss} aria-label="Close">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className={styles.guideHeader}>
          <div className={styles.guideIconContainer}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={styles.guideIcon}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>
          <h2 className={styles.guideTitle}>Offline Mode Available</h2>
        </div>

        <div className={styles.guideContent}>
          <p className={styles.guideIntro}>
            Take practice exams even without an internet connection! Here's how it works:
          </p>

          <ul className={styles.guideFeatures}>
            <li>
              <span className={styles.featureIcon}>📥</span>
              <div>
                <strong>Download Questions</strong>
                <p>
                  Cache up to {CacheService.DEFAULT_CACHE_COUNT} questions per certification for
                  offline use
                </p>
              </div>
            </li>
            <li>
              <span className={styles.featureIcon}>✈️</span>
              <div>
                <strong>Study Anywhere</strong>
                <p>Practice on planes, trains, or anywhere without WiFi</p>
              </div>
            </li>
            <li>
              <span className={styles.featureIcon}>🔄</span>
              <div>
                <strong>Auto-Sync Results</strong>
                <p>Your exam results sync automatically when you reconnect</p>
              </div>
            </li>
            <li>
              <span className={styles.featureIcon}>⏱️</span>
              <div>
                <strong>Cache Lasts {CacheService.CACHE_EXPIRATION_DAYS} Days</strong>
                <p>Downloaded questions remain available for a week</p>
              </div>
            </li>
          </ul>
        </div>

        <div className={styles.guideActions}>
          <button className={styles.guideLearnMore} onClick={handleLearnMore}>
            <svg viewBox="0 0 20 20" fill="currentColor" className={styles.buttonIcon}>
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            Download Questions Now
          </button>
          <button className={styles.guideDismiss} onClick={handleDismiss}>
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to check if the offline feature guide should be shown
 */
export function useOfflineFeatureGuide() {
  const [shouldShowGuide, setShouldShowGuide] = useState(false);

  useEffect(() => {
    const hasSeenGuide = localStorage.getItem(OFFLINE_GUIDE_SHOWN_KEY);
    if (!hasSeenGuide) {
      // Small delay to not show immediately on first load
      const timer = setTimeout(() => {
        setShouldShowGuide(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismissGuide = () => {
    localStorage.setItem(OFFLINE_GUIDE_SHOWN_KEY, 'true');
    setShouldShowGuide(false);
  };

  return { shouldShowGuide, dismissGuide };
}

// Re-export the local storage key for testing
export { OFFLINE_GUIDE_SHOWN_KEY };
