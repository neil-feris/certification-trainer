import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { examApi } from '../../api/client';
import { useExamStore } from '../../stores/examStore';
import { useEffect } from 'react';
import styles from './ExamReview.module.css';

export function ExamReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { resetExam } = useExamStore();

  useEffect(() => {
    resetExam();
  }, []);

  const {
    data: review,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['examReview', id],
    queryFn: () => examApi.getReview(parseInt(id!)),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className="animate-pulse">Loading review...</div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className={styles.error}>
        <p>Failed to load exam review</p>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const { exam, responses, domainPerformance } = review;
  const passingScore = 70;
  const passed = exam.score >= passingScore;

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
          ← Dashboard
        </button>
        <h1>Exam Review</h1>
        <button className="btn btn-primary" onClick={() => navigate('/exam')}>
          Take New Exam
        </button>
      </header>

      {/* Score Summary */}
      <div className={`${styles.scoreCard} ${passed ? styles.passed : styles.failed}`}>
        <div className={styles.scoreMain}>
          <div className={styles.scoreValue}>{exam.score?.toFixed(1)}%</div>
          <div className={styles.scoreLabel}>{passed ? 'PASSED' : 'NOT PASSED'}</div>
        </div>
        <div className={styles.scoreDetails}>
          <div className={styles.scoreDetail}>
            <span className={styles.detailValue}>{exam.correctAnswers}</span>
            <span className={styles.detailLabel}>Correct</span>
          </div>
          <div className={styles.scoreDetail}>
            <span className={styles.detailValue}>{exam.totalQuestions - exam.correctAnswers}</span>
            <span className={styles.detailLabel}>Incorrect</span>
          </div>
          <div className={styles.scoreDetail}>
            <span className={styles.detailValue}>{exam.totalQuestions}</span>
            <span className={styles.detailLabel}>Total</span>
          </div>
          <div className={styles.scoreDetail}>
            <span className={styles.detailValue}>{Math.floor(exam.timeSpentSeconds / 60)}m</span>
            <span className={styles.detailLabel}>Time Used</span>
          </div>
        </div>
      </div>

      {/* Domain Performance */}
      <div className={`card ${styles.domainCard}`}>
        <h2 className={styles.sectionTitle}>Performance by Domain</h2>
        <div className={styles.domainList}>
          {domainPerformance.map((perf: any) => (
            <div key={perf.domain.id} className={styles.domainItem}>
              <div className={styles.domainHeader}>
                <span>{perf.domain.name}</span>
                <span
                  className={`${styles.domainScore} ${perf.percentage >= passingScore ? styles.passing : ''}`}
                >
                  {perf.correct}/{perf.total} ({perf.percentage.toFixed(0)}%)
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${perf.percentage}%`,
                    background: perf.percentage >= passingScore ? 'var(--success)' : 'var(--error)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Question Review */}
      <div className={styles.questionList}>
        <h2 className={styles.sectionTitle}>Question Review</h2>
        {responses.map((response: any, index: number) => {
          const { question, selectedAnswers, isCorrect } = response;
          return (
            <div
              key={response.id}
              className={`${styles.questionItem} ${isCorrect ? styles.correct : styles.incorrect}`}
            >
              <div className={styles.questionHeader}>
                <span className={styles.questionNumber}>Q{index + 1}</span>
                <span className={`badge ${isCorrect ? 'badge-success' : 'badge-error'}`}>
                  {isCorrect ? 'Correct' : 'Incorrect'}
                </span>
                <span className="badge">{question.domain.name}</span>
              </div>

              <div className={styles.questionText}>{question.questionText}</div>

              <div className={styles.options}>
                {question.options.map((option: string, optIndex: number) => {
                  const wasSelected = selectedAnswers.includes(optIndex);
                  const isCorrectAnswer = question.correctAnswers.includes(optIndex);

                  return (
                    <div
                      key={optIndex}
                      className={`${styles.option} ${isCorrectAnswer ? styles.optionCorrect : ''} ${wasSelected && !isCorrectAnswer ? styles.optionWrong : ''}`}
                    >
                      <span className={styles.optionIndicator}>
                        {isCorrectAnswer ? '✓' : wasSelected ? '✗' : '○'}
                      </span>
                      <span>{option}</span>
                    </div>
                  );
                })}
              </div>

              <div className={styles.explanation}>
                <strong>Explanation:</strong> {question.explanation}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
