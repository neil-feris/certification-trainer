import { UserStreak } from '@ace-prep/shared';
import { StreakDisplay } from '../common/StreakDisplay';
import styles from './MobileHeader.module.css';

interface MobileHeaderProps {
  streakData?: UserStreak;
}

export function MobileHeader({ streakData }: MobileHeaderProps) {
  if (!streakData) return null;

  return (
    <div className={styles.header}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>☁</span>
        <span className={styles.logoText}>Cert Trainer</span>
      </div>
      <StreakDisplay streak={streakData} variant="compact" />
    </div>
  );
}
