import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { examApi } from '../../api/client';
import { useExamStore } from '../../stores/examStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { ExamRecoveryModal } from './ExamRecoveryModal';
import styles from './ExamContainer.module.css';

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: styles.difficultyEasy,
  medium: styles.difficultyMedium,
  hard: styles.difficultyHard,
};

export function ExamContainer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  const {
    examId,
    currentQuestionIndex,
    questions,
    responses,
    timeRemaining,
    isSubmitting,
    startExam,
    setCurrentQuestion,
    answerQuestion,
    toggleFlag,
    updateTimeRemaining,
    submitExam,
    getProgress,
    abandonExam,
    hasIncompleteExam,
  } = useExamStore();

  const { showDifficultyDuringExam } = useSettingsStore();

  const { data: examData, isLoading } = useQuery({
    queryKey: ['exam', id],
    queryFn: () => examApi.get(parseInt(id!)),
    enabled: !!id,
  });

  // Check for incomplete exam on mount
  useEffect(() => {
    if (!recoveryChecked && id) {
      const urlExamId = parseInt(id);
      // If there's an incomplete exam that differs from the URL, show recovery modal
      if (hasIncompleteExam() && examId !== null && examId !== urlExamId) {
        setShowRecoveryModal(true);
      }
      setRecoveryChecked(true);
    }
  }, [id, recoveryChecked, examId, hasIncompleteExam]);

  // Initialize exam from API data
  useEffect(() => {
    // Don't initialize if recovery modal is showing
    if (showRecoveryModal) return;

    if (examData && (!examId || examId !== parseInt(id!))) {
      const questions = examData.responses.map((r: any) => r.question);
      startExam(parseInt(id!), questions);
    }
  }, [examData, id, showRecoveryModal]);

  const handleResumeExam = () => {
    // Navigate to the stored exam
    if (examId) {
      navigate(`/exam/${examId}`);
    }
    setShowRecoveryModal(false);
  };

  const handleAbandonExam = async () => {
    await abandonExam();
    setShowRecoveryModal(false);
    // After abandoning, the effect will reinitialize with URL exam
  };

  // Memoize handleSubmit to prevent stale closures
  const handleSubmit = useCallback(async () => {
    await submitExam();
    navigate(`/exam/${id}/review`);
  }, [submitExam, navigate, id]);

  // Timer
  useEffect(() => {
    if (!examId || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      updateTimeRemaining(timeRemaining - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [examId, timeRemaining, updateTimeRemaining]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeRemaining === 0 && examId) {
      handleSubmit();
    }
  }, [timeRemaining, examId, handleSubmit]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if modal is open (except Escape)
    if (showSubmitConfirm && e.key !== 'Escape') return;

    // Don't handle if shortcuts overlay is open (except ? and Escape)
    if (showShortcuts && e.key !== '?' && e.key !== 'Escape') return;

    const currentQuestion = questions[currentQuestionIndex];
    const currentResponse = responses.get(currentQuestion?.id);

    switch (e.key) {
      // Number keys 1-9 to select options
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9': {
        const optionIndex = parseInt(e.key) - 1;
        if (currentQuestion && optionIndex < currentQuestion.options.length) {
          e.preventDefault();
          const currentAnswers = currentResponse?.selectedAnswers || [];
          const isSelected = currentAnswers.includes(optionIndex);
          const newAnswers = currentQuestion.questionType === 'single'
            ? [optionIndex]
            : isSelected
              ? currentAnswers.filter((a) => a !== optionIndex)
              : [...currentAnswers, optionIndex];
          answerQuestion(currentQuestion.id, newAnswers);
        }
        break;
      }

      // Arrow keys for navigation
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        if (currentQuestionIndex > 0) {
          setCurrentQuestion(currentQuestionIndex - 1);
        }
        break;

      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestion(currentQuestionIndex + 1);
        }
        break;

      // F key to flag/unflag
      case 'f':
      case 'F':
        e.preventDefault();
        if (currentQuestion) {
          toggleFlag(currentQuestion.id);
        }
        break;

      // Enter to confirm and move next (or submit if last)
      case 'Enter':
        e.preventDefault();
        if (showSubmitConfirm) {
          handleSubmit();
        } else if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestion(currentQuestionIndex + 1);
        } else {
          setShowSubmitConfirm(true);
        }
        break;

      // Escape to open exit confirmation or close modals
      case 'Escape':
        e.preventDefault();
        if (showShortcuts) {
          setShowShortcuts(false);
        } else if (showSubmitConfirm) {
          setShowSubmitConfirm(false);
        } else {
          setShowSubmitConfirm(true);
        }
        break;

      // ? key to toggle shortcuts help
      case '?':
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        break;
    }
  }, [
    currentQuestionIndex,
    questions,
    responses,
    showSubmitConfirm,
    showShortcuts,
    setCurrentQuestion,
    answerQuestion,
    toggleFlag,
  ]);

  // Attach keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Show recovery modal if there's an incomplete exam
  if (showRecoveryModal) {
    const storedProgress = getProgress();
    return (
      <ExamRecoveryModal
        progress={{ answered: storedProgress.answered, total: storedProgress.total }}
        currentQuestion={currentQuestionIndex}
        timeRemaining={timeRemaining}
        onResume={handleResumeExam}
        onAbandon={handleAbandonExam}
      />
    );
  }

  if (isLoading || !questions.length) {
    return (
      <div className={styles.loading}>
        <div className="animate-pulse">Loading exam...</div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentResponse = responses.get(currentQuestion.id);
  const progress = getProgress();

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isTimeWarning = timeRemaining < 600; // Less than 10 minutes

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.progress}>
            Question {currentQuestionIndex + 1} of {questions.length}
          </div>
          <div className={styles.stats}>
            <span>{progress.answered} answered</span>
            {progress.flagged > 0 && <span>{progress.flagged} flagged</span>}
          </div>
        </div>

        <div className={`${styles.timer} ${isTimeWarning ? styles.timerWarning : ''}`}>
          <span className={styles.timerIcon}>⏱</span>
          <span className={styles.timerValue}>{formatTime(timeRemaining)}</span>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setShowSubmitConfirm(true)}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Exam'}
        </button>
      </header>

      {/* Main content */}
      <div className={styles.main}>
        {/* Question */}
        <div className={styles.questionCard}>
          <div className={styles.questionHeader}>
            <div className={styles.questionHeaderLeft}>
              <span className={`badge badge-accent`}>{currentQuestion.domain.name}</span>
              {showDifficultyDuringExam && currentQuestion.difficulty && (
                <span className={`${styles.difficultyBadge} ${DIFFICULTY_STYLES[currentQuestion.difficulty]}`}>
                  {currentQuestion.difficulty}
                </span>
              )}
            </div>
            <button
              className={`${styles.flagBtn} ${currentResponse?.flagged ? styles.flagged : ''}`}
              onClick={() => toggleFlag(currentQuestion.id)}
            >
              {currentResponse?.flagged ? '★ Flagged' : '☆ Flag'}
            </button>
          </div>

          <div className={styles.questionText}>
            {currentQuestion.questionText}
          </div>

          {currentQuestion.questionType === 'multiple' && (
            <div className={styles.multiNote}>
              Select all that apply
            </div>
          )}

          <div className={styles.options}>
            {currentQuestion.options.map((option: string, index: number) => {
              const isSelected = currentResponse?.selectedAnswers.includes(index);
              return (
                <button
                  key={index}
                  className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
                  onClick={() => {
                    const newAnswers = currentQuestion.questionType === 'single'
                      ? [index]
                      : isSelected
                        ? currentResponse!.selectedAnswers.filter((a) => a !== index)
                        : [...(currentResponse?.selectedAnswers || []), index];
                    answerQuestion(currentQuestion.id, newAnswers);
                  }}
                >
                  <span className={styles.optionIndicator}>
                    {currentQuestion.questionType === 'single'
                      ? (isSelected ? '●' : '○')
                      : (isSelected ? '☑' : '☐')}
                  </span>
                  <span className={styles.optionText}>{option}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation */}
        <div className={styles.navigation}>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentQuestion(currentQuestionIndex - 1)}
            disabled={currentQuestionIndex === 0}
          >
            ← Previous
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentQuestion(currentQuestionIndex + 1)}
            disabled={currentQuestionIndex === questions.length - 1}
          >
            Next →
          </button>
        </div>

        {/* Question Grid */}
        <div className={styles.grid}>
          {questions.map((q, i) => {
            const resp = responses.get(q.id);
            const isAnswered = resp && resp.selectedAnswers.length > 0;
            const isFlagged = resp?.flagged;
            const isCurrent = i === currentQuestionIndex;

            return (
              <button
                key={q.id}
                className={`${styles.gridItem} ${isCurrent ? styles.gridCurrent : ''} ${isAnswered ? styles.gridAnswered : ''} ${isFlagged ? styles.gridFlagged : ''}`}
                onClick={() => setCurrentQuestion(i)}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className={styles.shortcutsHint}>
          <button
            className={styles.shortcutsHintBtn}
            onClick={() => setShowShortcuts(true)}
            aria-label="Show keyboard shortcuts"
          >
            <kbd>?</kbd> Keyboard shortcuts
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div
          className={styles.modal}
          onClick={() => setShowShortcuts(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
        >
          <div
            className={styles.shortcutsOverlay}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.shortcutsHeader}>
              <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
              <button
                className={styles.shortcutsClose}
                onClick={() => setShowShortcuts(false)}
                aria-label="Close shortcuts"
              >
                x
              </button>
            </div>
            <div className={styles.shortcutsGrid}>
              <div className={styles.shortcutGroup}>
                <h3>Answer Selection</h3>
                <div className={styles.shortcutItem}>
                  <kbd>1</kbd> - <kbd>9</kbd>
                  <span>Select answer option</span>
                </div>
              </div>
              <div className={styles.shortcutGroup}>
                <h3>Navigation</h3>
                <div className={styles.shortcutItem}>
                  <kbd>Arrow Left</kbd> / <kbd>Arrow Up</kbd>
                  <span>Previous question</span>
                </div>
                <div className={styles.shortcutItem}>
                  <kbd>Arrow Right</kbd> / <kbd>Arrow Down</kbd>
                  <span>Next question</span>
                </div>
                <div className={styles.shortcutItem}>
                  <kbd>Enter</kbd>
                  <span>Next question / Submit (on last)</span>
                </div>
              </div>
              <div className={styles.shortcutGroup}>
                <h3>Actions</h3>
                <div className={styles.shortcutItem}>
                  <kbd>F</kbd>
                  <span>Flag / Unflag question</span>
                </div>
                <div className={styles.shortcutItem}>
                  <kbd>Esc</kbd>
                  <span>Open submit dialog / Close modal</span>
                </div>
                <div className={styles.shortcutItem}>
                  <kbd>?</kbd>
                  <span>Toggle this help</span>
                </div>
              </div>
            </div>
            <div className={styles.shortcutsFooter}>
              <span>Press <kbd>Esc</kbd> or <kbd>?</kbd> to close</span>
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Submit Exam?</h2>
            <p>
              You have answered {progress.answered} of {progress.total} questions.
              {progress.total - progress.answered > 0 && (
                <> <strong>{progress.total - progress.answered}</strong> questions are unanswered.</>
              )}
            </p>
            {progress.flagged > 0 && (
              <p>You have {progress.flagged} flagged questions.</p>
            )}
            <div className={styles.modalActions}>
              <button className="btn btn-ghost" onClick={() => setShowSubmitConfirm(false)}>
                Continue Exam
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
