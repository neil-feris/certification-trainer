import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { progressApi } from '../../api/client';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const navigate = useNavigate();

  const {
    data: dashboard,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn: progressApi.getDashboard,
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

  const passingScore = 70;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <button className="btn btn-primary" onClick={() => navigate('/exam')}>
          Start Practice Exam
        </button>
      </header>

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
      </div>

      <div className={styles.mainGrid}>
        {/* Domain Performance */}
        <div className={`card ${styles.domainCard}`}>
          <h2 className={styles.sectionTitle}>Domain Performance</h2>
          <div className={styles.domainList}>
            {dashboard?.domainStats?.map((stat: any) => (
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
          {dashboard?.weakAreas?.length > 0 ? (
            <div className={styles.weakAreasList}>
              {dashboard.weakAreas.map((area: any, i: number) => (
                <div key={i} className={styles.weakAreaItem}>
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
          {dashboard?.recentExams?.length > 0 ? (
            <div className={styles.recentList}>
              {dashboard.recentExams.map((exam: any) => (
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
