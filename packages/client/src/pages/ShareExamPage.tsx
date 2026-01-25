import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { ShareableResult } from '@ace-prep/shared';
import styles from './ShareExamPage.module.css';

const API_BASE = '/api';

/**
 * Public page for viewing shared exam results.
 * No authentication required - accessible via share link.
 */
export function ShareExamPage() {
  const { hash } = useParams<{ hash: string }>();
  const [result, setResult] = useState<ShareableResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      if (!hash) {
        setError('Invalid share link');
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/share/exam/${hash}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('This share link is no longer available or never existed.');
          } else {
            setError('Failed to load exam results. Please try again later.');
          }
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        setResult(data.result);
      } catch {
        setError('Unable to load results. Please check your connection.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchResult();
  }, [hash]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.backgroundPattern} />
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading exam results...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !result) {
    return (
      <div className={styles.container}>
        <div className={styles.backgroundPattern} />
        <div className={styles.errorState}>
          <div className={styles.errorIcon}>🔗</div>
          <div>
            <h2 className={styles.errorTitle}>Share Not Found</h2>
            <p className={styles.errorMessage}>{error || 'This share link is not valid.'}</p>
          </div>
          <Link to="/" className={styles.ctaButton}>
            Go to ACE Prep
            <span className={styles.ctaArrow}>→</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.backgroundPattern} />

      <div className={styles.content}>
        {/* Header with branding */}
        <div className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>◆</span>
            <span className={styles.brandText}>ACE Prep</span>
          </div>
          <div className={styles.certName}>{result.certificationName}</div>
        </div>

        {/* Result card */}
        <div className={styles.resultCard}>
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
              <div
                className={`${styles.passBadge} ${result.passed ? styles.passed : styles.failed}`}
              >
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

        {/* CTA section */}
        <div className={styles.ctaSection}>
          <p className={styles.ctaText}>Ready to ace your certification exam?</p>
          <Link to="/" className={styles.ctaButton}>
            Try ACE Prep
            <span className={styles.ctaArrow}>→</span>
          </Link>
        </div>
      </div>

      {/* Footer with view count */}
      <div className={styles.footer}>
        <span className={styles.viewCount}>
          👁 {result.viewCount} {result.viewCount === 1 ? 'view' : 'views'}
        </span>
      </div>
    </div>
  );
}
