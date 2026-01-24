import { useParams, useNavigate } from 'react-router-dom';
import { useFlashcardStore } from '../../../stores/flashcardStore';
import type { ReviewQuality } from '@ace-prep/shared';
import styles from './FlashcardSummary.module.css';

const RATING_CONFIG: Record<ReviewQuality, { label: string; color: string }> = {
  again: { label: 'Again', color: '#ef4444' },
  hard: { label: 'Hard', color: '#f59e0b' },
  good: { label: 'Good', color: '#00d4aa' },
  easy: { label: 'Easy', color: '#3b82f6' },
};

export function FlashcardSummary() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const results = useFlashcardStore((s) => s.results);
  const reset = useFlashcardStore((s) => s.reset);

  if (!results) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <p>No session results available.</p>
          <button className={styles.primaryBtn} onClick={() => navigate('/study/flashcards')}>
            Start New Session
          </button>
        </div>
      </div>
    );
  }

  const { cardsReviewed, ratingDistribution, xpUpdate, streakUpdate } = results;

  const totalRatings = Object.values(ratingDistribution).reduce((sum, n) => sum + n, 0);
  const maxRating = Math.max(...Object.values(ratingDistribution), 1);

  const handleNewSession = () => {
    reset();
    navigate('/study/flashcards');
  };

  const handleStudyHub = () => {
    reset();
    navigate('/study');
  };

  const handleReviewAgain = () => {
    if (sessionId) {
      reset();
      navigate(`/study/flashcards/${sessionId}`);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.summaryCard}>
        <div className={styles.header}>
          <div className={styles.checkmark}>&#x2713;</div>
          <h2 className={styles.title}>Session Complete</h2>
          <p className={styles.subtitle}>
            You reviewed <strong>{cardsReviewed}</strong> card{cardsReviewed !== 1 ? 's' : ''}
          </p>
        </div>

        <div className={styles.statsGrid}>
          {xpUpdate && (
            <div className={styles.statItem}>
              <span className={styles.statValue}>+{xpUpdate.awarded}</span>
              <span className={styles.statLabel}>XP Earned</span>
              {xpUpdate.newLevel && (
                <span className={styles.levelUp}>Level {xpUpdate.newLevel}!</span>
              )}
            </div>
          )}

          {streakUpdate && (
            <div className={styles.statItem}>
              <span className={styles.statValue}>{streakUpdate.current}</span>
              <span className={styles.statLabel}>Day Streak</span>
              {streakUpdate.milestone && (
                <span className={styles.milestone}>{streakUpdate.milestone} days!</span>
              )}
            </div>
          )}

          <div className={styles.statItem}>
            <span className={styles.statValue}>{cardsReviewed}</span>
            <span className={styles.statLabel}>Cards Reviewed</span>
          </div>
        </div>

        {totalRatings > 0 && (
          <div className={styles.distributionSection}>
            <h3 className={styles.sectionTitle}>Rating Distribution</h3>
            <div className={styles.distribution}>
              {(
                Object.entries(RATING_CONFIG) as [ReviewQuality, { label: string; color: string }][]
              ).map(([quality, config]) => {
                const count = ratingDistribution[quality] || 0;
                const percent = totalRatings > 0 ? (count / totalRatings) * 100 : 0;
                const barWidth = (count / maxRating) * 100;

                return (
                  <div key={quality} className={styles.distributionRow}>
                    <span className={styles.ratingLabel} style={{ color: config.color }}>
                      {config.label}
                    </span>
                    <div className={styles.barContainer}>
                      <div
                        className={styles.bar}
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: config.color,
                        }}
                      />
                    </div>
                    <span className={styles.ratingCount}>
                      {count} ({Math.round(percent)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={handleNewSession}>
            New Session
          </button>
          <button className={styles.secondaryBtn} onClick={handleReviewAgain}>
            Review Again
          </button>
          <button className={styles.secondaryBtn} onClick={handleStudyHub}>
            Study Hub
          </button>
        </div>
      </div>
    </div>
  );
}
