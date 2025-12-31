import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { questionApi } from '../../api/client';
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [isRevealed, setIsRevealed] = useState(false);

  const {
    data: questions = [],
    isLoading,
    error,
  } = useQuery<ReviewQuestion[]>({
    queryKey: ['reviewQueue'],
    queryFn: questionApi.getReviewQueue,
  });

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
    await submitMutation.mutateAsync({ questionId: currentQuestion.id, quality });

    // Move to next question
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswers([]);
      setIsRevealed(false);
    } else {
      // Refetch to get any remaining questions
      queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
      setCurrentIndex(0);
      setSelectedAnswers([]);
      setIsRevealed(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className="animate-pulse">Loading review queue...</div>
      </div>
    );
  }

  if (error) {
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
        <h2>All caught up!</h2>
        <p>No questions due for review. Check back later or practice more questions.</p>
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
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Spaced Repetition Review</h1>
          <div className={styles.progress}>
            Question {currentIndex + 1} of {questions.length}
          </div>
        </div>
        <Link to="/dashboard" className="btn btn-ghost">
          Exit Review
        </Link>
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
