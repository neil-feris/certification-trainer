import type { AchievementDefinition, AchievementProgress } from '@ace-prep/shared';
import styles from './BadgeCard.module.css';

interface BadgeCardProps {
  badge: AchievementDefinition;
  earned: boolean;
  unlockedAt?: string | Date;
  progress?: AchievementProgress;
}

export function BadgeCard({ badge, earned, unlockedAt, progress }: BadgeCardProps) {
  const rarityClass = styles[badge.rarity] || '';
  const stateClass = earned ? styles.earned : styles.locked;

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={`${styles.card} ${rarityClass} ${stateClass}`} title={badge.description}>
      <div className={styles.iconWrap}>
        <span className={styles.icon}>{badge.icon}</span>
        {earned && <span className={styles.unlockGlow} />}
      </div>

      <div className={styles.info}>
        <span className={styles.name}>{badge.name}</span>
        <span className={styles.rarityLabel}>{badge.rarity}</span>
      </div>

      {earned && unlockedAt && <span className={styles.date}>{formatDate(unlockedAt)}</span>}

      {!earned && progress && progress.targetValue > 1 && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.min(progress.percentComplete, 100)}%` }}
            />
          </div>
          <span className={styles.progressText}>
            {progress.currentValue}/{progress.targetValue}
          </span>
        </div>
      )}

      <div className={styles.descTooltip}>{badge.description}</div>
    </div>
  );
}
