import { UserXP } from '@ace-prep/shared';
import styles from './XPDisplay.module.css';

interface XPDisplayProps {
  xp: UserXP;
  variant?: 'compact' | 'full';
}

export function XPDisplay({ xp, variant = 'full' }: XPDisplayProps) {
  const isMaxLevel = xp.xpToNextLevel === 0;

  if (variant === 'compact') {
    return (
      <div className={styles.xpCompact}>
        <span className={styles.levelBadge}>Lv.{xp.currentLevel}</span>
        <span className={styles.levelTitle}>{xp.levelTitle}</span>
      </div>
    );
  }

  // Full variant
  return (
    <div className={styles.xpFull}>
      <div className={styles.levelHeader}>
        <div className={styles.levelBadgeLarge}>
          <span className={styles.levelNumber}>{xp.currentLevel}</span>
        </div>
        <div className={styles.levelInfo}>
          <span className={styles.levelTitleLarge}>{xp.levelTitle}</span>
          <span className={styles.totalXp}>{xp.totalXp.toLocaleString()} XP</span>
        </div>
      </div>
      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${xp.levelProgress}%` }} />
        </div>
        <div className={styles.progressText}>
          {isMaxLevel ? (
            <span className={styles.maxLevel}>Max Level Reached!</span>
          ) : (
            <>
              <span className={styles.xpCurrent}>{xp.xpInCurrentLevel} XP</span>
              <span className={styles.xpDivider}>/</span>
              <span className={styles.xpNeeded}>{xp.xpInCurrentLevel + xp.xpToNextLevel} XP</span>
              <span className={styles.xpRemaining}>({xp.xpToNextLevel} to next level)</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
