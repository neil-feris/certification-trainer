import { useState, useEffect, useCallback } from 'react';
import { useCertificationStore } from '../../stores/certificationStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  CacheService,
  CACHE_EVENTS,
  type CacheCompletedEventDetail,
  type CacheFailedEventDetail,
} from '../../services/cacheService';
import { showToast } from '../common';
import type { CacheStatus } from '@ace-prep/shared';
import styles from './OfflineSettings.module.css';

interface CertCacheState {
  certificationId: number;
  certificationCode: string;
  certificationName: string;
  status: CacheStatus | null;
  isDownloading: boolean;
  downloadProgress: number;
}

export function OfflineSettings() {
  const { isOnline } = useOnlineStatus();
  const certifications = useCertificationStore((s) => s.certifications);
  const [cacheStates, setCacheStates] = useState<CertCacheState[]>([]);
  const [storageUsage, setStorageUsage] = useState<{ used: number; quota: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState<number | null>(null);

  // Load cache status for all certifications
  const loadCacheStatus = useCallback(async () => {
    const allStatus = await CacheService.getAllCacheStatus();
    const statusMap = new Map(allStatus.map((s) => [s.certificationId, s]));

    const states = certifications.map((cert) => ({
      certificationId: cert.id,
      certificationCode: cert.code,
      certificationName: cert.shortName,
      status: statusMap.get(cert.id) || null,
      isDownloading: false,
      downloadProgress: 0,
    }));

    setCacheStates(states);
  }, [certifications]);

  // Load storage usage
  const loadStorageUsage = useCallback(async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        setStorageUsage({
          used: estimate.usage || 0,
          quota: estimate.quota || 0,
        });
      } catch {
        // Storage API not available
      }
    }
  }, []);

  useEffect(() => {
    loadCacheStatus();
    loadStorageUsage();
  }, [loadCacheStatus, loadStorageUsage]);

  // Listen for cache events
  useEffect(() => {
    const handleCacheCompleted = (e: Event) => {
      const detail = (e as CustomEvent<CacheCompletedEventDetail>).detail;
      setCacheStates((prev) =>
        prev.map((s) =>
          s.certificationId === detail.certificationId
            ? {
                ...s,
                isDownloading: false,
                downloadProgress: 0,
                status: {
                  certificationId: detail.certificationId,
                  questionCount: detail.questionCount,
                  cachedAt: detail.cachedAt.toISOString(),
                  expiresAt: detail.expiresAt.toISOString(),
                  isExpired: false,
                },
              }
            : s
        )
      );
      showToast({
        message: `${detail.questionCount} questions cached for offline use`,
        type: 'success',
      });
      loadStorageUsage();
    };

    const handleCacheFailed = (e: Event) => {
      const detail = (e as CustomEvent<CacheFailedEventDetail>).detail;
      setCacheStates((prev) =>
        prev.map((s) =>
          s.certificationId === detail.certificationId
            ? { ...s, isDownloading: false, downloadProgress: 0 }
            : s
        )
      );
      showToast({
        message: `Failed to cache: ${detail.error}`,
        type: 'error',
      });
    };

    const handleCacheCleared = () => {
      loadCacheStatus();
      loadStorageUsage();
    };

    window.addEventListener(CACHE_EVENTS.CACHE_COMPLETED, handleCacheCompleted);
    window.addEventListener(CACHE_EVENTS.CACHE_FAILED, handleCacheFailed);
    window.addEventListener(CACHE_EVENTS.CACHE_CLEARED, handleCacheCleared);

    return () => {
      window.removeEventListener(CACHE_EVENTS.CACHE_COMPLETED, handleCacheCompleted);
      window.removeEventListener(CACHE_EVENTS.CACHE_FAILED, handleCacheFailed);
      window.removeEventListener(CACHE_EVENTS.CACHE_CLEARED, handleCacheCleared);
    };
  }, [loadCacheStatus, loadStorageUsage]);

  const handleDownload = async (certificationId: number) => {
    if (!isOnline) {
      showToast({
        message: 'Cannot download while offline',
        type: 'warning',
      });
      return;
    }

    setCacheStates((prev) =>
      prev.map((s) =>
        s.certificationId === certificationId
          ? { ...s, isDownloading: true, downloadProgress: 0 }
          : s
      )
    );

    try {
      await CacheService.cacheQuestionsForCertification(
        certificationId,
        CacheService.DEFAULT_CACHE_COUNT
      );
    } catch {
      // Error handled by event listener
    }
  };

  const handleClearCache = async (certificationId: number) => {
    await CacheService.clearCache(certificationId);
    setConfirmClear(null);
    showToast({
      message: 'Cache cleared successfully',
      type: 'success',
    });
    loadCacheStatus();
    loadStorageUsage();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateStr: string | Date): string => {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysUntilExpiry = (expiresAt: string | Date): number => {
    const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h3 className={styles.title}>Offline Mode</h3>
          <p className={styles.description}>
            Download questions to take exams without an internet connection.
          </p>
        </div>
        <div className={`${styles.connectionStatus} ${isOnline ? styles.online : styles.offline}`}>
          <span className={styles.statusDot} />
          {isOnline ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* Storage usage */}
      {storageUsage && storageUsage.quota > 0 && (
        <div className={styles.storageInfo}>
          <div className={styles.storageHeader}>
            <span className={styles.storageLabel}>Storage Used</span>
            <span className={styles.storageValue}>
              {formatBytes(storageUsage.used)} / {formatBytes(storageUsage.quota)}
            </span>
          </div>
          <div className={styles.storageBar}>
            <div
              className={styles.storageFill}
              style={{ width: `${Math.min((storageUsage.used / storageUsage.quota) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Certification cache list */}
      <div className={styles.certList}>
        {cacheStates.map((state) => (
          <div key={state.certificationId} className={styles.certItem}>
            <div className={styles.certInfo}>
              <span className={styles.certCode}>{state.certificationCode}</span>
              <span className={styles.certName}>{state.certificationName}</span>
            </div>

            <div className={styles.cacheInfo}>
              {state.isDownloading ? (
                <div className={styles.downloadProgress}>
                  <div className={styles.spinner} />
                  <span>Downloading...</span>
                </div>
              ) : state.status ? (
                <div className={styles.cacheStatus}>
                  <span className={styles.questionCount}>
                    {state.status.questionCount} questions
                  </span>
                  {state.status.isExpired ? (
                    <span className={styles.expiredBadge}>Expired</span>
                  ) : (
                    <span className={styles.expiryText}>
                      Expires {formatDate(state.status.expiresAt)} (
                      {getDaysUntilExpiry(state.status.expiresAt)}d)
                    </span>
                  )}
                </div>
              ) : (
                <span className={styles.noCacheText}>Not cached</span>
              )}
            </div>

            <div className={styles.certActions}>
              {state.status && confirmClear === state.certificationId ? (
                <div className={styles.confirmDialog}>
                  <span className={styles.confirmText}>Clear cache?</span>
                  <button
                    className={`${styles.actionBtn} ${styles.confirmYes}`}
                    onClick={() => handleClearCache(state.certificationId)}
                  >
                    Yes
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.confirmNo}`}
                    onClick={() => setConfirmClear(null)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <>
                  {state.isDownloading ? null : state.status && !state.status.isExpired ? (
                    <>
                      <button
                        className={`${styles.actionBtn} ${styles.refreshBtn}`}
                        onClick={() => handleDownload(state.certificationId)}
                        disabled={!isOnline}
                        title={!isOnline ? 'Go online to refresh' : 'Refresh cache'}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className={styles.icon}>
                          <path
                            fillRule="evenodd"
                            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Refresh
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.clearBtn}`}
                        onClick={() => setConfirmClear(state.certificationId)}
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <button
                      className={`${styles.actionBtn} ${styles.downloadBtn}`}
                      onClick={() => handleDownload(state.certificationId)}
                      disabled={!isOnline || state.isDownloading}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className={styles.icon}>
                        <path
                          fillRule="evenodd"
                          d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {state.status?.isExpired ? 'Re-download' : 'Download for Offline'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {cacheStates.length === 0 && (
        <div className={styles.emptyState}>
          <p>No certifications available. Add certifications to enable offline caching.</p>
        </div>
      )}

      {/* Info about offline mode */}
      <div className={styles.infoBox}>
        <svg viewBox="0 0 20 20" fill="currentColor" className={styles.infoIcon}>
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <div className={styles.infoText}>
          <strong>How offline mode works:</strong>
          <ul>
            <li>
              Downloaded questions are stored locally for {CacheService.CACHE_EXPIRATION_DAYS} days
            </li>
            <li>Take practice exams without internet connection</li>
            <li>Results sync automatically when you're back online</li>
            <li>Each certification caches up to {CacheService.DEFAULT_CACHE_COUNT} questions</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
