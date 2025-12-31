import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudyStore } from '../../../stores/studyStore';
import styles from './Practice.module.css';

interface PracticeSummaryProps {
  onComplete: () => Promise<{
    score: number;
    correctCount: number;
    totalCount: number;
    addedToSRCount: number;
  }>;
  onExit: () => void;
}

export function PracticeSummary({ onComplete, onExit }: PracticeSummaryProps) {
  const navigate = useNavigate();
  const { getProgress } = useStudyStore();
  const progress = getProgress();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    correctCount: number;
    totalCount: number;
    addedToSRCount: number;
  } | null>(null);

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      const res = await onComplete();
      setResult(res);
    } catch (error) {
      console.error('Failed to complete session:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (result) {
    const getScoreClass = () => {
      if (result.score >= 80) return styles.scoreExcellent;
      if (result.score >= 60) return styles.scoreGood;
      return styles.scoreNeedsWork;
    };

    const getScoreMessage = () => {
      if (result.score >= 80) return 'Excellent work!';
      if (result.score >= 60) return 'Good progress!';
      return 'Keep practicing!';
    };

    return (
      <div className={styles.summaryContainer}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>🎉</div>
          <h2 className={styles.summaryTitle}>Practice Complete!</h2>

          <div className={`${styles.scoreCircle} ${getScoreClass()}`}>
            <span className={styles.scoreValue}>{result.score}%</span>
            <span className={styles.scoreLabel}>{getScoreMessage()}</span>
          </div>

          <div className={styles.summaryStats}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{result.correctCount}</span>
              <span className={styles.statLabel}>Correct</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statValue}>{result.totalCount - result.correctCount}</span>
              <span className={styles.statLabel}>Incorrect</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statValue}>{result.totalCount}</span>
              <span className={styles.statLabel}>Total</span>
            </div>
          </div>

          {result.addedToSRCount > 0 && (
            <div className={styles.srNotice}>
              <span className={styles.srIcon}>📝</span>
              {result.addedToSRCount} question{result.addedToSRCount > 1 ? 's' : ''} added to your
              review queue
            </div>
          )}

          <div className={styles.summaryActions}>
            <button className="btn btn-primary" onClick={onExit}>
              Continue Studying
            </button>
            {result.addedToSRCount > 0 && (
              <button className="btn btn-secondary" onClick={() => navigate('/review')}>
                Go to Review
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.summaryContainer}>
      <div className={styles.summaryCard}>
        <h2 className={styles.summaryTitle}>Ready to Submit?</h2>
        <p className={styles.summaryMessage}>
          You've answered {progress.answered} of {progress.total} questions.
          {progress.correct} correct so far (
          {Math.round((progress.correct / progress.answered) * 100) || 0}%).
        </p>

        <div className={styles.summaryActions}>
          <button className="btn btn-primary" onClick={handleComplete} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Complete Practice'}
          </button>
        </div>
      </div>
    </div>
  );
}
