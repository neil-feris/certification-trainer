import { useEffect, useCallback } from 'react';
import { useFlashcardStore } from '../../../stores/flashcardStore';
import { useSwipeNavigation } from '../../../hooks/useSwipeNavigation';
import styles from './FlashcardContainer.module.css';

interface FlashcardContainerProps {
  sessionId: number;
  onExit: () => void;
  onComplete: () => void;
  renderCard: (props: { isFlipped: boolean; onFlip: () => void }) => React.ReactNode;
  renderRating: (props: {
    visible: boolean;
    onRate: (rating: 'again' | 'hard' | 'good' | 'easy') => void;
  }) => React.ReactNode;
}

export function FlashcardContainer({
  sessionId,
  onExit,
  onComplete,
  renderCard,
  renderRating,
}: FlashcardContainerProps) {
  const {
    cards,
    currentCardIndex,
    isFlipped,
    isLoading,
    isCompleting,
    ratings,
    loadSession,
    flipCard,
    rateCard,
    nextCard,
    previousCard,
    isLastCard,
    isFirstCard,
    allCardsRated,
    completeSession,
    getProgress,
  } = useFlashcardStore();

  const progress = getProgress();

  useEffect(() => {
    loadSession(sessionId);
  }, [sessionId, loadSession]);

  const handleRate = useCallback(
    async (rating: 'again' | 'hard' | 'good' | 'easy') => {
      await rateCard(rating);
      if (!isLastCard()) {
        setTimeout(() => nextCard(), 300);
      }
    },
    [rateCard, isLastCard, nextCard]
  );

  const handleComplete = useCallback(async () => {
    const result = await completeSession();
    if (result) {
      onComplete();
    }
  }, [completeSession, onComplete]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          flipCard();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          previousCard();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextCard();
          break;
        case '1':
          if (isFlipped) handleRate('again');
          break;
        case '2':
          if (isFlipped) handleRate('hard');
          break;
        case '3':
          if (isFlipped) handleRate('good');
          break;
        case '4':
          if (isFlipped) handleRate('easy');
          break;
        case 'Escape':
          onExit();
          break;
      }
    },
    [flipCard, previousCard, nextCard, isFlipped, handleRate, onExit]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const { handlers: swipeHandlers } = useSwipeNavigation({
    onSwipeLeft: () => nextCard(),
    onSwipeRight: () => previousCard(),
  });

  if (isLoading || cards.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading flashcards...</span>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentCardIndex];
  const currentRating = currentCard ? ratings.get(currentCard.questionId) : undefined;
  const progressPercent = (progress.rated / progress.total) * 100;

  return (
    <div className={styles.container} {...swipeHandlers}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.exitBtn} onClick={onExit} title="Exit (Esc)">
            <span>&#x2190;</span>
            <span className={styles.exitBtnText}>Exit</span>
          </button>
        </div>

        <div className={styles.progressSection}>
          <span className={styles.progressText}>
            Card {progress.current} of {progress.total} &middot; {progress.rated} rated
          </span>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <span className={styles.cardCount}>
          {progress.rated}/{progress.total}
        </span>
      </div>

      <div className={styles.main}>
        <div className={styles.cardArea}>
          <button
            className={styles.navBtn}
            onClick={previousCard}
            disabled={isFirstCard()}
            title="Previous (←)"
          >
            &#x2039;
          </button>

          <div className={styles.cardWrapper}>
            {renderCard({
              isFlipped,
              onFlip: flipCard,
            })}
          </div>

          <button
            className={styles.navBtn}
            onClick={nextCard}
            disabled={isLastCard()}
            title="Next (→)"
          >
            &#x203A;
          </button>
        </div>

        {renderRating({
          visible: isFlipped && !currentRating,
          onRate: handleRate,
        })}

        {allCardsRated() && (
          <button className={styles.completeBtn} onClick={handleComplete} disabled={isCompleting}>
            {isCompleting ? 'Completing...' : 'Complete Session'}
          </button>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.shortcuts}>
          <div className={styles.shortcut}>
            <span className={styles.key}>Space</span>
            <span>Flip</span>
          </div>
          <div className={styles.shortcut}>
            <span className={styles.key}>&#8592;</span>
            <span className={styles.key}>&#8594;</span>
            <span>Navigate</span>
          </div>
          <div className={styles.shortcut}>
            <span className={styles.key}>1</span>-<span className={styles.key}>4</span>
            <span>Rate</span>
          </div>
          <div className={styles.shortcut}>
            <span className={styles.key}>Esc</span>
            <span>Exit</span>
          </div>
        </div>
      </div>
    </div>
  );
}
