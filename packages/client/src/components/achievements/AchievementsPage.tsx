import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AchievementRarity } from '@ace-prep/shared';
import { achievementApi } from '../../api/client';
import type { AchievementBadge, AchievementProgressItem } from '../../api/client';
import { BadgeCard } from '../common';
import styles from './AchievementsPage.module.css';

type FilterTab = 'all' | 'earned' | 'locked';

const RARITY_ORDER: AchievementRarity[] = ['epic', 'rare', 'common'];

const RARITY_DOT_CLASS: Record<AchievementRarity, string> = {
  common: styles.rarityDotCommon,
  rare: styles.rarityDotRare,
  epic: styles.rarityDotEpic,
};

export function AchievementsPage() {
  const [filter, setFilter] = useState<FilterTab>('all');

  const {
    data: achievementsData,
    isLoading: loadingBadges,
    error: badgesError,
    refetch: refetchBadges,
  } = useQuery({
    queryKey: ['achievements'],
    queryFn: achievementApi.getAll,
  });

  const { data: progressData, isLoading: loadingProgress } = useQuery({
    queryKey: ['achievements', 'progress'],
    queryFn: achievementApi.getProgress,
  });

  const isLoading = loadingBadges || loadingProgress;

  // Build progress lookup
  const progressMap = useMemo(() => {
    const map = new Map<string, AchievementProgressItem>();
    if (progressData?.progress) {
      for (const p of progressData.progress) {
        map.set(p.code, p);
      }
    }
    return map;
  }, [progressData]);

  // Filter badges
  const filteredBadges = useMemo(() => {
    if (!achievementsData?.badges) return [];
    switch (filter) {
      case 'earned':
        return achievementsData.badges.filter((b) => b.earned);
      case 'locked':
        return achievementsData.badges.filter((b) => !b.earned);
      default:
        return achievementsData.badges;
    }
  }, [achievementsData, filter]);

  // Group by rarity
  const groupedByRarity = useMemo(() => {
    const groups: Record<AchievementRarity, AchievementBadge[]> = {
      epic: [],
      rare: [],
      common: [],
    };
    for (const badge of filteredBadges) {
      groups[badge.rarity].push(badge);
    }
    return groups;
  }, [filteredBadges]);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading achievements...</span>
        </div>
      </div>
    );
  }

  if (badgesError) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>
          <span>Failed to load achievements</span>
          <button className={styles.retryBtn} onClick={() => refetchBadges()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Achievements</h1>
          {achievementsData && (
            <span className={styles.summary}>
              <span className={styles.summaryCount}>{achievementsData.earned}</span> of{' '}
              {achievementsData.total} unlocked
            </span>
          )}
        </div>

        <div className={styles.filters}>
          {(['all', 'earned', 'locked'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              className={`${styles.filterTab} ${filter === tab ? styles.filterTabActive : ''}`}
              onClick={() => setFilter(tab)}
            >
              {tab === 'all' ? 'All' : tab === 'earned' ? 'Earned' : 'Locked'}
            </button>
          ))}
        </div>
      </div>

      {filteredBadges.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🏆</span>
          <span>
            {filter === 'earned'
              ? 'No badges earned yet. Keep studying!'
              : filter === 'locked'
                ? 'All badges unlocked!'
                : 'No achievements found'}
          </span>
        </div>
      ) : (
        RARITY_ORDER.map((rarity) => {
          const badges = groupedByRarity[rarity];
          if (badges.length === 0) return null;

          return (
            <div key={rarity} className={styles.rarityGroup}>
              <div className={styles.rarityHeader}>
                <span className={`${styles.rarityDot} ${RARITY_DOT_CLASS[rarity]}`} />
                <span className={styles.rarityTitle}>{rarity}</span>
                <span className={styles.rarityCount}>{badges.length}</span>
              </div>

              <div className={styles.grid}>
                {badges.map((badge) => (
                  <BadgeCard
                    key={badge.code}
                    badge={badge}
                    earned={badge.earned}
                    unlockedAt={badge.unlockedAt ?? undefined}
                    progress={progressMap.get(badge.code)}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
