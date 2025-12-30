import styles from './ExamRecoveryModal.module.css';

interface ExamRecoveryModalProps {
  progress: { answered: number; total: number };
  currentQuestion: number;
  timeRemaining: number;
  onResume: () => void;
  onAbandon: () => void;
}

export function ExamRecoveryModal({
  progress,
  currentQuestion,
  timeRemaining,
  onResume,
  onAbandon,
}: ExamRecoveryModalProps) {
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isTimeWarning = timeRemaining < 600; // Less than 10 minutes
  const isTimeCritical = timeRemaining < 300; // Less than 5 minutes

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>📝</div>
        <h2 className={styles.title}>Resume Exam?</h2>
        <p className={styles.message}>
          You have an exam in progress. Would you like to continue where you left off?
        </p>

        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Progress</span>
            <span className={styles.detailValue}>
              Question {currentQuestion + 1} of {progress.total}
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
                isTimeCritical
                  ? styles.detailValueWarning
                  : isTimeWarning
                    ? styles.detailValueWarning
                    : ''
              }`}
            >
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={`btn btn-primary ${styles.resumeBtn}`} onClick={onResume}>
            Resume Exam
          </button>
          <button className={`btn btn-ghost ${styles.abandonBtn}`} onClick={onAbandon}>
            Start New Exam
          </button>
        </div>
      </div>
    </div>
  );
}
