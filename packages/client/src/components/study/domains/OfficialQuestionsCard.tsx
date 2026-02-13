import type { WorkbookProgressSummary } from '@ace-prep/shared';
import { useCertificationStore } from '../../../stores/certificationStore';
import styles from './OfficialQuestionsCard.module.css';

interface Props {
  summary?: WorkbookProgressSummary;
  onGoToWorkbook: () => void;
}

// Google-style badge icon
const OfficialBadgeIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2L15 8.5L22 9.5L17 14.5L18 21.5L12 18.5L6 21.5L7 14.5L2 9.5L9 8.5L12 2Z" />
  </svg>
);

export function OfficialQuestionsCard({ summary, onGoToWorkbook }: Props) {
  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );
  const certShortName = selectedCert?.shortName ?? 'Exam';

  const mastered = summary?.mastered ?? 0;
  const total = summary?.total ?? 0;
  const percentComplete = summary?.percentComplete ?? 0;
  const isComplete = total > 0 && mastered === total;

  const getStatusText = () => {
    if (!summary) return 'Start studying official questions';
    if (isComplete) return 'All questions mastered!';
    if (percentComplete === 0) return 'Get started with official questions';
    return `${percentComplete}% complete`;
  };

  return (
    <div className={styles.card} onClick={onGoToWorkbook}>
      <div className={styles.iconWrapper}>
        <OfficialBadgeIcon />
      </div>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>Official Practice Questions</h3>
          {isComplete && <span className={styles.completeBadge}>Complete</span>}
        </div>
        <p className={styles.description}>
          {total > 0 ? `${total} diagnostic` : 'Diagnostic'} questions from the {certShortName} Exam
          Prep Workbook
        </p>
        <div className={styles.stats}>
          <span className={styles.progress}>
            {mastered}/{total} mastered
          </span>
          <span className={styles.status}>{getStatusText()}</span>
        </div>
        {percentComplete > 0 && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${percentComplete}%` }} />
          </div>
        )}
      </div>
      <div className={styles.arrow}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  );
}
