import type { FlashcardCard } from '@ace-prep/shared';
import type { SwipeState } from './FlashcardContainer';
import { BookmarkButton } from '../../common/BookmarkButton';
import { QuestionFeedback } from '../../common/QuestionFeedback';
import styles from './Flashcard.module.css';

interface FlashcardProps {
  card: FlashcardCard;
  isFlipped: boolean;
  onFlip: () => void;
  swipeState?: SwipeState;
}

export function Flashcard({ card, isFlipped, onFlip, swipeState }: FlashcardProps) {
  const showSwipeIndicator = swipeState?.active && isFlipped;
  const swipeOpacity = showSwipeIndicator ? Math.min(Math.abs(swipeState.deltaX) / 120, 1) : 0;
  const swipeTranslateX = showSwipeIndicator
    ? Math.max(-30, Math.min(30, swipeState.deltaX * 0.15))
    : 0;

  return (
    <div
      className={`${styles.flashcard} ${isFlipped ? styles.flipped : ''}`}
      onClick={onFlip}
      role="button"
      tabIndex={0}
      aria-label={
        isFlipped
          ? 'Showing answer. Swipe right for Good, left for Again.'
          : 'Showing question. Click to reveal answer.'
      }
      style={showSwipeIndicator ? { transform: `translateX(${swipeTranslateX}px)` } : undefined}
    >
      {showSwipeIndicator && swipeState.direction === 'right' && (
        <div className={styles.swipeOverlay} style={{ opacity: swipeOpacity }}>
          <div className={`${styles.swipeIndicator} ${styles.swipeGood}`}>
            <span className={styles.swipeIcon}>&#x2713;</span>
            <span className={styles.swipeLabel}>Good</span>
          </div>
        </div>
      )}
      {showSwipeIndicator && swipeState.direction === 'left' && (
        <div className={styles.swipeOverlay} style={{ opacity: swipeOpacity }}>
          <div className={`${styles.swipeIndicator} ${styles.swipeAgain}`}>
            <span className={styles.swipeIcon}>&#x21BB;</span>
            <span className={styles.swipeLabel}>Again</span>
          </div>
        </div>
      )}
      <div className={styles.inner}>
        {/* Front - Question */}
        <div className={styles.front}>
          <div className={styles.cardHeader}>
            <span className={styles.domain}>{card.domain.name}</span>
            <BookmarkButton targetType="question" targetId={card.questionId} size="sm" />
          </div>

          <div className={styles.cardBody}>
            <p className={styles.questionText}>{card.questionText}</p>

            {card.options.length > 0 && (
              <ul className={styles.options}>
                {card.options.map((option, idx) => (
                  <li key={idx} className={styles.option}>
                    <span className={styles.optionLabel}>{String.fromCharCode(65 + idx)}</span>
                    {option}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.cardFooter}>
            <span className={styles.meta}>{card.topic.name}</span>
            <span className={styles.flipHint}>Click or press Space to flip</span>
          </div>
        </div>

        {/* Back - Answer */}
        <div className={styles.back}>
          <div className={styles.cardHeader}>
            <span className={styles.answerLabel}>Answer</span>
            <BookmarkButton targetType="question" targetId={card.questionId} size="sm" />
          </div>

          <div className={styles.cardBody}>
            <div className={styles.correctAnswers}>
              {card.correctAnswers.map((ansIdx) => (
                <span key={ansIdx} className={styles.correctAnswer}>
                  {card.options[ansIdx] || `Option ${String.fromCharCode(65 + ansIdx)}`}
                </span>
              ))}
            </div>

            {card.explanation && (
              <div className={styles.explanation}>
                <span className={styles.explanationLabel}>Explanation</span>
                <p className={styles.explanationText}>{card.explanation}</p>
              </div>
            )}

            {card.note && (
              <div className={styles.noteSection}>
                <span className={styles.noteLabel}>Your Note</span>
                <p className={styles.noteText}>{card.note}</p>
              </div>
            )}

            <QuestionFeedback questionId={card.questionId} />
          </div>

          <div className={styles.cardFooter}>
            <span className={styles.meta}>
              {card.difficulty} &middot; {card.domain.code}
            </span>
            <span className={styles.flipHint}>Swipe to rate &middot; Click to flip back</span>
          </div>
        </div>
      </div>
    </div>
  );
}
