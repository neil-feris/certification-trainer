import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { studyApi } from '../../../api/client';
import { useCertificationStore } from '../../../stores/certificationStore';
import styles from './LearningPathDetail.module.css';

export function LearningPathDetail() {
  const { order } = useParams<{ order: string }>();
  const orderNum = parseInt(order || '1', 10);
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const [expandedConcepts, setExpandedConcepts] = useState<Set<number>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['learningPathItem', orderNum, selectedCertificationId],
    queryFn: () => studyApi.getLearningPathItem(orderNum, selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

  const toggleConcept = (index: number) => {
    setExpandedConcepts((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const typeColors: Record<string, string> = {
    course: 'var(--accent-secondary)',
    skill_badge: 'var(--accent-primary)',
    exam: 'var(--success)',
  };

  const typeLabels: Record<string, string> = {
    course: 'Course',
    skill_badge: 'Skill Badge',
    exam: 'Certification',
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.skeleton}>
          <div className={styles.skeletonHeader} />
          <div className={styles.skeletonContent} />
          <div className={styles.skeletonContent} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <span className={styles.errorIcon}>!</span>
          <h2>Unable to load learning path item</h2>
          <p>{error instanceof Error ? error.message : 'An error occurred'}</p>
        </div>
      </div>
    );
  }

  const { item, summary } = data;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.orderBadge}>{item.order}</div>
        <div className={styles.headerContent}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{item.title}</h1>
            <span
              className={styles.typeBadge}
              style={{ background: typeColors[item.type] || 'var(--bg-tertiary)' }}
            >
              {typeLabels[item.type] || item.type}
            </span>
            {item.isCompleted && (
              <span className={styles.completedBadge}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M3 7L6 10L11 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Completed
              </span>
            )}
          </div>
          <p className={styles.description}>{item.description}</p>
          <div className={styles.topicsList}>
            {item.topics.map((topic, i) => (
              <span key={i} className={styles.topicTag}>
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Why It Matters */}
      <section className={styles.section}>
        <div className={styles.whyItMatters}>
          <span className={styles.whyIcon}>?</span>
          <div>
            <span className={styles.whyLabel}>Why This Matters</span>
            <p className={styles.whyText}>{item.whyItMatters}</p>
          </div>
        </div>
      </section>

      {/* AI Summary - only show if we have one */}
      {summary && (
        <>
          {/* Overview */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>~</span>
              Overview
            </h2>
            <div className={styles.overviewCard}>
              <p className={styles.overviewText}>{summary.overview}</p>
            </div>
          </section>

          {/* Key Takeaways */}
          {summary.keyTakeaways.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>*</span>
                Key Takeaways
              </h2>
              <ul className={styles.takeawaysList}>
                {summary.keyTakeaways.map((takeaway, i) => (
                  <li key={i} className={styles.takeawayItem}>
                    <span className={styles.takeawayBullet} />
                    {takeaway}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Important Concepts */}
          {summary.importantConcepts.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>#</span>
                Important Concepts
              </h2>
              <div className={styles.conceptsGrid}>
                {summary.importantConcepts.map((concept, i) => {
                  const isExpanded = expandedConcepts.has(i);
                  const isLong = concept.length > 150;
                  const displayText =
                    isExpanded || !isLong ? concept : concept.slice(0, 150) + '...';

                  return (
                    <div key={i} className={styles.conceptCard}>
                      <p className={styles.conceptText}>{displayText}</p>
                      {isLong && (
                        <button className={styles.expandBtn} onClick={() => toggleConcept(i)}>
                          {isExpanded ? 'Show less' : 'Read more'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Exam Tips */}
          {summary.examTips.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>!</span>
                Exam Tips
              </h2>
              <div className={styles.tipsCallout}>
                <div className={styles.tipsIcon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2L2 7L12 12L22 7L12 2Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 17L12 22L22 17"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 12L12 17L22 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <ul className={styles.tipsList}>
                  {summary.examTips.map((tip, i) => (
                    <li key={i} className={styles.tipItem}>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}

      {/* No summary state */}
      {!summary && (
        <section className={styles.section}>
          <div className={styles.noSummary}>
            <span className={styles.noSummaryIcon}>~</span>
            <h3>Generating Summary...</h3>
            <p>
              The AI is generating a detailed summary for this learning path item. This may take a
              moment.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
