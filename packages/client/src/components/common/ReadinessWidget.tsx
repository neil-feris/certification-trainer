import { useNavigate } from 'react-router-dom';
import type { ReadinessResponse } from '@ace-prep/shared';
import styles from './ReadinessWidget.module.css';

interface ReadinessWidgetProps {
  readiness: ReadinessResponse | null;
  isLoading?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'var(--success)';
  if (score >= 50) return 'var(--warning)';
  return 'var(--error)';
}

function getConfidenceLabel(confidence: 'low' | 'medium' | 'high'): string {
  switch (confidence) {
    case 'high': return 'High Confidence';
    case 'medium': return 'Medium Confidence';
    case 'low': return 'Low Confidence';
  }
}

export function ReadinessWidget({ readiness, isLoading }: ReadinessWidgetProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className={styles.widget}>
        <div className={styles.loading}>
          <div className={styles.gaugePlaceholder} />
          <span className="animate-pulse">Loading...</span>
        </div>
      </div>
    );
  }

  if (!readiness) {
    return (
      <div className={styles.widget}>
        <div className={styles.empty}>
          <div className={styles.gaugePlaceholder} />
          <span className={styles.emptyText}>No data yet</span>
          <span className={styles.emptyHint}>Complete exams to see readiness</span>
        </div>
      </div>
    );
  }

  const { score } = readiness;
  const overall = Math.round(score.overall * 100);
  const color = getScoreColor(overall);
  const circumference = 2 * Math.PI * 42;
  const strokeDashoffset = circumference - (overall / 100) * circumference;

  // Top 3 domains by weight
  const topDomains = [...score.domains]
    .sort((a, b) => b.domainWeight - a.domainWeight)
    .slice(0, 3);

  return (
    <div className={styles.widget}>
      <div className={styles.gaugeSection}>
        <svg className={styles.gauge} viewBox="0 0 100 100">
          <circle
            className={styles.gaugeBg}
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="8"
          />
          <circle
            className={styles.gaugeFill}
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ stroke: color }}
          />
        </svg>
        <div className={styles.gaugeValue}>
          <span className={styles.scoreNumber} style={{ color }}>{overall}</span>
          <span className={styles.scorePercent}>%</span>
        </div>
      </div>

      <div className={styles.confidence} data-level={score.confidence}>
        {getConfidenceLabel(score.confidence)}
      </div>

      <div className={styles.domainBars}>
        {topDomains.map((domain) => {
          const domainScore = Math.round(domain.score * 100);
          return (
            <div key={domain.domainId} className={styles.domainBar}>
              <div className={styles.domainLabel}>
                <span className={styles.domainName}>{domain.domainName}</span>
                <span className={styles.domainScore} style={{ color: getScoreColor(domainScore) }}>
                  {domainScore}%
                </span>
              </div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{
                    width: `${domainScore}%`,
                    background: getScoreColor(domainScore),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <button
        className={styles.detailsLink}
        onClick={() => navigate('/readiness')}
      >
        View Details
      </button>
    </div>
  );
}
