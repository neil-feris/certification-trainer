import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { workbookApi } from '../../api/client';
import { useCertificationStore } from '../../stores/certificationStore';
import styles from './WorkbookWidget.module.css';

// Book icon SVG
const BookIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <path d="M12 6v7" />
    <path d="M8 9h8" />
  </svg>
);

export function WorkbookWidget() {
  const navigate = useNavigate();
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);

  const {
    data: progress,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workbookProgress', selectedCertificationId],
    queryFn: () => workbookApi.getProgress(selectedCertificationId ?? undefined),
    staleTime: 60000, // 1 min cache
    enabled: selectedCertificationId !== null,
  });

  if (isLoading) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.icon}>
            <BookIcon />
          </span>
          <span className={styles.title}>Official Workbook</span>
        </div>
        <div className={styles.loading}>
          <div className={styles.skeleton} />
          <span className="animate-pulse">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !progress) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.icon}>
            <BookIcon />
          </span>
          <span className={styles.title}>Official Workbook</span>
        </div>
        <div className={styles.empty}>
          <span>Unable to load workbook</span>
        </div>
      </div>
    );
  }

  const { summary } = progress;
  const { total, mastered, learned, needsWork, unattempted, percentComplete } = summary;

  // Calculate segment widths as percentages of total
  const masteredPct = (mastered / total) * 100;
  const learnedPct = (learned / total) * 100;
  const needsWorkPct = (needsWork / total) * 100;

  // Determine CTA text based on progress
  const ctaText =
    unattempted === total
      ? 'Start Workbook'
      : mastered === total
        ? 'Workbook Complete!'
        : 'Continue Workbook';

  const isComplete = mastered === total;

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.icon}>
          <BookIcon />
        </span>
        <span className={styles.title}>Official Workbook</span>
        {isComplete && <span className={styles.completeBadge}>Complete</span>}
      </div>

      <div className={styles.stats}>
        <div className={styles.statMain}>
          <span className={styles.statValue}>{mastered}</span>
          <span className={styles.statLabel}>mastered</span>
        </div>
        <span className={styles.statDivider}>/</span>
        <div className={styles.statTotal}>
          <span className={styles.statValue}>{total}</span>
          <span className={styles.statLabel}>questions</span>
        </div>
        <div className={styles.percentBadge}>{Math.round(percentComplete)}%</div>
      </div>

      <div className={styles.progressContainer}>
        <div className={styles.progressBar}>
          {masteredPct > 0 && (
            <div
              className={styles.segmentMastered}
              style={{ width: `${masteredPct}%` }}
              title={`${mastered} mastered`}
            />
          )}
          {learnedPct > 0 && (
            <div
              className={styles.segmentLearned}
              style={{ width: `${learnedPct}%` }}
              title={`${learned} learned`}
            />
          )}
          {needsWorkPct > 0 && (
            <div
              className={styles.segmentNeedsWork}
              style={{ width: `${needsWorkPct}%` }}
              title={`${needsWork} needs work`}
            />
          )}
        </div>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.legendDotMastered} />
            {mastered}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendDotLearned} />
            {learned}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendDotNeedsWork} />
            {needsWork}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendDotUnattempted} />
            {unattempted}
          </span>
        </div>
      </div>

      <button
        className={`${styles.ctaButton} ${isComplete ? styles.ctaComplete : ''}`}
        onClick={() => navigate('/study', { state: { tab: 'workbook' } })}
        disabled={isComplete}
      >
        {ctaText}
      </button>
    </div>
  );
}
