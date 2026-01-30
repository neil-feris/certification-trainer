import { useEffect, useRef, useState } from 'react';
import { useDrillStore } from '../../../stores/drillStore';
import { DrillSummary } from './DrillSummary';
import styles from './Drills.module.css';

interface TimedDrillProps {
  onExit: () => void;
}

export function TimedDrill({ onExit }: TimedDrillProps) {
  const {
    questions,
    currentQuestionIndex,
    timeRemaining,
    isActive,
    showFeedback,
    showSummary,
    drillResults,
    responses,
    getCurrentQuestion,
    getProgress,
    answerQuestion,
    submitAnswer,
    nextQuestion,
    tick,
    abandonDrill,
    reset,
  } = useDrillStore();

  const timerRef = useRef<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentQuestion = getCurrentQuestion();
  const progress = getProgress();
  const currentResponse = currentQuestion ? responses.get(currentQuestion.id) : undefined;

  // Timer effect
  useEffect(() => {
    if (isActive && !showFeedback) {
      timerRef.current = window.setInterval(() => {
        tick();
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isActive, showFeedback, tick]);

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Timer class based on remaining time
  const getTimerClass = (): string => {
    if (timeRemaining <= 10) return styles.critical;
    if (timeRemaining <= 30) return styles.warning;
    return '';
  };

  const handleExit = async () => {
    if (window.confirm('Are you sure you want to exit? Your progress will be lost.')) {
      await abandonDrill();
      onExit();
    }
  };

  const handleAnswerChange = (optionIndex: number) => {
    if (!currentQuestion || showFeedback) return;

    const currentAnswers = currentResponse?.selectedAnswers || [];
    let newAnswers: number[];

    if (currentQuestion.questionType === 'single') {
      newAnswers = [optionIndex];
    } else {
      // Multiple choice - toggle selection
      if (currentAnswers.includes(optionIndex)) {
        newAnswers = currentAnswers.filter((a) => a !== optionIndex);
      } else {
        newAnswers = [...currentAnswers, optionIndex];
      }
    }

    answerQuestion(currentQuestion.id, newAnswers);
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await submitAnswer();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to submit answer. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    nextQuestion();
  };

  const handleDrillComplete = () => {
    reset();
    onExit();
  };

  // Show summary when drill is complete
  if (showSummary && drillResults) {
    return <DrillSummary results={drillResults} onComplete={handleDrillComplete} />;
  }

  if (!currentQuestion) {
    return (
      <div className={styles.drillContainer}>
        <div className={styles.questionArea}>
          <div style={{ textAlign: 'center', color: 'var(--error)', padding: '48px' }}>
            No questions available. Please try again.
          </div>
        </div>
      </div>
    );
  }

  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const hasAnswered = (currentResponse?.selectedAnswers.length ?? 0) > 0;

  return (
    <div className={styles.drillContainer}>
      {/* Header with Timer */}
      <div className={styles.drillHeader}>
        <button className={styles.exitBtn} onClick={handleExit}>
          X Exit
        </button>

        <div className={`${styles.timer} ${getTimerClass()}`}>
          <span className={styles.timerIcon}>O</span>
          <span>{formatTime(timeRemaining)}</span>
        </div>

        <div className={styles.drillProgress}>
          <span className={styles.progressText}>
            Question {currentQuestionIndex + 1} of {questions.length}
          </span>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        <div className={styles.drillStats}>
          <span className={styles.correctCount}>
            {progress.correct}/{progress.answered} correct
          </span>
        </div>
      </div>

      {/* Question Area */}
      <div className={styles.questionArea}>
        <div className={styles.topicBadge}>
          {currentQuestion.domain?.name ?? 'Unknown'} / {currentQuestion.topic?.name ?? 'Unknown'}
        </div>

        <div className={styles.questionCard}>
          <div className={styles.questionType}>
            {currentQuestion.questionType === 'single' ? 'Single Answer' : 'Multiple Answers'}
          </div>

          <div className={styles.questionText}>{currentQuestion.questionText}</div>

          <div className={styles.options}>
            {currentQuestion.options.map((option, index) => {
              const isSelected = currentResponse?.selectedAnswers.includes(index) ?? false;
              const isCorrect = showFeedback && currentResponse?.correctAnswers?.includes(index);
              const isIncorrect =
                showFeedback && isSelected && !currentResponse?.correctAnswers?.includes(index);

              let optionClass = styles.option;
              if (isSelected && !showFeedback) optionClass += ` ${styles.selected}`;
              if (isCorrect) optionClass += ` ${styles.correct}`;
              if (isIncorrect) optionClass += ` ${styles.incorrect}`;

              return (
                <button
                  key={index}
                  className={optionClass}
                  onClick={() => handleAnswerChange(index)}
                  disabled={showFeedback}
                >
                  <div className={styles.optionIndicator}>
                    {currentQuestion.questionType === 'single' ? (
                      <div className={styles.radio}>
                        {isSelected && <div className={styles.radioFill} />}
                      </div>
                    ) : (
                      <div className={styles.checkbox}>
                        {isSelected && <span className={styles.checkmark}>V</span>}
                      </div>
                    )}
                  </div>
                  <span className={styles.optionText}>
                    {option}
                    {isCorrect && <span className={styles.correctMark}> (Correct)</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Feedback */}
          {showFeedback && currentResponse && (
            <div
              className={`${styles.feedback} ${currentResponse.isCorrect ? styles.correct : styles.incorrect}`}
            >
              <div className={styles.feedbackHeader}>
                {currentResponse.isCorrect ? (
                  <span className={styles.feedbackIcon}>Correct!</span>
                ) : (
                  <span className={styles.feedbackIcon}>Incorrect</span>
                )}
                {currentResponse.addedToSR && (
                  <span className={styles.srBadge}>Added to Review Queue</span>
                )}
              </div>
              <div className={styles.explanation}>
                <strong>Explanation:</strong> {currentResponse.explanation}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {submitError && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          <span>{submitError}</span>
          <button
            className={styles.errorDismiss}
            onClick={() => setSubmitError(null)}
            aria-label="Dismiss error"
          >
            x
          </button>
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        {!showFeedback ? (
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!hasAnswered || isSubmitting}
          >
            {isSubmitting ? 'Checking...' : 'Check Answer'}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleNext}>
            {isLastQuestion ? 'View Results' : 'Next Question'}
          </button>
        )}
      </div>
    </div>
  );
}
