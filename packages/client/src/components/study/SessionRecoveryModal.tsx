import styles from './SessionRecoveryModal.module.css';

interface SessionRecoveryModalProps {
  onContinue: () => void;
  onDiscard: () => void;
}

export function SessionRecoveryModal({ onContinue, onDiscard }: SessionRecoveryModalProps) {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>📚</div>
        <h2 className={styles.title}>Continue where you left off?</h2>
        <p className={styles.message}>
          You have an unfinished study session. Would you like to continue or start fresh?
        </p>
        <div className={styles.actions}>
          <button className={`btn btn-primary ${styles.continueBtn}`} onClick={onContinue}>
            Continue Session
          </button>
          <button className={`btn btn-ghost ${styles.discardBtn}`} onClick={onDiscard}>
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}
