import { useState, useMemo } from 'react';
import styles from './AssessmentResults.module.css';

interface Props {
  score: number; // percentage 0-100
  correctCount: number;
  totalCount: number;
  timeSpentSeconds: number;
  results: Array<{
    questionId: number;
    isCorrect: boolean;
    correctAnswers: number[];
    explanation: string;
  }>;
  questions: Array<{
    id: number;
    questionText: string;
    options: string[];
    domain: { code: string; name: string };
  }>;
  assessmentType: 'quick' | 'full';
  onReviewAnswers: () => void;
  onTryAgain: () => void;
  onReturn: () => void;
}

export function AssessmentResults({
  score,
  correctCount,
  totalCount,
  timeSpentSeconds,
  results,
  questions,
  assessmentType,
  onReviewAnswers,
  onTryAgain,
  onReturn,
}: Props) {
  const [showAllIncorrect, setShowAllIncorrect] = useState(false);

  // Format time as MM:SS
  const formattedTime = useMemo(() => {
    const minutes = Math.floor(timeSpentSeconds / 60);
    const seconds = timeSpentSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [timeSpentSeconds]);

  // Determine score category for styling
  const scoreCategory = useMemo(() => {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    return 'needsWork';
  }, [score]);

  // Calculate domain breakdown
  const domainBreakdown = useMemo(() => {
    const domainMap = new Map<
      string,
      { code: string; name: string; correct: number; total: number }
    >();

    questions.forEach((question) => {
      const result = results.find((r) => r.questionId === question.id);
      if (!result) return;

      const key = question.domain.code;
      const existing = domainMap.get(key);

      if (existing) {
        existing.total += 1;
        if (result.isCorrect) existing.correct += 1;
      } else {
        domainMap.set(key, {
          code: question.domain.code,
          name: question.domain.name,
          correct: result.isCorrect ? 1 : 0,
          total: 1,
        });
      }
    });

    return Array.from(domainMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [questions, results]);

  // Get incorrect questions with their details
  const incorrectQuestions = useMemo(() => {
    return results
      .filter((r) => !r.isCorrect)
      .map((result) => {
        const question = questions.find((q) => q.id === result.questionId);
        return {
          ...result,
          question,
        };
      })
      .filter((item) => item.question);
  }, [results, questions]);

  const visibleIncorrect = showAllIncorrect ? incorrectQuestions : incorrectQuestions.slice(0, 3);

  return (
    <div className={styles.container}>
      {/* Celebration effect for high scores */}
      {score >= 80 && <div className={styles.celebration} aria-hidden="true" />}

      <div className={styles.card}>
        {/* Score Header */}
        <div className={styles.scoreSection}>
          <div className={`${styles.scoreCircle} ${styles[scoreCategory]}`}>
            <span className={styles.scoreValue}>{Math.round(score)}%</span>
            {score >= 80 && <span className={styles.checkmark}>&#10003;</span>}
          </div>

          <p className={styles.scoreSubtitle}>
            {correctCount} of {totalCount} correct
          </p>

          <p className={styles.timeDisplay}>Completed in {formattedTime}</p>

          <span className={styles.assessmentBadge}>
            {assessmentType === 'quick' ? 'Quick Assessment' : 'Full Practice Exam'}
          </span>
        </div>

        {/* Domain Breakdown */}
        <div className={styles.domainSection}>
          <h3 className={styles.sectionTitle}>Performance by Domain</h3>
          <div className={styles.domainTable}>
            <div className={styles.domainHeader}>
              <span>Domain</span>
              <span>Score</span>
            </div>
            {domainBreakdown.map((domain) => {
              const percentage = domain.total > 0 ? (domain.correct / domain.total) * 100 : 0;
              const domainCategory =
                percentage >= 80 ? 'excellent' : percentage >= 60 ? 'good' : 'needsWork';

              return (
                <div key={domain.code} className={styles.domainRow}>
                  <div className={styles.domainInfo}>
                    <span className={styles.domainCode}>{domain.code}</span>
                    <span className={styles.domainName}>{domain.name}</span>
                  </div>
                  <div className={styles.domainScore}>
                    <span className={styles.domainFraction}>
                      {domain.correct}/{domain.total}
                    </span>
                    <span className={`${styles.domainPercent} ${styles[domainCategory]}`}>
                      {Math.round(percentage)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Incorrect Questions */}
        {incorrectQuestions.length > 0 && (
          <div className={styles.incorrectSection}>
            <div className={styles.incorrectHeader}>
              <h3 className={styles.sectionTitle}>
                Review Incorrect Answers ({incorrectQuestions.length})
              </h3>
              {incorrectQuestions.length > 3 && (
                <button
                  className={styles.toggleButton}
                  onClick={() => setShowAllIncorrect(!showAllIncorrect)}
                >
                  {showAllIncorrect ? 'Show Less' : 'Show All'}
                </button>
              )}
            </div>

            <div className={styles.incorrectList}>
              {visibleIncorrect.map((item) => {
                const questionIndex = results.findIndex((r) => r.questionId === item.questionId);
                const correctAnswerTexts = item.correctAnswers
                  .map((idx) => item.question?.options[idx])
                  .filter(Boolean);

                return (
                  <div key={item.questionId} className={styles.incorrectItem}>
                    <div className={styles.incorrectItemHeader}>
                      <span className={styles.questionNumber}>Q{questionIndex + 1}</span>
                      <span className={styles.questionDomain}>{item.question?.domain.code}</span>
                    </div>

                    <p className={styles.questionText}>
                      {item.question && item.question.questionText.length > 150
                        ? `${item.question.questionText.slice(0, 150)}...`
                        : item.question?.questionText}
                    </p>

                    <div className={styles.answerComparison}>
                      <div className={styles.correctAnswer}>
                        <span className={styles.answerLabel}>Correct:</span>
                        <span className={styles.answerText}>{correctAnswerTexts.join('; ')}</span>
                      </div>
                    </div>

                    <div className={styles.explanationPreview}>
                      <span className={styles.explanationLabel}>Explanation:</span>
                      <span className={styles.explanationText}>
                        {item.explanation.length > 200
                          ? `${item.explanation.slice(0, 200)}...`
                          : item.explanation}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {!showAllIncorrect && incorrectQuestions.length > 3 && (
              <p className={styles.moreIndicator}>
                + {incorrectQuestions.length - 3} more incorrect answers
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className={styles.actions}>
          <button className={styles.primaryButton} onClick={onReviewAnswers}>
            Review All Answers
          </button>
          <button className={styles.secondaryButton} onClick={onTryAgain}>
            Try Again
          </button>
          <button className={styles.ghostButton} onClick={onReturn}>
            Return to Workbook
          </button>
        </div>
      </div>
    </div>
  );
}
