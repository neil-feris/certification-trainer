import { useState, useEffect, useCallback } from 'react';
import { useWorkbookStore } from '../../../stores/workbookStore';
import { useTimer } from '../../../hooks/useTimer';
import { WorkbookQuestion } from './WorkbookQuestion';
import styles from './FullExam.module.css';

interface Props {
  onExit: () => void;
}

const EXAM_DURATION_SECONDS = 3600; // 60 minutes
const WARNING_10_MIN = 600;
const WARNING_5_MIN = 300;

export function FullExam({ onExit }: Props) {
  const {
    assessmentQuestions,
    assessmentResponses,
    currentQuestionIndex,
    answerQuestion,
    nextQuestion,
    previousQuestion,
    goToQuestion,
    completeAssessment,
  } = useWorkbookStore();

  const [markedQuestions, setMarkedQuestions] = useState<Set<number>>(new Set());
  const [warningLevel, setWarningLevel] = useState<'none' | '10min' | '5min'>('none');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTimeExpired = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await completeAssessment();
    } finally {
      setIsSubmitting(false);
    }
  }, [completeAssessment]);

  const handleWarning = useCallback((secondsRemaining: number) => {
    if (secondsRemaining <= WARNING_5_MIN) {
      setWarningLevel('5min');
    } else if (secondsRemaining <= WARNING_10_MIN) {
      setWarningLevel('10min');
    }
  }, []);

  const { formattedTime, percentRemaining, start } = useTimer({
    initialSeconds: EXAM_DURATION_SECONDS,
    onComplete: handleTimeExpired,
    onWarning: handleWarning,
    warningThresholds: [WARNING_10_MIN, WARNING_5_MIN],
    autoStart: false,
  });

  // Start timer on mount
  useEffect(() => {
    start();
  }, [start]);

  const currentQuestion = assessmentQuestions[currentQuestionIndex];
  const currentResponse = currentQuestion ? assessmentResponses.get(currentQuestion.id) : undefined;

  const answeredCount = Array.from(assessmentResponses.values()).filter(
    (r) => r.selectedAnswers.length > 0
  ).length;

  const unansweredCount = assessmentQuestions.length - answeredCount;
  const markedCount = markedQuestions.size;

  const handleAnswerSelect = (answers: number[]) => {
    if (currentQuestion) {
      answerQuestion(currentQuestion.id, answers);
    }
  };

  const toggleMark = () => {
    if (!currentQuestion) return;
    setMarkedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) {
        next.delete(currentQuestion.id);
      } else {
        next.add(currentQuestion.id);
      }
      return next;
    });
  };

  const jumpToQuestion = (index: number) => {
    goToQuestion(index);
  };

  const handleSubmitClick = () => {
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmation(false);
    setIsSubmitting(true);
    try {
      await completeAssessment();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSubmit = () => {
    setShowConfirmation(false);
  };

  const getQuestionStatus = (index: number) => {
    const question = assessmentQuestions[index];
    const response = assessmentResponses.get(question.id);
    const isAnswered = response && response.selectedAnswers.length > 0;
    const isCurrent = index === currentQuestionIndex;
    const isMarked = markedQuestions.has(question.id);

    return { isAnswered, isCurrent, isMarked };
  };

  const getTimerClass = () => {
    const classes = [styles.timer];
    if (warningLevel === '5min') {
      classes.push(styles.timerCritical);
    } else if (warningLevel === '10min') {
      classes.push(styles.timerWarning);
    }
    return classes.join(' ');
  };

  const getGridButtonClass = (index: number) => {
    const { isAnswered, isCurrent, isMarked } = getQuestionStatus(index);
    const classes = [styles.gridButton];

    if (isCurrent) {
      classes.push(styles.gridCurrent);
    } else if (isAnswered) {
      classes.push(styles.gridAnswered);
    } else {
      classes.push(styles.gridUnanswered);
    }

    if (isMarked) {
      classes.push(styles.gridMarked);
    }

    return classes.join(' ');
  };

  if (!currentQuestion) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading exam questions...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header with timer and controls */}
      <header className={styles.header}>
        <button className={styles.exitButton} onClick={onExit} disabled={isSubmitting}>
          Exit Exam
        </button>

        <div className={styles.headerCenter}>
          <div className={getTimerClass()}>
            <svg
              className={styles.timerIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12,6 12,12 16,14" />
            </svg>
            <span className={styles.timerText}>{formattedTime}</span>
          </div>
          <div className={styles.timerProgress}>
            <div className={styles.timerProgressBar} style={{ width: `${percentRemaining}%` }} />
          </div>
        </div>

        <div className={styles.headerStats}>
          <span className={styles.statItem}>
            <span className={styles.statValue}>{answeredCount}</span>
            <span className={styles.statLabel}>Answered</span>
          </span>
          {markedCount > 0 && (
            <span className={styles.statItemMarked}>
              <span className={styles.statValue}>{markedCount}</span>
              <span className={styles.statLabel}>Marked</span>
            </span>
          )}
        </div>
      </header>

      <div className={styles.mainContent}>
        {/* Question navigation grid */}
        <aside className={styles.sidebar}>
          <h3 className={styles.sidebarTitle}>Questions</h3>
          <div className={styles.questionGrid}>
            {assessmentQuestions.map((_, index) => (
              <button
                key={index}
                className={getGridButtonClass(index)}
                onClick={() => jumpToQuestion(index)}
                disabled={isSubmitting}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className={styles.gridLegend}>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotAnswered}`} />
              <span>Answered</span>
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotUnanswered}`} />
              <span>Unanswered</span>
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotMarked}`} />
              <span>Marked</span>
            </div>
          </div>
        </aside>

        {/* Question display area */}
        <main className={styles.questionArea}>
          <div className={styles.questionHeader}>
            <span className={styles.questionNumber}>
              Question {currentQuestionIndex + 1} of {assessmentQuestions.length}
            </span>
            <button
              className={`${styles.markButton} ${markedQuestions.has(currentQuestion.id) ? styles.markButtonActive : ''}`}
              onClick={toggleMark}
              disabled={isSubmitting}
            >
              <svg
                viewBox="0 0 24 24"
                fill={markedQuestions.has(currentQuestion.id) ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {markedQuestions.has(currentQuestion.id) ? 'Marked' : 'Mark for Review'}
            </button>
          </div>

          <div className={styles.questionContent}>
            <WorkbookQuestion
              question={currentQuestion}
              selectedAnswers={currentResponse?.selectedAnswers || []}
              onSelect={handleAnswerSelect}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.navigationButtons}>
            <button
              className={styles.navButton}
              onClick={previousQuestion}
              disabled={currentQuestionIndex === 0 || isSubmitting}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15,18 9,12 15,6" />
              </svg>
              Previous
            </button>

            {currentQuestionIndex < assessmentQuestions.length - 1 ? (
              <button
                className={`${styles.navButton} ${styles.navButtonPrimary}`}
                onClick={nextQuestion}
                disabled={isSubmitting}
              >
                Next
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9,6 15,12 9,18" />
                </svg>
              </button>
            ) : (
              <button
                className={`${styles.navButton} ${styles.submitButton}`}
                onClick={handleSubmitClick}
                disabled={isSubmitting}
              >
                Submit Exam
              </button>
            )}
          </div>
        </main>
      </div>

      {/* Submit confirmation modal */}
      {showConfirmation && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Submit Exam?</h3>
            <p className={styles.modalText}>
              Are you sure you want to submit? You have{' '}
              <strong>
                {unansweredCount} question{unansweredCount !== 1 ? 's' : ''} unanswered
              </strong>{' '}
              and <strong>{formattedTime} remaining</strong>.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={handleCancelSubmit}>
                Continue Exam
              </button>
              <button
                className={styles.modalConfirm}
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
