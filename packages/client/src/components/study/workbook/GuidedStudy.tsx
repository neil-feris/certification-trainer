import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workbookApi } from '../../../api/client';
import { WorkbookQuestion } from './WorkbookQuestion';
import { FeedbackPanel } from './FeedbackPanel';
import styles from './GuidedStudy.module.css';

interface Props {
  onExit: () => void;
}

export function GuidedStudy({ onExit }: Props) {
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [isRevealed, setIsRevealed] = useState(false);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    correctAnswers: number[];
    explanation: string;
    masteryLevel: string;
  } | null>(null);

  const { refetch } = useQuery({
    queryKey: ['workbookProgress'],
    queryFn: workbookApi.getProgress,
  });

  const { data: guidedData, refetch: refetchGuided } = useQuery({
    queryKey: ['workbookGuidedNext'],
    queryFn: workbookApi.getGuidedNext,
  });

  const question = guidedData?.question;
  const currentIndex = guidedData?.currentIndex ?? 0;
  const totalQuestions = guidedData?.totalQuestions ?? 41;

  const handleSelect = (answers: number[]) => {
    if (!isRevealed) {
      setSelectedAnswers(answers);
    }
  };

  const handleCheckAnswer = async () => {
    if (!question || selectedAnswers.length === 0) return;

    const result = await workbookApi.submitAnswer(question.id, selectedAnswers);
    setFeedback(result);
    setIsRevealed(true);
    refetch(); // Refresh progress
  };

  const handleNext = async () => {
    setSelectedAnswers([]);
    setIsRevealed(false);
    setFeedback(null);
    await refetchGuided();
  };

  const progressPercent = Math.round((currentIndex / totalQuestions) * 100);

  if (!question) {
    return (
      <div className={styles.complete}>
        <h2>All Questions Completed!</h2>
        <p>You&apos;ve worked through all 41 official questions.</p>
        <div className={styles.actions}>
          <button onClick={onExit} className={styles.primaryButton}>
            View Progress
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Progress Header */}
      <div className={styles.header}>
        <button onClick={onExit} className={styles.exitButton}>
          Exit
        </button>
        <div className={styles.progress}>
          <span>
            Question {currentIndex} of {totalQuestions}
          </span>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Domain Label */}
      <div className={styles.domainLabel}>
        {question.domain.code}: {question.domain.name}
      </div>

      {/* Question */}
      <WorkbookQuestion
        question={question}
        selectedAnswers={selectedAnswers}
        onSelect={handleSelect}
        disabled={isRevealed}
      />

      {/* Check Answer / Feedback */}
      {!isRevealed ? (
        <div className={styles.actions}>
          <button
            onClick={handleCheckAnswer}
            disabled={selectedAnswers.length === 0}
            className={styles.primaryButton}
          >
            Check Answer
          </button>
        </div>
      ) : (
        <>
          <FeedbackPanel
            isCorrect={feedback?.isCorrect ?? false}
            correctAnswers={feedback?.correctAnswers ?? []}
            explanation={feedback?.explanation ?? ''}
            selectedAnswers={selectedAnswers}
            options={question.options}
            masteryLevel={feedback?.masteryLevel ?? 'needs_work'}
            gcpServices={question.gcpServices}
          />
          <div className={styles.actions}>
            <button onClick={handleNext} className={styles.primaryButton}>
              Next Question
            </button>
          </div>
        </>
      )}
    </div>
  );
}
