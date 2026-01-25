import { UserStreak, UserXP } from '@ace-prep/shared';
import { StreakDisplay } from '../common/StreakDisplay';
import { XPDisplay } from '../common/XPDisplay';
import { OfflineStatusIndicator } from '../common/OfflineStatusIndicator';
import styles from './MobileHeader.module.css';

interface MobileHeaderProps {
  streakData?: UserStreak;
  xpData?: UserXP;
}

export function MobileHeader({ streakData, xpData }: MobileHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>☁</span>
        <span className={styles.logoText}>Cert Trainer</span>
      </div>
      <div className={styles.stats}>
        <OfflineStatusIndicator variant="compact" />
        {streakData && <StreakDisplay streak={streakData} variant="compact" />}
        {xpData && <XPDisplay xp={xpData} variant="compact" />}
      </div>
    </div>
  );
}
