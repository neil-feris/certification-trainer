import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { flashcardApi } from '../../../api/client';
import type { ReviewQuality } from '@ace-prep/shared';
import styles from './FlashcardHub.module.css';

const RATING_COLORS: Record<ReviewQuality, string> = {
  again: '#e74c3c',
  hard: '#e67e22',
  good: '#2ecc71',
  easy: '#3498db',
};

export function FlashcardHub() {
  const navigate = useNavigate();

  const { data: lastSessionData } = useQuery({
    queryKey: ['flashcard-last-session'],
    queryFn: () => flashcardApi.getLastSession(),
  });

  const lastSession = lastSessionData?.session ?? null;

  const handleQuickStart = () => {
    navigate('/study/flashcards');
  };

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <div className={styles.iconWrap}>
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3" y="5" width="14" height="16" rx="2" />
            <rect x="7" y="3" width="14" height="16" rx="2" />
          </svg>
        </div>
        <h2 className={styles.title}>Flashcards</h2>
        <p className={styles.description}>
          Study with flip cards and spaced repetition. Rate each card to schedule optimal review
          intervals.
        </p>
      </div>

      <div className={styles.actions}>
        <button className={styles.quickStart} onClick={handleQuickStart}>
          Start Flashcard Session
        </button>
        <button className={styles.setupLink} onClick={handleQuickStart}>
          Configure Session
        </button>
      </div>

      {lastSession && (
        <div className={styles.lastSession}>
          <h3 className={styles.lastSessionTitle}>Last Session</h3>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{lastSession.cardsReviewed}</span>
              <span className={styles.statLabel}>Cards Reviewed</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{lastSession.totalCards}</span>
              <span className={styles.statLabel}>Total Cards</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>
                {new Date(lastSession.completedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <span className={styles.statLabel}>Completed</span>
            </div>
          </div>
          <div className={styles.distribution}>
            <span className={styles.distributionLabel}>Rating breakdown</span>
            <div className={styles.barContainer}>
              {(['again', 'hard', 'good', 'easy'] as ReviewQuality[]).map((rating) => {
                const count = lastSession.ratingDistribution[rating] || 0;
                const total = Object.values(lastSession.ratingDistribution).reduce(
                  (a, b) => a + b,
                  0
                );
                const pct = total > 0 ? (count / total) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={rating}
                    className={styles.barSegment}
                    style={{ width: `${pct}%`, backgroundColor: RATING_COLORS[rating] }}
                    title={`${rating}: ${count}`}
                  />
                );
              })}
            </div>
            <div className={styles.legend}>
              {(['again', 'hard', 'good', 'easy'] as ReviewQuality[]).map((rating) => {
                const count = lastSession.ratingDistribution[rating] || 0;
                if (count === 0) return null;
                return (
                  <span key={rating} className={styles.legendItem}>
                    <span
                      className={styles.legendDot}
                      style={{ backgroundColor: RATING_COLORS[rating] }}
                    />
                    {rating} ({count})
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
