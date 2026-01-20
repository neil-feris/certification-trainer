import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { caseStudyApi } from '../../api/client';
import styles from './CaseStudyDetail.module.css';

export function CaseStudyDetail() {
  const { id } = useParams<{ id: string }>();
  const caseStudyId = parseInt(id || '0', 10);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['caseStudy', caseStudyId],
    queryFn: () => caseStudyApi.getById(caseStudyId),
    enabled: caseStudyId > 0,
  });

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.skeleton}>
          <div className={styles.skeletonHeader} />
          <div className={styles.skeletonSection}>
            <div className={styles.skeletonSectionTitle} />
            <div className={styles.skeletonContent} />
          </div>
          <div className={styles.skeletonSection}>
            <div className={styles.skeletonSectionTitle} />
            <div className={styles.skeletonContent} />
          </div>
          <div className={styles.skeletonSection}>
            <div className={styles.skeletonSectionTitle} />
            <div className={styles.skeletonList}>
              <div className={styles.skeletonListItem} />
              <div className={styles.skeletonListItem} />
              <div className={styles.skeletonListItem} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <span className={styles.errorIcon}>!</span>
          <h2>Unable to load case study</h2>
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
          <Link to="/case-studies" className={styles.backLinkError}>
            ← Back to Case Studies
          </Link>
        </div>
      </div>
    );
  }

  const { caseStudy } = data;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerBadges}>
          <span className={styles.codeBadge}>{caseStudy.code}</span>
          <span className={styles.certBadge}>{caseStudy.certification.code}</span>
        </div>
        <h1 className={styles.title}>{caseStudy.name}</h1>
      </div>

      {/* Company Overview */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 14V4L8 1L14 4V14H2Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5 14V9H11V14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M8 4V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          Company Overview
        </h2>
        <div className={styles.contentCard}>
          <p className={styles.contentText}>{caseStudy.companyOverview}</p>
        </div>
      </section>

      {/* Solution Concept */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M6 8V12L8 14L10 12V8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Solution Concept
        </h2>
        <div className={styles.contentCard}>
          <p className={styles.contentText}>{caseStudy.solutionConcept}</p>
        </div>
      </section>

      {/* Existing Technical Environment */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect
                x="1"
                y="4"
                width="14"
                height="8"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="4" cy="8" r="1" fill="currentColor" />
              <path d="M7 8H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          Existing Technical Environment
        </h2>
        <div className={styles.techCard}>
          <p className={styles.contentText}>{caseStudy.existingTechnicalEnvironment}</p>
        </div>
      </section>

      {/* Business Requirements */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 3H13V13H3V3Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M6 6L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M6 8L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M6 10L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          Business Requirements
        </h2>
        <ul className={styles.requirementsList}>
          {caseStudy.businessRequirements.map((req, idx) => (
            <li key={idx} className={styles.requirementItem}>
              <span className={styles.requirementBullet} />
              {req}
            </li>
          ))}
        </ul>
      </section>

      {/* Technical Requirements */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M5 3L1 8L5 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M11 3L15 8L11 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M9 2L7 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          Technical Requirements
        </h2>
        <ul className={styles.requirementsList}>
          {caseStudy.technicalRequirements.map((req, idx) => (
            <li key={idx} className={`${styles.requirementItem} ${styles.technical}`}>
              <span className={styles.requirementBullet} />
              {req}
            </li>
          ))}
        </ul>
      </section>

      {/* Executive Statement */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 4H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M3 8H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M3 12H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          Executive Statement
        </h2>
        <div className={styles.executiveCard}>
          <div className={styles.quoteIcon}>"</div>
          <p className={styles.executiveText}>{caseStudy.executiveStatement}</p>
        </div>
      </section>

      {/* Practice Questions Link */}
      <section className={styles.section}>
        <div className={styles.practiceCallout}>
          <div className={styles.practiceIcon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 11L12 14L22 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 12V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className={styles.practiceContent}>
            <h3>Practice Questions</h3>
            <p>
              Test your understanding of this case study with practice questions from the question
              bank.
            </p>
          </div>
          <Link to={`/questions?caseStudyId=${caseStudy.id}`} className={styles.practiceBtn}>
            View Questions
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 4L10 8L6 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer Navigation */}
      <div className={styles.footer}>
        <Link to="/case-studies" className={styles.backLink}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 12L6 8L10 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Case Studies
        </Link>
      </div>
    </div>
  );
}
