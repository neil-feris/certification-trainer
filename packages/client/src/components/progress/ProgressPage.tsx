import { PerformanceTrendsChart } from './PerformanceTrendsChart';
import styles from './ProgressPage.module.css';

export function ProgressPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Progress</h1>
        <p className={styles.subtitle}>Track your exam performance over time</p>
      </header>

      <div className={`card ${styles.chartCard}`}>
        <h2 className={styles.sectionTitle}>Performance Trends</h2>
        <PerformanceTrendsChart />
      </div>
    </div>
  );
}
