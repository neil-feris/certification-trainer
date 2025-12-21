import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { examApi, questionApi } from '../../api/client';
import styles from './ExamSetup.module.css';

export function ExamSetup() {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: questions } = useQuery({
    queryKey: ['questions'],
    queryFn: () => questionApi.list(),
  });

  const questionCount = questions?.length || 0;

  const startExam = async () => {
    setIsStarting(true);
    setError(null);

    try {
      const result = await examApi.create();
      navigate(`/exam/${result.examId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to start exam');
      setIsStarting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>◈</div>
        <h1 className={styles.title}>Practice Exam</h1>
        <p className={styles.description}>
          Test your knowledge with a full-length ACE certification practice exam.
        </p>

        <div className={styles.info}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Questions</span>
            <span className={styles.infoValue}>50</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Time Limit</span>
            <span className={styles.infoValue}>2 hours</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Passing Score</span>
            <span className={styles.infoValue}>~70%</span>
          </div>
        </div>

        {questionCount < 10 && (
          <div className={styles.warning}>
            <span className={styles.warningIcon}>⚠</span>
            <span>
              Only {questionCount} questions available. You need at least 10 questions to start an exam.
              Go to Settings to generate more questions.
            </span>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <span>{error}</span>
          </div>
        )}

        <div className={styles.domains}>
          <h3 className={styles.domainsTitle}>Exam Domains</h3>
          <ul className={styles.domainList}>
            <li>Setting Up a Cloud Solution Environment (~17.5%)</li>
            <li>Planning and Configuring a Cloud Solution (~17.5%)</li>
            <li>Deploying and Implementing a Cloud Solution (~25%)</li>
            <li>Ensuring Successful Operation (~20%)</li>
            <li>Configuring Access and Security (~20%)</li>
          </ul>
        </div>

        <div className={styles.actions}>
          <button
            className="btn btn-primary"
            onClick={startExam}
            disabled={isStarting || questionCount < 10}
          >
            {isStarting ? 'Starting...' : 'Start Exam'}
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>

        <p className={styles.note}>
          The exam simulates the real ACE certification experience. You can flag questions
          for review and navigate freely between questions.
        </p>
      </div>
    </div>
  );
}
