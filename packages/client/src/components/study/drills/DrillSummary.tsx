import type { CompleteDrillResponse } from '@ace-prep/shared';
import styles from './Drills.module.css';

interface DrillSummaryProps {
  results: CompleteDrillResponse;
  onComplete: () => void;
}

export function DrillSummary({ results, onComplete }: DrillSummaryProps) {
  const { score, correctCount, totalCount, avgTimePerQuestion, addedToSRCount, results: drillResults } = results;

  // Determine score category
  const getScoreCategory = (): string => {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    return 'needsWork';
  };

  const getScoreEmoji = (): string => {
    if (score >= 80) return '!';
    if (score >= 60) return '~';
    return '?';
  };

  const getScoreMessage = (): string => {
    if (score >= 90) return 'Excellent work! You really know your stuff.';
    if (score >= 80) return 'Great job! Keep up the good work.';
    if (score >= 70) return 'Good effort! A bit more practice will help.';
    if (score >= 60) return 'Not bad, but there is room for improvement.';
    return 'Keep studying! Review the explanations carefully.';
  };

  // Get wrong answers for review
  const wrongAnswers = drillResults.filter((r) => !r.isCorrect);

  // Calculate fastest and slowest times
  const times = drillResults.map((r) => r.timeSpentSeconds).filter((t) => t > 0);
  const fastestTime = times.length > 0 ? Math.min(...times) : 0;
  const slowestTime = times.length > 0 ? Math.max(...times) : 0;

  return (
    <div className={styles.summaryContainer}>
      <div className={styles.summaryCard}>
        <div className={styles.summaryIcon}>{getScoreEmoji()}</div>
        <h2 className={styles.summaryTitle}>Drill Complete</h2>

        {/* Score Circle */}
        <div className={`${styles.scoreCircle} ${styles[getScoreCategory()]}`}>
          <span className={styles.scoreValue}>{score}%</span>
          <span className={styles.scoreLabel}>Score</span>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          {getScoreMessage()}
        </p>

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{correctCount}/{totalCount}</span>
            <span className={styles.statLabel}>Correct</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{avgTimePerQuestion}s</span>
            <span className={styles.statLabel}>Avg Time</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{fastestTime}s</span>
            <span className={styles.statLabel}>Fastest</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{slowestTime}s</span>
            <span className={styles.statLabel}>Slowest</span>
          </div>
        </div>

        {/* SR Notice */}
        {addedToSRCount > 0 && (
          <div className={styles.srNotice}>
            <span className={styles.srIcon}>@</span>
            <span>
              {addedToSRCount} question{addedToSRCount > 1 ? 's' : ''} added to your review queue
            </span>
          </div>
        )}

        {/* Wrong Answers Review */}
        {wrongAnswers.length > 0 && (
          <div className={styles.wrongAnswersList}>
            <div className={styles.wrongAnswersTitle}>
              Review These ({wrongAnswers.length})
            </div>
            {wrongAnswers.slice(0, 3).map((answer, index) => (
              <div key={index} className={styles.wrongAnswerItem}>
                <div className={styles.wrongAnswerQuestion}>
                  Q{drillResults.indexOf(answer) + 1}: {answer.explanation.slice(0, 150)}
                  {answer.explanation.length > 150 ? '...' : ''}
                </div>
              </div>
            ))}
            {wrongAnswers.length > 3 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                + {wrongAnswers.length - 3} more in your review queue
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className={styles.summaryActions}>
          <button className="btn btn-primary" onClick={onComplete}>
            Start New Drill
          </button>
          <button className="btn btn-secondary" onClick={() => window.location.href = '/review'}>
            Go to Review Queue
          </button>
        </div>
      </div>
    </div>
  );
}
