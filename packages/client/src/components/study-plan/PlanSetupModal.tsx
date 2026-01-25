import { useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { useStudyPlanStore } from '../../stores/studyPlanStore';
import { useCertificationStore } from '../../stores/certificationStore';
import styles from './PlanSetupModal.module.css';

interface PlanSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PlanSetupModal({ isOpen, onClose, onSuccess }: PlanSetupModalProps) {
  const { createPlan, isLoading, error, clearError } = useStudyPlanStore();
  const { selectedCertificationId } = useCertificationStore();

  const [targetDate, setTargetDate] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Calculate minimum date (tomorrow)
  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  // Calculate days until exam
  const getDaysUntilExam = (): number => {
    if (!targetDate) return 0;
    const target = new Date(targetDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysUntilExam = getDaysUntilExam();
  const isDateWarning = daysUntilExam > 0 && daysUntilExam < 7;

  // Estimate daily study time based on days until exam
  const getEstimatedDailyTime = (): string => {
    if (daysUntilExam <= 0) return '--';
    if (daysUntilExam <= 7) return '90-120 min';
    if (daysUntilExam <= 14) return '60-90 min';
    if (daysUntilExam <= 30) return '45-75 min';
    return '30-60 min';
  };

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Focus trap
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  // Clear errors when modal opens
  useEffect(() => {
    if (isOpen) {
      clearError();
      setLocalError(null);
    }
  }, [isOpen, clearError]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !isLoading) {
        onClose();
      }
    },
    [isLoading, onClose]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!targetDate) {
      setLocalError('Please select a target exam date');
      return;
    }

    if (!selectedCertificationId) {
      setLocalError('Please select a certification first');
      return;
    }

    return Sentry.startSpan(
      {
        op: 'ui.action',
        name: 'Submit Plan Setup Modal',
      },
      async (span) => {
        span.setAttribute('days_until_exam', daysUntilExam);

        try {
          await createPlan({
            targetExamDate: targetDate,
            certificationId: selectedCertificationId,
          });
          onSuccess?.();
          onClose();
        } catch {
          // Error is already set in store
        }
      }
    );
  };

  const handleRetry = () => {
    clearError();
    setLocalError(null);
  };

  if (!isOpen) return null;

  const displayError = localError || error;

  return (
    <div
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-setup-title"
    >
      <div className={styles.modal} ref={modalRef} tabIndex={-1}>
        <div className={styles.header}>
          <span className={styles.icon}>📅</span>
          <h2 id="plan-setup-title" className={styles.title}>
            Create Study Plan
          </h2>
          <p className={styles.subtitle}>
            Set your exam date and we'll build a personalized study schedule
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="exam-date" className={styles.label}>
              Target Exam Date
            </label>
            <input
              id="exam-date"
              type="date"
              className={styles.dateInput}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              min={getMinDate()}
              disabled={isLoading}
              required
            />
          </div>

          {targetDate && (
            <div className={styles.preview}>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Days until exam</span>
                <span
                  className={`${styles.previewValue} ${isDateWarning ? styles.previewWarning : ''}`}
                >
                  {daysUntilExam}
                </span>
              </div>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Estimated daily study</span>
                <span className={styles.previewValue}>{getEstimatedDailyTime()}</span>
              </div>
            </div>
          )}

          {isDateWarning && (
            <div className={styles.warning}>
              <span className={styles.warningIcon}>⚠️</span>
              <span className={styles.warningText}>
                Less than 7 days to prepare! Your study plan will be intensive.
              </span>
            </div>
          )}

          {displayError && (
            <div className={styles.error}>
              <span className={styles.errorIcon}>❌</span>
              <span className={styles.errorText}>{displayError}</span>
              <button type="button" className={styles.retryBtn} onClick={handleRetry}>
                Try Again
              </button>
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="submit"
              className={`btn btn-primary ${styles.submitBtn}`}
              disabled={isLoading || !targetDate}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner} />
                  Generating Plan...
                </>
              ) : (
                'Create Plan'
              )}
            </button>
            <button
              type="button"
              className={`btn btn-ghost ${styles.cancelBtn}`}
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
