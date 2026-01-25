import { useState } from 'react';
import type { QotdResponse, QotdCompletionResponse } from '@ace-prep/shared';
import styles from './QotdWidget.module.css';

interface QotdWidgetProps {
  data: QotdResponse | null;
  isLoading: boolean;
  isError: boolean;
  onSubmit: (selectedAnswers: number[]) => Promise<QotdCompletionResponse>;
  onRetry: () => void;
}

export function QotdWidget({ data, isLoading, isError, onSubmit, onRetry }: QotdWidgetProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<QotdCompletionResponse | null>(null);

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.badge}>Question of the Day</span>
        </div>
        <div className={styles.skeleton}>
          <div className={styles.skeletonLine} style={{ width: '90%' }} />
          <div className={styles.skeletonLine} style={{ width: '75%' }} />
          <div className={styles.skeletonOptions}>
            <div className={styles.skeletonOption} />
            <div className={styles.skeletonOption} />
            <div className={styles.skeletonOption} />
            <div className={styles.skeletonOption} />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.badge}>Question of the Day</span>
        </div>
        <div className={styles.errorState}>
          <p>Failed to load today's question</p>
          <button className="btn btn-secondary" onClick={onRetry}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Empty state (no questions available)
  if (!data) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.badge}>Question of the Day</span>
        </div>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📚</span>
          <p className={styles.emptyTitle}>No questions available yet</p>
          <p className={styles.emptyDescription}>
            Add questions to this certification to enable the daily challenge.
          </p>
        </div>
      </div>
    );
  }

  const { question, completion, correctAnswers, explanation } = data;
  const isCompleted = completion !== null || result !== null;
  const finalResult =
    result ||
    (completion
      ? {
          isCorrect: completion.isCorrect,
          correctAnswers: correctAnswers || [],
          explanation: explanation || '',
          xpAwarded: 0,
        }
      : null);

  const handleOptionClick = (index: number) => {
    if (isCompleted || isSubmitting) return;

    if (question.questionType === 'single') {
      setSelectedAnswers([index]);
    } else {
      if (selectedAnswers.includes(index)) {
        setSelectedAnswers(selectedAnswers.filter((i) => i !== index));
      } else {
        setSelectedAnswers([...selectedAnswers, index]);
      }
    }
  };

  const handleSubmit = async () => {
    if (selectedAnswers.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await onSubmit(selectedAnswers);
      setResult(response);
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOptionClass = (index: number) => {
    const classes = [styles.option];

    // Show user's selection (current or from completion)
    const userAnswers = isCompleted && completion ? completion.selectedAnswers : selectedAnswers;

    if (userAnswers.includes(index)) {
      classes.push(styles.selected);
    }

    if (isCompleted && finalResult) {
      if (finalResult.correctAnswers.includes(index)) {
        classes.push(styles.correct);
      } else if (userAnswers.includes(index)) {
        classes.push(styles.incorrect);
      }
    }

    return classes.join(' ');
  };

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.badge}>Question of the Day</span>
        <div className={styles.meta}>
          <span className={styles.topic}>{question.topic.name}</span>
          <span className={styles.difficulty} data-difficulty={question.difficulty}>
            {question.difficulty}
          </span>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.questionType}>
          {question.questionType === 'multiple' ? 'Select all that apply' : 'Select one answer'}
        </div>

        <p className={styles.questionText}>{question.questionText}</p>

        <div className={styles.options}>
          {question.options.map((option, index) => (
            <button
              key={index}
              className={getOptionClass(index)}
              onClick={() => handleOptionClick(index)}
              disabled={isCompleted || isSubmitting}
            >
              <span className={styles.optionIndicator}>
                {question.questionType === 'single' ? (
                  <span className={styles.radio}>
                    {(isCompleted && completion
                      ? completion.selectedAnswers
                      : selectedAnswers
                    ).includes(index) && <span className={styles.radioFill} />}
                  </span>
                ) : (
                  <span className={styles.checkbox}>
                    {(isCompleted && completion
                      ? completion.selectedAnswers
                      : selectedAnswers
                    ).includes(index) && <span className={styles.checkmark}>✓</span>}
                  </span>
                )}
              </span>
              <span className={styles.optionText}>{option}</span>
              {isCompleted && finalResult?.correctAnswers.includes(index) && (
                <span className={styles.correctMark}>✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Feedback after submission */}
        {isCompleted && finalResult && (
          <div
            className={`${styles.feedback} ${finalResult.isCorrect ? styles.correct : styles.incorrect}`}
          >
            <div className={styles.feedbackHeader}>
              <span className={styles.feedbackIcon}>
                {finalResult.isCorrect ? '✓ Correct!' : '✗ Incorrect'}
              </span>
              {result && result.xpAwarded > 0 && (
                <span className={styles.xpBadge}>+{result.xpAwarded} XP</span>
              )}
            </div>
            {finalResult.explanation && (
              <p className={styles.explanation}>{finalResult.explanation}</p>
            )}
          </div>
        )}

        {/* Submit button */}
        {!isCompleted && (
          <button
            className={`btn btn-primary ${styles.submitBtn}`}
            onClick={handleSubmit}
            disabled={selectedAnswers.length === 0 || isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Answer'}
          </button>
        )}

        {/* Already completed message */}
        {isCompleted && completion && !result && (
          <div className={styles.completedMessage}>You already answered today's question</div>
        )}
      </div>
    </div>
  );
}
