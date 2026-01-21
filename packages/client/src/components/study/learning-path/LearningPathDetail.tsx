import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studyApi } from '../../../api/client';
import { useCertificationStore } from '../../../stores/certificationStore';
import { showStreakMilestoneToast } from '../../../utils/streakNotifications';
import styles from './LearningPathDetail.module.css';

export function LearningPathDetail() {
  const { order } = useParams<{ order: string }>();
  const orderNum = parseInt(order || '1', 10);
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const [expandedConcepts, setExpandedConcepts] = useState<Set<number>>(new Set());
  const [showSuccess, setShowSuccess] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isRegenerating, setIsRegenerating] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['learningPathItem', orderNum, selectedCertificationId],
    queryFn: () => studyApi.getLearningPathItem(orderNum, selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

  const handleRegenerateSummary = async () => {
    setIsRegenerating(true);
    try {
      await studyApi.getLearningPathItem(orderNum, selectedCertificationId ?? undefined, true);
      await refetch();
    } finally {
      setIsRegenerating(false);
    }
  };

  const markCompleteMutation = useMutation({
    mutationFn: () =>
      studyApi.markLearningPathComplete(orderNum, selectedCertificationId ?? undefined),
    onSuccess: (data) => {
      // Show milestone toast if applicable
      showStreakMilestoneToast(data.streakUpdate);

      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['learningPathItem', orderNum] });
      queryClient.invalidateQueries({ queryKey: ['learningPath'] });
      queryClient.invalidateQueries({ queryKey: ['learningPathStats'] });
      setTimeout(() => setShowSuccess(false), 3000);
    },
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
          <div className={styles.skeletonSection}>
            <div className={styles.skeletonSectionTitle} />
            <div className={styles.skeletonGrid}>
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
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
          <h2>Unable to load learning path item</h2>
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
          <Link to="/study" className={styles.backLinkError}>
            ← Back to Learning Path
          </Link>
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
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>~</span>
                Overview
              </h2>
              <button
                className={styles.regenerateBtn}
                onClick={handleRegenerateSummary}
                disabled={isRegenerating}
                title="Generate a fresh AI summary"
              >
                {isRegenerating ? (
                  <>
                    <span className={styles.spinner} />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M1.5 7C1.5 3.96243 3.96243 1.5 7 1.5C8.79396 1.5 10.3891 2.41207 11.3383 3.775"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M12.5 7C12.5 10.0376 10.0376 12.5 7 12.5C5.20604 12.5 3.6109 11.5879 2.66174 10.225"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M9 4H11.5V1.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5 10H2.5V12.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Regenerate
                  </>
                )}
              </button>
            </div>
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

      {/* No summary state - shows when summary is being generated */}
      {!summary && (
        <section className={styles.section}>
          <div className={styles.noSummary}>
            <div className={styles.generatingSpinner}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 48 48"
                fill="none"
                className={styles.spinnerIcon}
              >
                <circle cx="24" cy="24" r="20" stroke="var(--bg-tertiary)" strokeWidth="4" />
                <path
                  d="M24 4C35.0457 4 44 12.9543 44 24"
                  stroke="var(--accent-primary)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3>Generating AI Summary</h3>
            <p>
              The AI is analyzing this learning path item and creating a detailed summary with key
              takeaways, concepts, and exam tips.
            </p>
            <div className={styles.generatingProgress}>
              <span className={styles.progressDot} />
              <span className={styles.progressDot} />
              <span className={styles.progressDot} />
            </div>
          </div>
        </section>
      )}

      {/* Related Questions */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>?</span>
          Practice Questions
        </h2>
        {data.relatedQuestions.length > 0 ? (
          <div className={styles.questionsGrid}>
            {data.relatedQuestions.map((question) => (
              <div key={question.id} className={styles.questionCard}>
                <div className={styles.questionHeader}>
                  <span className={styles.difficultyBadge} data-difficulty={question.difficulty}>
                    {question.difficulty}
                  </span>
                  <span className={styles.questionTopic}>{question.topic.name}</span>
                </div>
                <p className={styles.questionText}>
                  {question.questionText.length > 180
                    ? question.questionText.slice(0, 180) + '...'
                    : question.questionText}
                </p>
                <div className={styles.questionMeta}>
                  <span className={styles.domainTag}>{question.domain.name}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyQuestions}>
            <span className={styles.emptyIcon}>∅</span>
            <h3>No Practice Questions Yet</h3>
            <p>
              Questions related to this topic will appear here once they are available in the
              question bank.
            </p>
          </div>
        )}
      </section>

      {/* Success Toast */}
      {showSuccess && (
        <div className={styles.successToast}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M4 10L8 14L16 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Item marked as complete!
        </div>
      )}

      {/* Navigation & Actions */}
      <div className={styles.footer}>
        <Link to="/study" className={styles.backLink}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 12L6 8L10 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Learning Path
        </Link>

        <div className={styles.actions}>
          {!item.isCompleted && (
            <button
              className={styles.completeBtn}
              onClick={() => markCompleteMutation.mutate()}
              disabled={markCompleteMutation.isPending}
            >
              {markCompleteMutation.isPending ? (
                <>
                  <span className={styles.spinner} />
                  Marking...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M4 9L7.5 12.5L14 5.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Mark as Complete
                </>
              )}
            </button>
          )}
          {item.isCompleted && (
            <span className={styles.alreadyCompleted}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8L6.5 11.5L13 4.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Completed
            </span>
          )}
          {orderNum < data.totalItems && (
            <button
              className={styles.nextBtn}
              onClick={() => navigate(`/study/learning-path/${orderNum + 1}`)}
            >
              Next Item
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 4L10 8L6 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
