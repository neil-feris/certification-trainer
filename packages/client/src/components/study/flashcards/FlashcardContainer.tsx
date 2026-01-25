import { useEffect, useCallback, useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import { useFlashcardStore } from '../../../stores/flashcardStore';
import styles from './FlashcardContainer.module.css';

export interface SwipeState {
  deltaX: number;
  direction: 'left' | 'right' | null;
  active: boolean;
}

interface FlashcardContainerProps {
  sessionId: number;
  onExit: () => void;
  onComplete: () => void;
  renderCard: (props: {
    isFlipped: boolean;
    onFlip: () => void;
    swipeState: SwipeState;
  }) => React.ReactNode;
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

  // Swipe state for visual feedback
  const [swipeState, setSwipeState] = useState<SwipeState>({
    deltaX: 0,
    direction: null,
    active: false,
  });

  const currentCard = cards[currentCardIndex];
  const currentRating = currentCard ? ratings.get(currentCard.questionId) : undefined;
  const canSwipeRate = isFlipped && !currentRating;

  const swipeHandlers = useSwipeable({
    onSwiping: (e) => {
      if (canSwipeRate) {
        const direction = e.deltaX > 0 ? 'right' : 'left';
        setSwipeState({ deltaX: e.deltaX, direction, active: true });
      }
    },
    onSwipedLeft: () => {
      if (canSwipeRate) {
        handleRate('again');
      } else {
        nextCard();
      }
      setSwipeState({ deltaX: 0, direction: null, active: false });
    },
    onSwipedRight: () => {
      if (canSwipeRate) {
        handleRate('good');
      } else {
        previousCard();
      }
      setSwipeState({ deltaX: 0, direction: null, active: false });
    },
    onTouchEndOrOnMouseUp: () => {
      setSwipeState({ deltaX: 0, direction: null, active: false });
    },
    delta: 50,
    preventScrollOnSwipe: true,
    trackTouch: true,
    trackMouse: false,
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
              swipeState,
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
        <div className={`${styles.shortcuts} ${styles.desktopShortcuts}`}>
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
        <div className={`${styles.shortcuts} ${styles.mobileShortcuts}`}>
          <div className={styles.shortcut}>
            <span>Tap to flip</span>
          </div>
          <div className={styles.shortcut}>
            <span>Swipe &#8594; Good</span>
          </div>
          <div className={styles.shortcut}>
            <span>Swipe &#8592; Again</span>
          </div>
        </div>
      </div>
    </div>
  );
}
