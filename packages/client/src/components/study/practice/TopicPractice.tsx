import { useStudyStore } from '../../../stores/studyStore';
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

  if (showSummary) {
    return <PracticeSummary onComplete={completeSession} onExit={onExit} />;
  }

  if (!currentQuestion) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          No questions available. Please try again.
        </div>
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
    }
  };

  const handleNext = () => {
    nextQuestion();
  };

  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={`btn btn-ghost ${styles.exitBtn}`} onClick={onExit}>
          ← Exit Practice
        </button>

        <div className={styles.progressInfo}>
          <span className={styles.questionNumber}>
            Question {currentQuestionIndex + 1} of {questions.length}
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
            {progress.correct}/{progress.answered} correct
          </span>
        </div>
      </div>

      <div className={styles.questionArea}>
        <div className={styles.topicBadge}>
          {currentQuestion.domain.name} → {currentQuestion.topic.name}
        </div>

        <PracticeQuestion
          question={currentQuestion}
          selectedAnswers={currentResponse?.selectedAnswers || []}
          onAnswerChange={handleAnswerChange}
          isRevealed={isRevealed}
        />

        {isRevealed && currentResponse && (
          <div className={`${styles.feedback} ${currentResponse.isCorrect ? styles.correct : styles.incorrect}`}>
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
          </div>
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
