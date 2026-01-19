import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useSwipeable } from 'react-swipeable';
import { questionApi } from '../../api/client';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { getCachedQuestions } from '../../services/offlineStorage';
import { queueResponse } from '../../services/syncQueue';
import styles from './Review.module.css';

type Quality = 'again' | 'hard' | 'good' | 'easy';

interface ReviewQuestion {
  id: number;
  questionText: string;
  questionType: 'single' | 'multiple';
  options: string[];
  correctAnswers: number[];
  explanation: string;
  domain: { name: string };
  spacedRepetition?: {
    interval: number;
    easeFactor: number;
    repetitions: number;
  };
}

export function Review() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [isRevealed, setIsRevealed] = useState(false);
  const [offlineQuestions, setOfflineQuestions] = useState<ReviewQuestion[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const { isOnline } = useOnlineStatus();

  // Swipe up to reveal answer (optional gesture)
  const swipeHandlers = useSwipeable({
    onSwipedUp: () => {
      if (!isRevealed && selectedAnswers.length > 0) {
        setIsRevealed(true);
      }
    },
    delta: 50,
    preventScrollOnSwipe: false,
    trackTouch: true,
    trackMouse: false,
  });

  const {
    data: onlineQuestions = [],
    isLoading,
    error,
  } = useQuery<ReviewQuestion[]>({
    queryKey: ['reviewQueue'],
    queryFn: questionApi.getReviewQueue,
    enabled: isOnline,
  });

  // Load cached questions when offline
  useEffect(() => {
    const loadOfflineQuestions = async () => {
      if (!isOnline) {
        const cached = await getCachedQuestions();
        // Convert cached questions to review format and take up to 10
        const reviewQuestions: ReviewQuestion[] = cached.slice(0, 10).map((q) => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options,
          correctAnswers: q.correctAnswers,
          explanation: q.explanation,
          domain: { name: '' }, // Domain info not available in cached data
        }));
        setOfflineQuestions(reviewQuestions);
        setIsOfflineMode(true);
      } else {
        setIsOfflineMode(false);
      }
    };
    loadOfflineQuestions();
  }, [isOnline]);

  // Use online questions when available, fall back to offline
  const questions = isOnline ? onlineQuestions : offlineQuestions;

  const submitMutation = useMutation({
    mutationFn: ({ questionId, quality }: { questionId: number; quality: Quality }) =>
      questionApi.submitReview(questionId, quality),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
    },
  });

  const handleSelectOption = (index: number) => {
    if (isRevealed) return;

    const currentQuestion = questions[currentIndex];
    if (currentQuestion.questionType === 'single') {
      setSelectedAnswers([index]);
    } else {
      setSelectedAnswers((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
      );
    }
  };

  const handleReveal = () => {
    setIsRevealed(true);
  };

  const handleRate = async (quality: Quality) => {
    const currentQuestion = questions[currentIndex];

    // In offline mode, queue the response for later sync
    if (isOfflineMode) {
      // Queue the review response (using negative session ID to indicate review mode)
      // Map quality to a numeric representation for the sync queue
      const qualityMap: Record<Quality, number> = {
        again: 0,
        hard: 1,
        good: 2,
        easy: 3,
      };

      queueResponse({
        sessionId: -1, // Special marker for review responses
        questionId: currentQuestion.id,
        selectedAnswers: [qualityMap[quality]], // Encode quality as answer
        timeSpentSeconds: 0, // Not tracking time for reviews
      }).catch((err) => {
        console.error('Failed to queue offline review response:', err);
      });
    } else {
      await submitMutation.mutateAsync({ questionId: currentQuestion.id, quality });
    }

    // Move to next question
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswers([]);
      setIsRevealed(false);
    } else {
      if (isOfflineMode) {
        // In offline mode, just navigate back when done
        navigate('/dashboard');
      } else {
        // Refetch to get any remaining questions
        queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
        setCurrentIndex(0);
        setSelectedAnswers([]);
        setIsRevealed(false);
      }
    }
  };

  if (isLoading && isOnline) {
    return (
      <div className={styles.loading}>
        <div className="animate-pulse">Loading review queue...</div>
      </div>
    );
  }

  if (error && isOnline) {
    return (
      <div className={styles.error}>
        <p>Failed to load review queue</p>
        <Link to="/dashboard" className="btn btn-primary">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>✓</div>
        <h2>{isOfflineMode ? 'No cached questions' : 'All caught up!'}</h2>
        <p>
          {isOfflineMode
            ? 'No questions have been cached for offline use. Go to the Study Hub while online to cache questions.'
            : 'No questions due for review. Check back later or practice more questions.'}
        </p>
        <Link to="/dashboard" className="btn btn-primary">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const isCorrect = (index: number) => currentQuestion.correctAnswers.includes(index);
  const isSelected = (index: number) => selectedAnswers.includes(index);

  return (
    <div className={styles.container} {...swipeHandlers}>
      {/* Desktop header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>
            {isOfflineMode ? 'Offline Practice' : 'Spaced Repetition Review'}
          </h1>
          <div className={styles.progress}>
            Question {currentIndex + 1} of {questions.length}
            {isOfflineMode && <span className={styles.offlineIndicator}> (Offline)</span>}
          </div>
        </div>
        <Link to="/dashboard" className="btn btn-ghost">
          Exit Review
        </Link>
      </header>

      {/* Mobile header */}
      <header className={styles.mobileHeader}>
        <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className={styles.backBtnText}>Exit</span>
        </button>
        <span className={styles.mobileProgress}>
          {currentIndex + 1} of {questions.length}
          {isOfflineMode && ' ⚡'}
        </span>
      </header>

      <div className={styles.main}>
        <div className={styles.questionCard}>
          <div className={styles.questionHeader}>
            <span className="badge badge-accent">{currentQuestion.domain.name}</span>
            {currentQuestion.spacedRepetition && (
              <span className={styles.srInfo}>
                Interval: {currentQuestion.spacedRepetition.interval}d
              </span>
            )}
          </div>

          <div className={styles.questionText}>{currentQuestion.questionText}</div>

          {currentQuestion.questionType === 'multiple' && (
            <div className={styles.multiNote}>Select all that apply</div>
          )}

          <div className={styles.options}>
            {currentQuestion.options.map((option, index) => {
              let optionClass = styles.option;

              if (isRevealed) {
                if (isCorrect(index)) {
                  optionClass += ` ${styles.optionCorrect}`;
                } else if (isSelected(index) && !isCorrect(index)) {
                  optionClass += ` ${styles.optionIncorrect}`;
                }
              } else if (isSelected(index)) {
                optionClass += ` ${styles.optionSelected}`;
              }

              return (
                <button
                  key={index}
                  className={optionClass}
                  onClick={() => handleSelectOption(index)}
                  disabled={isRevealed}
                >
                  <span className={styles.optionIndicator}>
                    {currentQuestion.questionType === 'single'
                      ? isSelected(index)
                        ? '●'
                        : '○'
                      : isSelected(index)
                        ? '☑'
                        : '☐'}
                  </span>
                  <span className={styles.optionText}>{option}</span>
                  {isRevealed && isCorrect(index) && <span className={styles.correctBadge}>✓</span>}
                </button>
              );
            })}
          </div>

          {isRevealed && currentQuestion.explanation && (
            <div className={styles.explanation}>
              <h4>Explanation</h4>
              <p>{currentQuestion.explanation}</p>
            </div>
          )}
        </div>

        {!isRevealed ? (
          <button
            className={`btn btn-primary ${styles.revealBtn}`}
            onClick={handleReveal}
            disabled={selectedAnswers.length === 0}
          >
            Show Answer
          </button>
        ) : (
          <div className={styles.ratingSection}>
            <p className={styles.ratingPrompt}>How well did you know this?</p>
            <div className={styles.ratingButtons}>
              <button
                className={`${styles.ratingBtn} ${styles.ratingAgain}`}
                onClick={() => handleRate('again')}
                disabled={submitMutation.isPending}
              >
                <span className={styles.ratingLabel}>Again</span>
                <span className={styles.ratingHint}>&lt;1 min</span>
              </button>
              <button
                className={`${styles.ratingBtn} ${styles.ratingHard}`}
                onClick={() => handleRate('hard')}
                disabled={submitMutation.isPending}
              >
                <span className={styles.ratingLabel}>Hard</span>
                <span className={styles.ratingHint}>&lt;10 min</span>
              </button>
              <button
                className={`${styles.ratingBtn} ${styles.ratingGood}`}
                onClick={() => handleRate('good')}
                disabled={submitMutation.isPending}
              >
                <span className={styles.ratingLabel}>Good</span>
                <span className={styles.ratingHint}>
                  {currentQuestion.spacedRepetition
                    ? `${currentQuestion.spacedRepetition.interval}d`
                    : '1d'}
                </span>
              </button>
              <button
                className={`${styles.ratingBtn} ${styles.ratingEasy}`}
                onClick={() => handleRate('easy')}
                disabled={submitMutation.isPending}
              >
                <span className={styles.ratingLabel}>Easy</span>
                <span className={styles.ratingHint}>
                  {currentQuestion.spacedRepetition
                    ? `${Math.round(currentQuestion.spacedRepetition.interval * 1.3)}d`
                    : '4d'}
                </span>
              </button>
            </div>
          </div>
        )}

        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
