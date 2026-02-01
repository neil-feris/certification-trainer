import type { WorkbookProgressSummary, WorkbookBenchmark } from '@ace-prep/shared';
import styles from './WorkbookHub.module.css';

interface Props {
  summary: WorkbookProgressSummary;
  benchmark?: WorkbookBenchmark;
}

function getTierLabel(tier: WorkbookBenchmark['tier']): string {
  switch (tier) {
    case 'top_10':
      return 'Top 10%';
    case 'top_25':
      return 'Top 25%';
    case 'above_average':
      return 'Above Average';
    case 'average':
      return 'Average';
    case 'below_average':
      return 'Below Average';
    default:
      return '';
  }
}

function getTierClass(tier: WorkbookBenchmark['tier']): string {
  switch (tier) {
    case 'top_10':
    case 'top_25':
      return styles.tierExcellent;
    case 'above_average':
      return styles.tierGood;
    case 'average':
      return styles.tierAverage;
    case 'below_average':
      return styles.tierBelowAverage;
    default:
      return '';
  }
}

export function WorkbookProgress({ summary, benchmark }: Props) {
  const { total, mastered, learned, needsWork, unattempted, percentComplete } = summary;

  return (
    <div className={styles.progressCard}>
      <div className={styles.progressHeader}>
        <span className={styles.progressTitle}>Your Progress</span>
        <span className={styles.progressPercent}>{percentComplete}% Complete</span>
      </div>

      <div className={styles.progressBar}>
        <div
          className={styles.progressMastered}
          style={{ width: `${(mastered / total) * 100}%` }}
          title={`${mastered} Mastered`}
        />
        <div
          className={styles.progressLearned}
          style={{ width: `${(learned / total) * 100}%` }}
          title={`${learned} Learned`}
        />
        <div
          className={styles.progressNeedsWork}
          style={{ width: `${(needsWork / total) * 100}%` }}
          title={`${needsWork} Needs Work`}
        />
      </div>

      <div className={styles.progressLegend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.dotMastered}`} />
          <span>{mastered} Mastered</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.dotLearned}`} />
          <span>{learned} Learned</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.dotNeedsWork}`} />
          <span>{needsWork} Needs Work</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.dotUnattempted}`} />
          <span>{unattempted} Remaining</span>
        </div>
      </div>

      {/* Benchmark Comparison */}
      {benchmark && benchmark.userStats.total > 0 && (
        <div className={styles.benchmarkSection}>
          <div className={styles.benchmarkHeader}>
            <span className={styles.benchmarkTitle}>How You Compare</span>
            <span className={`${styles.tierBadge} ${getTierClass(benchmark.tier)}`}>
              {getTierLabel(benchmark.tier)}
            </span>
          </div>
          <div className={styles.benchmarkStats}>
            <div className={styles.benchmarkStat}>
              <span className={styles.benchmarkValue}>
                {Math.round(benchmark.userStats.firstAttemptAccuracy)}%
              </span>
              <span className={styles.benchmarkLabel}>Your 1st Attempt</span>
            </div>
            <div className={styles.benchmarkDivider} />
            <div className={styles.benchmarkStat}>
              <span className={styles.benchmarkValue}>
                {Math.round(benchmark.benchmarks.averageFirstAttemptAccuracy)}%
              </span>
              <span className={styles.benchmarkLabel}>Community Avg</span>
            </div>
            <div className={styles.benchmarkDivider} />
            <div className={styles.benchmarkStat}>
              <span className={styles.benchmarkValue}>{Math.round(benchmark.percentile)}th</span>
              <span className={styles.benchmarkLabel}>Percentile</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
