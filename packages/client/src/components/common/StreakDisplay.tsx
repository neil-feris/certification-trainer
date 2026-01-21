import { UserStreak } from '@ace-prep/shared';
import styles from './StreakDisplay.module.css';

interface StreakDisplayProps {
  streak: UserStreak;
  variant?: 'compact' | 'full';
}

export function StreakDisplay({ streak, variant = 'full' }: StreakDisplayProps) {
  const isActive = streak.currentStreak > 0;

  if (variant === 'compact') {
    return (
      <div className={`${styles.streakCompact} ${!isActive ? styles.inactive : ''}`}>
        <span className={styles.flameIcon}>🔥</span>
        <span className={styles.streakNumber}>{streak.currentStreak}</span>
      </div>
    );
  }

  // Full variant
  return (
    <div className={`${styles.streakFull} ${!isActive ? styles.inactive : ''}`}>
      <div className={styles.currentStreak}>
        <span className={styles.flameIcon}>🔥</span>
        <span className={styles.streakNumber}>{streak.currentStreak}</span>
        <span className={styles.streakLabel}>day{streak.currentStreak !== 1 ? 's' : ''}</span>
      </div>
      {streak.longestStreak > 0 && (
        <div className={styles.longestStreak}>
          Longest: {streak.longestStreak} day{streak.longestStreak !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
