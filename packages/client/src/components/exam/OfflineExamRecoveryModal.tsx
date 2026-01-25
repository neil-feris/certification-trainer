import { useMemo } from 'react';
import type { OfflineExamState } from '../../services/offlineDb';
import styles from './ExamRecoveryModal.module.css';

interface OfflineExamRecoveryModalProps {
  offlineExam: OfflineExamState;
  onResume: () => void;
  onAbandon: () => void;
  isResuming?: boolean;
}

export function OfflineExamRecoveryModal({
  offlineExam,
  onResume,
  onAbandon,
  isResuming = false,
}: OfflineExamRecoveryModalProps) {
  // Calculate progress from responses
  const progress = useMemo(() => {
    const total = offlineExam.questionIds.length;
    const answered = Array.from(offlineExam.responses.values()).filter(
      (r) => r && r.length > 0
    ).length;
    return { answered, total };
  }, [offlineExam]);

  // Calculate remaining time
  const timeRemaining = useMemo(() => {
    const EXAM_DURATION = 2 * 60 * 60; // 2 hours in seconds
    const startedAtTime = new Date(offlineExam.startedAt).getTime();
    const elapsedSeconds = Math.floor((Date.now() - startedAtTime) / 1000);
    return Math.max(0, EXAM_DURATION - elapsedSeconds);
  }, [offlineExam.startedAt]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatStartedAt = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const isTimeWarning = timeRemaining < 600; // Less than 10 minutes
  const isTimeCritical = timeRemaining < 300; // Less than 5 minutes
  const isExpired = timeRemaining === 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>📶</div>
        <h2 className={styles.title}>Resume Offline Exam?</h2>
        <p className={styles.message}>
          You have an offline exam in progress that was started{' '}
          {formatStartedAt(offlineExam.startedAt)}. Would you like to continue where you left off?
        </p>

        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Progress</span>
            <span className={styles.detailValue}>
              Question {offlineExam.currentQuestionIndex + 1} of {progress.total}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Answered</span>
            <span className={styles.detailValue}>
              {progress.answered} of {progress.total}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Time Remaining</span>
            <span
              className={`${styles.detailValue} ${
                isExpired || isTimeCritical
                  ? styles.detailValueWarning
                  : isTimeWarning
                    ? styles.detailValueWarning
                    : ''
              }`}
            >
              {isExpired ? 'Expired' : formatTime(timeRemaining)}
            </span>
          </div>
        </div>

        {isExpired && (
          <p className={styles.expiredNote}>
            The exam timer has expired. You can still submit your answers if you resume.
          </p>
        )}

        <div className={styles.actions}>
          <button
            className={`btn btn-primary ${styles.resumeBtn}`}
            onClick={onResume}
            disabled={isResuming}
          >
            {isResuming ? 'Resuming...' : 'Resume Exam'}
          </button>
          <button
            className={`btn btn-ghost ${styles.abandonBtn}`}
            onClick={onAbandon}
            disabled={isResuming}
          >
            Abandon & Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}
