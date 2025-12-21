import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { examApi } from '../../api/client';
import { useExamStore } from '../../stores/examStore';
import styles from './ExamContainer.module.css';

export function ExamContainer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

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
  } = useExamStore();

  const { data: examData, isLoading } = useQuery({
    queryKey: ['exam', id],
    queryFn: () => examApi.get(parseInt(id!)),
    enabled: !!id,
  });

  // Initialize exam from API data
  useEffect(() => {
    if (examData && (!examId || examId !== parseInt(id!))) {
      const questions = examData.responses.map((r: any) => r.question);
      startExam(parseInt(id!), questions);
    }
  }, [examData, id]);

  // Timer
  useEffect(() => {
    if (!examId || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      updateTimeRemaining(timeRemaining - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [examId, timeRemaining]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeRemaining === 0 && examId) {
      handleSubmit();
    }
  }, [timeRemaining]);

  const handleSubmit = async () => {
    await submitExam();
    navigate(`/exam/${id}/review`);
  };

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
            <span className={`badge badge-accent`}>{currentQuestion.domain.name}</span>
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
      </div>

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
