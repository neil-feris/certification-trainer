import { Link } from 'react-router-dom';
import { useStudyStore } from '../../../stores/studyStore';
import { useSwipeNavigation } from '../../../hooks/useSwipeNavigation';
import { showToast } from '../../common/Toast';
import { BookmarkButton } from '../../common/BookmarkButton';
import { NotesPanel } from '../../common/NotesPanel';
import { QuestionFeedback } from '../../common/QuestionFeedback';
import { PracticeQuestion } from './PracticeQuestion';
import { PracticeSummary } from './PracticeSummary';
import styles from './Practice.module.css';

interface TopicPracticeProps {
  onExit: () => void;
}

export function TopicPractice({ onExit }: TopicPracticeProps) {
  const {
    questions,
    currentQuestionIndex,
    showSummary,
    isRevealed,
    responses,
    getCurrentQuestion,
    getProgress,
    answerQuestion,
    revealAnswer,
    nextQuestion,
    previousQuestion,
    completeSession,
  } = useStudyStore();

  const currentQuestion = getCurrentQuestion();
  const progress = getProgress();
  const currentResponse = currentQuestion ? responses.get(currentQuestion.id) : undefined;

  // Swipe navigation - only when answer is revealed
  const canGoNext = isRevealed && currentQuestionIndex < questions.length - 1;
  const canGoPrev = currentQuestionIndex > 0;

  const { handlers: swipeHandlers } = useSwipeNavigation({
    onSwipeLeft: () => {
      if (canGoNext) nextQuestion();
    },
    onSwipeRight: () => {
      if (canGoPrev) previousQuestion();
    },
  });

  if (showSummary) {
    return <PracticeSummary onComplete={completeSession} onExit={onExit} />;
  }

  if (!currentQuestion) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>No questions available. Please try again.</div>
      </div>
    );
  }

  const handleAnswerChange = (answers: number[]) => {
    answerQuestion(currentQuestion.id, answers);
  };

  const handleReveal = async () => {
    try {
      await revealAnswer();
    } catch (error) {
      console.error('Failed to reveal answer:', error);
      showToast({
        message: 'Failed to save response. Please try again.',
        type: 'error',
      });
    }
  };

  const handleNext = () => {
    nextQuestion();
  };

  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  return (
    <div className={styles.container} {...swipeHandlers}>
      <div className={styles.header}>
        <button className={`btn btn-ghost ${styles.exitBtn}`} onClick={onExit}>
          <span aria-hidden="true">←</span>
          <span className={styles.exitBtnText}> Exit Practice</span>
        </button>

        <div className={styles.progressInfo}>
          <span className={styles.questionNumber}>
            {currentQuestionIndex + 1} of {questions.length}
          </span>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        <div className={styles.stats}>
          <span className={styles.correctCount}>
            {progress.correct}/{progress.answered}
          </span>
        </div>
      </div>

      <div className={styles.questionArea}>
        <div className={styles.topicBadgeRow}>
          <div className={styles.topicBadge}>
            {currentQuestion.domain.name} → {currentQuestion.topic.name}
            {currentQuestion.caseStudy && (
              <Link
                to={`/case-studies/${currentQuestion.caseStudy.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.caseStudyBadge}
                title={`View ${currentQuestion.caseStudy.name} case study`}
              >
                <span className={styles.caseStudyIcon}>📋</span>
                {currentQuestion.caseStudy.name}
              </Link>
            )}
          </div>
          <BookmarkButton targetType="question" targetId={currentQuestion.id} size="sm" />
        </div>

        <PracticeQuestion
          question={currentQuestion}
          selectedAnswers={currentResponse?.selectedAnswers || []}
          onAnswerChange={handleAnswerChange}
          isRevealed={isRevealed}
        />

        {isRevealed && currentResponse && (
          <div
            className={`${styles.feedback} ${currentResponse.isCorrect ? styles.correct : styles.incorrect}`}
          >
            <div className={styles.feedbackHeader}>
              {currentResponse.isCorrect ? (
                <span className={styles.feedbackIcon}>✓ Correct!</span>
              ) : (
                <span className={styles.feedbackIcon}>✗ Incorrect</span>
              )}
              {currentResponse.addedToSR && (
                <span className={styles.srBadge}>Added to Review Queue</span>
              )}
            </div>
            <div className={styles.explanation}>
              <strong>Explanation:</strong> {currentQuestion.explanation}
            </div>
            <QuestionFeedback questionId={currentQuestion.id} />
          </div>
        )}

        {isRevealed && (
          <NotesPanel questionId={currentQuestion.id} className={styles.notesSection} />
        )}
      </div>

      <div className={styles.actions}>
        <button
          className="btn btn-ghost"
          onClick={previousQuestion}
          disabled={currentQuestionIndex === 0}
        >
          ← Previous
        </button>

        {!isRevealed ? (
          <button
            className="btn btn-primary"
            onClick={handleReveal}
            disabled={!currentResponse?.selectedAnswers.length}
          >
            Check Answer
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleNext}>
            {isLastQuestion ? 'View Results' : 'Next Question →'}
          </button>
        )}
      </div>
    </div>
  );
}
