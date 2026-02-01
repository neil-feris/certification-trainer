import { useState, useEffect, useCallback } from 'react';
import { useWorkbookStore } from '../../../stores/workbookStore';
import { useTimer } from '../../../hooks/useTimer';
import { WorkbookQuestion } from './WorkbookQuestion';
import styles from './QuickAssessment.module.css';

interface Props {
  onExit: () => void;
}

interface AssessmentResult {
  score: number;
  correctCount: number;
  totalCount: number;
}

export function QuickAssessment({ onExit }: Props) {
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<AssessmentResult | null>(null);

  const assessmentQuestions = useWorkbookStore((s) => s.assessmentQuestions);
  const assessmentResponses = useWorkbookStore((s) => s.assessmentResponses);
  const currentQuestionIndex = useWorkbookStore((s) => s.currentQuestionIndex);
  const timeLimit = useWorkbookStore((s) => s.timeLimit);
  const answerQuestion = useWorkbookStore((s) => s.answerQuestion);
  const nextQuestion = useWorkbookStore((s) => s.nextQuestion);
  const previousQuestion = useWorkbookStore((s) => s.previousQuestion);
  const completeAssessment = useWorkbookStore((s) => s.completeAssessment);
  const isLoading = useWorkbookStore((s) => s.isLoading);

  const currentQuestion = assessmentQuestions[currentQuestionIndex];
  const currentResponse = currentQuestion ? assessmentResponses.get(currentQuestion.id) : undefined;

  // Calculate answered count
  const answeredCount = Array.from(assessmentResponses.values()).filter(
    (r) => r.selectedAnswers.length > 0
  ).length;
  const totalQuestions = assessmentQuestions.length;
  const allAnswered = answeredCount === totalQuestions;

  // Handle time expiry
  const handleTimeExpiry = useCallback(async () => {
    if (isSubmitting || results) return;
    setIsSubmitting(true);
    try {
      const result = await completeAssessment();
      setResults(result);
    } catch (error) {
      console.error('Failed to submit assessment:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [completeAssessment, isSubmitting, results]);

  // Warning callback for timer - visual feedback via timer color change
  const handleWarning = useCallback(() => {
    // Toast notifications could be added here in the future
    // For now, the visual timer change is sufficient feedback
  }, []);

  const {
    formattedTime,
    timeRemaining,
    isExpired,
    start: startTimer,
  } = useTimer({
    initialSeconds: timeLimit || 900, // Default 15 min
    onComplete: handleTimeExpiry,
    onWarning: handleWarning,
    warningThresholds: [300, 60], // 5 min and 1 min warnings
    autoStart: false,
  });

  // Start timer when questions are loaded
  useEffect(() => {
    if (assessmentQuestions.length > 0 && !results) {
      startTimer();
    }
  }, [assessmentQuestions.length, startTimer, results]);

  // Get timer state for styling
  const getTimerClass = () => {
    if (timeRemaining <= 60) return styles.timerCritical;
    if (timeRemaining <= 300) return styles.timerWarning;
    return '';
  };

  // Handle answer selection
  const handleSelectAnswers = (answers: number[]) => {
    if (currentQuestion) {
      answerQuestion(currentQuestion.id, answers);
    }
  };

  // Handle mark for review toggle
  const toggleMarkForReview = () => {
    if (!currentQuestion) return;
    setMarkedForReview((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) {
        next.delete(currentQuestion.id);
      } else {
        next.add(currentQuestion.id);
      }
      return next;
    });
  };

  // Handle navigation
  const goToQuestion = (index: number) => {
    // Update currentQuestionIndex directly through store navigation
    const diff = index - currentQuestionIndex;
    if (diff > 0) {
      for (let i = 0; i < diff; i++) nextQuestion();
    } else if (diff < 0) {
      for (let i = 0; i < Math.abs(diff); i++) previousQuestion();
    }
  };

  // Handle submit
  const handleSubmitClick = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    setIsSubmitting(true);
    try {
      const result = await completeAssessment();
      setResults(result);
    } catch (error) {
      console.error('Failed to submit assessment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get score category for styling
  const getScoreClass = (score: number) => {
    if (score >= 80) return styles.scoreExcellent;
    if (score >= 60) return styles.scoreGood;
    return styles.scoreNeedsWork;
  };

  const getResultIcon = (score: number) => {
    if (score >= 80) return '🎉';
    if (score >= 60) return '👍';
    return '📚';
  };

  const getResultMessage = (score: number) => {
    if (score >= 80) return 'Excellent work! You have a strong grasp of the material.';
    if (score >= 60) return 'Good progress! Keep practicing to strengthen weak areas.';
    return 'Keep studying! Review the explanations to improve your understanding.';
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
        </div>
      </div>
    );
  }

  // Results screen
  if (results) {
    return (
      <div className={styles.container}>
        <div className={styles.results}>
          <div className={styles.resultsCard}>
            <div className={styles.resultsIcon}>{getResultIcon(results.score)}</div>
            <h2 className={styles.resultsTitle}>Assessment Complete</h2>

            <div className={`${styles.scoreCircle} ${getScoreClass(results.score)}`}>
              <span className={styles.scoreValue}>{results.score}%</span>
              <span className={styles.scoreLabel}>Score</span>
            </div>

            <div className={styles.resultsStats}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{results.correctCount}</span>
                <span className={styles.statLabel}>Correct</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statItem}>
                <span className={styles.statValue}>{results.totalCount}</span>
                <span className={styles.statLabel}>Total</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statItem}>
                <span className={styles.statValue}>
                  {results.totalCount - results.correctCount}
                </span>
                <span className={styles.statLabel}>Missed</span>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
              {getResultMessage(results.score)}
            </p>

            <div className={styles.resultsActions}>
              <button onClick={onExit} className={styles.primaryButton}>
                Back to Workbook
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No questions loaded
  if (!currentQuestion) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <p>Loading questions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header with timer */}
      <div className={styles.header}>
        <button onClick={onExit} className={styles.exitButton}>
          Exit
        </button>

        <div className={styles.headerCenter}>
          <div className={`${styles.timer} ${getTimerClass()}`}>{formattedTime}</div>
          <span className={styles.progressText}>
            Question {currentQuestionIndex + 1} of {totalQuestions} ({answeredCount} answered)
          </span>
        </div>

        {markedForReview.size > 0 && (
          <div className={styles.markedCount}>
            <span>⚑</span>
            <span>{markedForReview.size} marked</span>
          </div>
        )}
      </div>

      {/* Question Navigation Grid */}
      <div className={styles.navSection}>
        <div className={styles.navGrid}>
          {assessmentQuestions.map((q, index) => {
            const response = assessmentResponses.get(q.id);
            const isAnswered = response && response.selectedAnswers.length > 0;
            const isCurrent = index === currentQuestionIndex;
            const isMarked = markedForReview.has(q.id);

            let buttonClass = styles.navButton;
            if (isCurrent) buttonClass += ` ${styles.navButtonCurrent}`;
            else if (isAnswered) buttonClass += ` ${styles.navButtonAnswered}`;
            if (isMarked) buttonClass += ` ${styles.navButtonMarked}`;

            return (
              <button
                key={q.id}
                className={buttonClass}
                onClick={() => goToQuestion(index)}
                style={{ position: 'relative' }}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Question Area */}
      <div className={styles.questionArea}>
        <div className={styles.domainLabel}>
          {currentQuestion.domain.code}: {currentQuestion.domain.name}
        </div>

        <WorkbookQuestion
          question={currentQuestion}
          selectedAnswers={currentResponse?.selectedAnswers || []}
          onSelect={handleSelectAnswers}
          disabled={isSubmitting}
        />
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <div className={styles.navButtons}>
          <button
            className={`${styles.actionButton} ${styles.prevButton}`}
            onClick={previousQuestion}
            disabled={currentQuestionIndex === 0}
          >
            ← Prev
          </button>

          <button
            className={`${styles.actionButton} ${styles.markButton} ${
              markedForReview.has(currentQuestion.id) ? styles.markButtonActive : ''
            }`}
            onClick={toggleMarkForReview}
          >
            {markedForReview.has(currentQuestion.id) ? '⚑ Marked' : '⚐ Mark'}
          </button>

          <button
            className={`${styles.actionButton} ${styles.nextButton}`}
            onClick={nextQuestion}
            disabled={currentQuestionIndex === totalQuestions - 1}
          >
            Next →
          </button>
        </div>

        <button
          className={styles.submitButton}
          onClick={handleSubmitClick}
          disabled={isSubmitting || (!allAnswered && !isExpired)}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Assessment'}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className={styles.modalOverlay} onClick={() => setShowConfirmModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Submit Assessment?</h3>
            <p className={styles.modalMessage}>
              You have answered {answeredCount} of {totalQuestions} questions.
            </p>

            {!allAnswered && (
              <div className={styles.modalWarning}>
                <span>⚠</span>
                <span>
                  {totalQuestions - answeredCount} question
                  {totalQuestions - answeredCount !== 1 ? 's' : ''} unanswered
                </span>
              </div>
            )}

            {markedForReview.size > 0 && (
              <div className={styles.modalWarning}>
                <span>⚑</span>
                <span>
                  {markedForReview.size} question
                  {markedForReview.size !== 1 ? 's' : ''} marked for review
                </span>
              </div>
            )}

            <div className={styles.modalActions}>
              <button className={styles.cancelButton} onClick={() => setShowConfirmModal(false)}>
                Continue Quiz
              </button>
              <button className={styles.confirmButton} onClick={handleConfirmSubmit}>
                Submit Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
