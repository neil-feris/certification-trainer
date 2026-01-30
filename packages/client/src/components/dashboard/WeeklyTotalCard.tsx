/**
 * WeeklyTotalCard - Displays weekly study time with comparison to previous week
 */

import styles from './StudyActivitySection.module.css';

interface WeeklyTotalCardProps {
  weeklyTotalSeconds: number;
  previousWeekTotalSeconds: number;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 0.1) {
    return '0';
  }
  return hours.toFixed(1);
}

export function WeeklyTotalCard({
  weeklyTotalSeconds,
  previousWeekTotalSeconds,
}: WeeklyTotalCardProps) {
  const diff = weeklyTotalSeconds - previousWeekTotalSeconds;
  const isIncrease = diff > 0;
  const isDecrease = diff < 0;

  return (
    <div className={styles.weeklyCard}>
      <div className={styles.weeklyValue}>
        <span className={styles.weeklyNumber}>{formatHours(weeklyTotalSeconds)}</span>
        <span className={styles.weeklyUnit}>hrs</span>
      </div>
      <div className={styles.weeklyLabel}>this week</div>
      {diff !== 0 && (
        <div
          className={`${styles.weeklyDelta} ${isIncrease ? styles.increase : ''} ${isDecrease ? styles.decrease : ''}`}
        >
          <span className={styles.deltaArrow}>{isIncrease ? '↑' : '↓'}</span>
          <span>{formatDuration(Math.abs(diff))}</span>
          <span className={styles.deltaLabel}>vs last week</span>
        </div>
      )}
      {diff === 0 && previousWeekTotalSeconds > 0 && (
        <div className={styles.weeklyDelta}>
          <span className={styles.deltaLabel}>same as last week</span>
        </div>
      )}
    </div>
  );
}
