import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { examApi, questionApi, studyApi } from '../../api/client';
import { useCertificationStore } from '../../stores/certificationStore';
import {
  EXAM_SIZE_OPTIONS as EXAM_SIZES,
  EXAM_SIZE_DEFAULT,
  type ExamSize,
} from '@ace-prep/shared';
import styles from './ExamSetup.module.css';

// UI-specific metadata for each exam size
const EXAM_SIZE_UI: Record<ExamSize, { label: string; description: string; duration: string }> = {
  10: { label: '10', description: 'Quick Practice', duration: '~12 min' },
  15: { label: '15', description: 'Short', duration: '~18 min' },
  25: { label: '25', description: 'Medium', duration: '~30 min' },
  50: { label: '50', description: 'Full Exam', duration: '2 hrs' },
};

// Fetches and displays domains for the selected certification
function DomainsList({ certificationId }: { certificationId: number | null }) {
  const { data: domains = [] } = useQuery({
    queryKey: ['studyDomains', certificationId],
    queryFn: () => studyApi.getDomains(certificationId ?? undefined),
    enabled: certificationId !== null,
  });

  if (domains.length === 0) {
    return null;
  }

  return (
    <div className={styles.domains}>
      <h3 className={styles.domainsTitle}>Exam Domains</h3>
      <ul className={styles.domainList}>
        {domains.map((domain: any) => (
          <li key={domain.id}>
            {domain.name} (~{(domain.weight * 100).toFixed(1)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExamSetup() {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<ExamSize>(EXAM_SIZE_DEFAULT);

  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );

  const { data: questionCount = 0 } = useQuery({
    queryKey: ['questions', 'count', selectedCertificationId],
    queryFn: () => questionApi.getCount({ certificationId: selectedCertificationId ?? undefined }),
    enabled: selectedCertificationId !== null,
  });

  const startExam = async () => {
    setIsStarting(true);
    setError(null);

    try {
      const result = await examApi.create({
        questionCount: selectedSize,
        certificationId: selectedCertificationId ?? undefined,
      });
      navigate(`/exam/${result.examId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to start exam');
      setIsStarting(false);
    }
  };

  const selectedOption = EXAM_SIZE_UI[selectedSize];
  const passingScore = selectedCert?.passingScorePercent ?? 70;
  const certName = selectedCert?.shortName || 'Certification';

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>◈</div>
        <h1 className={styles.title}>Practice Exam</h1>
        <p className={styles.description}>
          Test your knowledge with a {certName} certification practice exam.
        </p>

        <div className={styles.sizeSelector}>
          <label className={styles.sizeLabel}>Exam Size</label>
          <div className={styles.sizeOptions}>
            {EXAM_SIZES.map((size) => (
              <button
                key={size}
                className={`${styles.sizeOption} ${selectedSize === size ? styles.sizeOptionActive : ''}`}
                onClick={() => setSelectedSize(size)}
              >
                <span className={styles.sizeValue}>{EXAM_SIZE_UI[size].label}</span>
                <span className={styles.sizeDesc}>{EXAM_SIZE_UI[size].description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.info}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Questions</span>
            <span className={styles.infoValue}>{selectedSize}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Time Limit</span>
            <span className={styles.infoValue}>{selectedOption.duration}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Passing Score</span>
            <span className={styles.infoValue}>~{passingScore}%</span>
          </div>
        </div>

        {questionCount < 10 && (
          <div className={styles.warning}>
            <span className={styles.warningIcon}>⚠</span>
            <span>
              Only {questionCount} questions available. You need at least 10 questions to start an
              exam. Go to Settings to generate more questions.
            </span>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <span>{error}</span>
          </div>
        )}

        <DomainsList certificationId={selectedCertificationId} />

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
          The exam simulates the real {certName} certification experience. You can flag questions
          for review and navigate freely between questions.
        </p>
      </div>
    </div>
  );
}
