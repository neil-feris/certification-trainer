import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { progressApi, questionApi } from '../../api/client';
import { useCertificationStore } from '../../stores/certificationStore';
import { ReadinessWidget } from '../common/ReadinessWidget';
import { StreakDisplay } from '../common/StreakDisplay';
import { XPDisplay } from '../common/XPDisplay';
import { XPHistoryPanel } from '../common/XPHistoryPanel';
import { StudyPlanWidget } from './StudyPlanWidget';
import styles from './Dashboard.module.css';

// Dashboard data types
interface DomainStat {
  domain: { id: number; name: string };
  accuracy: number;
  totalAttempts: number;
  correctAttempts: number;
}

interface WeakArea {
  accuracy: number;
  topic: { id: number; name: string };
  domain: { id: number; name: string };
}

interface RecentExam {
  id: number;
  completedAt: string;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
}

// SVG icons for quick actions
const ReviewIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12,6 12,12 16,14" />
  </svg>
);

const StudyIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

export function Dashboard() {
  const navigate = useNavigate();
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );

  const {
    data: dashboard,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['dashboard', selectedCertificationId],
    queryFn: () => progressApi.getDashboard(selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

  // Fetch review queue for quick action badge
  const { data: reviewQueue } = useQuery({
    queryKey: ['reviewQueue'],
    queryFn: () => questionApi.getReviewQueue(),
    staleTime: 60000,
  });

  // Fetch streak data
  const { data: streak, isLoading: streakLoading } = useQuery({
    queryKey: ['streak'],
    queryFn: () => progressApi.getStreak(),
  });

  // Fetch XP data
  const {
    data: xp,
    isLoading: xpLoading,
    error: xpError,
  } = useQuery({
    queryKey: ['xp'],
    queryFn: () => progressApi.getXp(),
  });

  // Fetch XP history data
  const {
    data: xpHistory,
    isLoading: xpHistoryLoading,
    error: xpHistoryError,
  } = useQuery({
    queryKey: ['xpHistory'],
    queryFn: () => progressApi.getXpHistory(20),
  });

  // Fetch readiness score (with snapshot save for history tracking)
  const { data: readiness, isLoading: readinessLoading } = useQuery({
    queryKey: ['readiness', selectedCertificationId],
    queryFn: () => progressApi.getReadiness(selectedCertificationId!, { saveSnapshot: true }),
    enabled: selectedCertificationId !== null,
    staleTime: 300000, // 5 min cache
  });

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className="animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>Failed to load dashboard</p>
        <button className="btn btn-secondary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  const passingScore = selectedCert?.passingScorePercent ?? 70;
  const reviewDueCount = reviewQueue?.length ?? 0;

  // Type assertions for dashboard data
  const domainStats = dashboard?.domainStats as DomainStat[] | undefined;
  const weakAreas = dashboard?.weakAreas as WeakArea[] | undefined;
  const recentExams = dashboard?.recentExams as RecentExam[] | undefined;

  // Find weakest domain for "Continue" button
  const weakestDomain = domainStats?.reduce(
    (weakest: DomainStat | null, stat: DomainStat) => {
      if (!weakest || stat.accuracy < weakest.accuracy) {
        return stat;
      }
      return weakest;
    },
    null as DomainStat | null
  );

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Dashboard</h1>
          {selectedCert && (
            <span className={styles.certBadge}>
              {selectedCert.shortName} · {selectedCert.name}
            </span>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/exam')}>
          Start Practice Exam
        </button>
      </header>

      {/* Quick Actions - mobile only */}
      <div className={styles.quickActions}>
        {reviewDueCount > 0 && (
          <button
            className={`${styles.quickActionBtn} ${styles.primary}`}
            onClick={() => navigate('/review')}
          >
            <span className={styles.quickActionIcon}>
              <ReviewIcon />
            </span>
            <span className={styles.quickActionText}>
              <span className={styles.quickActionLabel}>Start Review</span>
              <span className={styles.quickActionMeta}>{reviewDueCount} due</span>
            </span>
          </button>
        )}
        {weakestDomain && (
          <button className={styles.quickActionBtn} onClick={() => navigate('/study')}>
            <span className={styles.quickActionIcon}>
              <StudyIcon />
            </span>
            <span className={styles.quickActionText}>
              <span className={styles.quickActionLabel}>Continue: {weakestDomain.domain.name}</span>
              <span className={styles.quickActionMeta}>
                {weakestDomain.accuracy.toFixed(0)}% accuracy
              </span>
            </span>
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{dashboard?.totalExams || 0}</div>
          <div className={styles.statLabel}>Exams Taken</div>
        </div>
        <div className={styles.statCard}>
          <div
            className={`${styles.statValue} ${(dashboard?.averageScore || 0) >= passingScore ? styles.passing : styles.failing}`}
          >
            {dashboard?.averageScore?.toFixed(1) || 0}%
          </div>
          <div className={styles.statLabel}>Average Score</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{dashboard?.bestScore?.toFixed(1) || 0}%</div>
          <div className={styles.statLabel}>Best Score</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{dashboard?.overallAccuracy?.toFixed(1) || 0}%</div>
          <div className={styles.statLabel}>Overall Accuracy</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Exam Readiness</div>
          <ReadinessWidget readiness={readiness ?? null} isLoading={readinessLoading} />
        </div>
        <div className={styles.statCard}>
          {streakLoading ? (
            <div className={styles.statValue}>
              <span className="animate-pulse">...</span>
            </div>
          ) : (
            <StreakDisplay
              variant="full"
              streak={streak || { currentStreak: 0, longestStreak: 0, lastActivityDate: null }}
            />
          )}
        </div>
        <div className={styles.statCard}>
          {xpLoading ? (
            <div className={styles.statValue}>
              <span className="animate-pulse">...</span>
            </div>
          ) : xpError ? (
            <div className={styles.statValue}>
              <span className={styles.failing}>XP unavailable</span>
            </div>
          ) : xp ? (
            <XPDisplay variant="full" xp={xp} />
          ) : null}
        </div>
      </div>

      {/* XP History Panel */}
      <XPHistoryPanel
        history={xpHistory || []}
        isLoading={xpHistoryLoading}
        error={!!xpHistoryError}
      />

      <div className={styles.mainGrid}>
        {/* Study Plan Widget */}
        <div className={styles.studyPlanCard}>
          <StudyPlanWidget />
        </div>

        {/* Domain Performance */}
        <div className={`card ${styles.domainCard}`}>
          <h2 className={styles.sectionTitle}>Domain Performance</h2>
          <div className={styles.domainList}>
            {domainStats?.map((stat) => (
              <div key={stat.domain.id} className={styles.domainItem}>
                <div className={styles.domainHeader}>
                  <span className={styles.domainName}>{stat.domain.name}</span>
                  <span
                    className={`${styles.domainScore} ${stat.accuracy >= passingScore ? styles.passing : stat.accuracy < 50 ? styles.failing : ''}`}
                  >
                    {stat.accuracy.toFixed(0)}%
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${stat.accuracy}%`,
                      background:
                        stat.accuracy >= passingScore
                          ? 'var(--success)'
                          : stat.accuracy < 50
                            ? 'var(--error)'
                            : 'var(--warning)',
                    }}
                  />
                </div>
                <div className={styles.domainMeta}>
                  {stat.totalAttempts} questions · {stat.correctAttempts} correct
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weak Areas */}
        <div className={`card ${styles.weakAreasCard}`}>
          <h2 className={styles.sectionTitle}>Areas to Improve</h2>
          {weakAreas && weakAreas.length > 0 ? (
            <div className={styles.weakAreasList}>
              {weakAreas.map((area) => (
                <div key={`${area.domain.id}-${area.topic.id}`} className={styles.weakAreaItem}>
                  <div className={styles.weakAreaBadge}>
                    <span
                      className={`badge ${area.accuracy < 50 ? 'badge-error' : 'badge-warning'}`}
                    >
                      {area.accuracy.toFixed(0)}%
                    </span>
                  </div>
                  <div className={styles.weakAreaInfo}>
                    <div className={styles.weakAreaTopic}>{area.topic.name}</div>
                    <div className={styles.weakAreaDomain}>{area.domain.name}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>Complete more practice exams to identify weak areas</p>
            </div>
          )}
        </div>

        {/* Recent Exams */}
        <div className={`card ${styles.recentCard}`}>
          <h2 className={styles.sectionTitle}>Recent Exams</h2>
          {recentExams && recentExams.length > 0 ? (
            <div className={styles.recentList}>
              {recentExams.map((exam) => (
                <div
                  key={exam.id}
                  className={styles.recentItem}
                  onClick={() => navigate(`/exam/${exam.id}/review`)}
                >
                  <div className={styles.recentDate}>
                    {new Date(exam.completedAt).toLocaleDateString()}
                  </div>
                  <div className={styles.recentScore}>
                    <span
                      className={`badge ${exam.score >= passingScore ? 'badge-success' : 'badge-error'}`}
                    >
                      {exam.score?.toFixed(0)}%
                    </span>
                  </div>
                  <div className={styles.recentQuestions}>
                    {exam.correctAnswers}/{exam.totalQuestions}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>No exams completed yet</p>
              <button className="btn btn-primary" onClick={() => navigate('/exam')}>
                Take Your First Exam
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
