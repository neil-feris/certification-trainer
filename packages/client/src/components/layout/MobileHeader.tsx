import { UserStreak, UserXP } from '@ace-prep/shared';
import { StreakDisplay } from '../common/StreakDisplay';
import { XPDisplay } from '../common/XPDisplay';
import styles from './MobileHeader.module.css';

interface MobileHeaderProps {
  streakData?: UserStreak;
  xpData?: UserXP;
}

export function MobileHeader({ streakData, xpData }: MobileHeaderProps) {
  const hasData = streakData || xpData;
  if (!hasData) return null;

  return (
    <div className={styles.header}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>☁</span>
        <span className={styles.logoText}>Cert Trainer</span>
      </div>
      <div className={styles.stats}>
        {streakData && <StreakDisplay streak={streakData} variant="compact" />}
        {xpData && <XPDisplay xp={xpData} variant="compact" />}
      </div>
    </div>
  );
}
