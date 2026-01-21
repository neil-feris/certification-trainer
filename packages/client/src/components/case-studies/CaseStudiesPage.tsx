import { useQuery } from '@tanstack/react-query';
import { caseStudyApi } from '../../api/client';
import { useCertificationStore } from '../../stores/certificationStore';
import { CaseStudyCard } from './CaseStudyCard';
import styles from './CaseStudiesPage.module.css';

export function CaseStudiesPage() {
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['caseStudies', selectedCertificationId],
    queryFn: () => caseStudyApi.getAll(selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

  // Loading state with skeleton cards
  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonSubtitle} />
          </div>
        </header>

        <div className={styles.grid}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonCardHeader}>
                <div className={styles.skeletonBadge} />
                <div className={styles.skeletonBadgeSmall} />
              </div>
              <div className={styles.skeletonCardTitle} />
              <div className={styles.skeletonCardText} />
              <div className={styles.skeletonCardTags}>
                <div className={styles.skeletonTag} />
                <div className={styles.skeletonTag} />
                <div className={styles.skeletonTag} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <span className={styles.errorIcon}>!</span>
          <h2>Unable to load case studies</h2>
          <p>{error instanceof Error ? error.message : 'An error occurred'}</p>
          <button className={styles.retryBtn} onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <>
                <span className={styles.spinner} />
                Retrying...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2 8C2 4.68629 4.68629 2 8 2C10.0503 2 11.8733 3.04237 12.9581 4.6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M14 8C14 11.3137 11.3137 14 8 14C5.94965 14 4.12672 12.9576 3.04185 11.4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M10 5H13V2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M6 11H3V14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Try Again
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const caseStudies = data?.caseStudies ?? [];
  const hasCaseStudies = caseStudies.length > 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Case Studies</h1>
          {selectedCert && (
            <p className={styles.subtitle}>
              Study real-world scenarios for{' '}
              <span className={styles.certName}>{selectedCert.shortName}</span> certification
            </p>
          )}
        </div>
        {hasCaseStudies && (
          <div className={styles.headerMeta}>
            <span className={styles.count}>
              {caseStudies.length} case {caseStudies.length === 1 ? 'study' : 'studies'}
            </span>
          </div>
        )}
      </header>

      {hasCaseStudies ? (
        <div className={styles.grid}>
          {caseStudies.map((caseStudy) => (
            <CaseStudyCard key={caseStudy.id} caseStudy={caseStudy} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect
                x="6"
                y="8"
                width="36"
                height="32"
                rx="3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path d="M6 16H42" stroke="currentColor" strokeWidth="2" />
              <path d="M14 24H34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M14 30H28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2>No case studies available</h2>
          <p>
            {selectedCert
              ? `The ${selectedCert.shortName} certification doesn't have case studies yet.`
              : 'Select a certification to view case studies.'}
          </p>
        </div>
      )}
    </div>
  );
}
