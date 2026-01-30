import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './OfflineFallbackModal.module.css';

interface OfflineFallbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartOffline: () => void;
  cachedQuestionCount: number;
  hasCachedQuestions: boolean;
  isStarting: boolean;
}

/**
 * Modal shown when online exam creation fails due to network error.
 * Offers to start an offline exam if questions are cached.
 */
export function OfflineFallbackModal({
  isOpen,
  onClose,
  onStartOffline,
  cachedQuestionCount,
  hasCachedQuestions,
  isStarting,
}: OfflineFallbackModalProps) {
  const navigate = useNavigate();

  // Handle Escape key to close modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isStarting) {
        onClose();
      }
    },
    [onClose, isStarting]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={isStarting ? undefined : onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="offline-modal-title"
      >
        <div className={styles.icon}>📶</div>
        <h2 id="offline-modal-title" className={styles.title}>
          You appear to be offline
        </h2>

        {hasCachedQuestions ? (
          <>
            <p className={styles.message}>
              Good news! You have <strong>{cachedQuestionCount} questions</strong> cached for
              offline use.
            </p>
            <div className={styles.actions}>
              <button className="btn btn-primary" onClick={onStartOffline} disabled={isStarting}>
                {isStarting ? 'Starting...' : 'Start Offline Exam'}
              </button>
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.message}>
              No questions cached for offline use. Connect to the internet or download questions in
              Settings.
            </p>
            <div className={styles.actions}>
              <button className="btn btn-primary" onClick={() => navigate('/settings')}>
                Go to Settings
              </button>
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
