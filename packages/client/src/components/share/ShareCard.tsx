import { forwardRef } from 'react';
import type { ShareableResult } from '@ace-prep/shared';
import styles from './ShareCard.module.css';

interface ShareCardProps {
  result: ShareableResult;
  visible?: boolean;
}

/**
 * ShareCard component renders a fixed-size card (1200x630) suitable for social media sharing.
 * Uses forwardRef so parent components can capture it with html2canvas.
 * By default renders off-screen (visible=false) to avoid layout impact.
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { result, visible = false },
  ref
) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div ref={ref} className={`${styles.card} ${visible ? '' : styles.hidden}`}>
      {/* Background pattern overlay */}
      <div className={styles.bgPattern} />
      <div className={styles.bgGradient} />

      {/* Main content */}
      <div className={styles.content}>
        {/* Header with branding */}
        <div className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>◆</span>
            <span className={styles.brandText}>ACE Prep</span>
          </div>
          <div className={styles.certName}>{result.certificationName}</div>
        </div>

        {/* Score section */}
        <div className={styles.scoreSection}>
          <div className={styles.scoreCircle}>
            <svg viewBox="0 0 200 200" className={styles.scoreSvg}>
              {/* Background circle */}
              <circle
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="12"
              />
              {/* Progress arc */}
              <circle
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke={result.passed ? '#00d4aa' : '#ff5252'}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${(result.score / 100) * 534} 534`}
                transform="rotate(-90 100 100)"
              />
            </svg>
            <div className={styles.scoreValue}>
              <span className={styles.scoreNumber}>{Math.round(result.score)}</span>
              <span className={styles.scorePercent}>%</span>
            </div>
          </div>

          <div className={styles.scoreInfo}>
            <div className={`${styles.passBadge} ${result.passed ? styles.passed : styles.failed}`}>
              {result.passed ? '✓ PASSED' : '✗ NOT PASSED'}
            </div>
            <div className={styles.scoreMeta}>
              <span>
                {result.correctAnswers}/{result.totalQuestions} correct
              </span>
              <span className={styles.dateDivider}>•</span>
              <span>{formatDate(result.completedAt)}</span>
            </div>
          </div>
        </div>

        {/* Domain breakdown */}
        <div className={styles.domains}>
          <div className={styles.domainsTitle}>Performance by Domain</div>
          <div className={styles.domainList}>
            {result.domainBreakdown.map((domain) => (
              <div key={domain.domainId} className={styles.domainItem}>
                <div className={styles.domainHeader}>
                  <span className={styles.domainName}>{domain.domainName}</span>
                  <span className={styles.domainScore}>
                    {domain.correctCount}/{domain.totalCount} ({Math.round(domain.percentage)}%)
                  </span>
                </div>
                <div className={styles.domainBar}>
                  <div
                    className={styles.domainFill}
                    style={{
                      width: `${domain.percentage}%`,
                      background: domain.percentage >= 70 ? '#00d4aa' : '#ff5252',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.footerText}>Prepare for Google Cloud certifications</span>
        <span className={styles.footerUrl}>aceprep.io</span>
      </div>
    </div>
  );
});
