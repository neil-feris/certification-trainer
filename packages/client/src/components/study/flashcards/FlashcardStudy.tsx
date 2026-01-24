import { useParams, useNavigate } from 'react-router-dom';
import { useFlashcardStore } from '../../../stores/flashcardStore';
import { FlashcardContainer } from './FlashcardContainer';
import { Flashcard } from './Flashcard';
import { FlashcardRating } from './FlashcardRating';
import styles from './FlashcardStudy.module.css';

export function FlashcardStudy() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const getCurrentCard = useFlashcardStore((s) => s.getCurrentCard);
  const reset = useFlashcardStore((s) => s.reset);

  const numericSessionId = sessionId ? parseInt(sessionId, 10) : NaN;

  if (isNaN(numericSessionId)) {
    return (
      <div className={styles.errorState}>
        <p>Invalid session ID.</p>
        <button className={styles.backBtn} onClick={() => navigate('/study/flashcards')}>
          Back to Setup
        </button>
      </div>
    );
  }

  const handleExit = () => {
    reset();
    navigate('/study/flashcards');
  };

  const handleComplete = () => {
    navigate(`/study/flashcards/${numericSessionId}/summary`);
  };

  return (
    <div className={styles.studyPage}>
      <FlashcardContainer
        sessionId={numericSessionId}
        onExit={handleExit}
        onComplete={handleComplete}
        renderCard={({ isFlipped, onFlip, swipeState }) => {
          const card = getCurrentCard();
          if (!card) return null;
          return (
            <Flashcard card={card} isFlipped={isFlipped} onFlip={onFlip} swipeState={swipeState} />
          );
        }}
        renderRating={({ visible, onRate }) => (
          <FlashcardRating visible={visible} onRate={onRate} />
        )}
      />
    </div>
  );
}
