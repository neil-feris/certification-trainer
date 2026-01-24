import type { AchievementUnlockResponse } from '@ace-prep/shared';
import { showToast } from '../components/common/Toast';
import { queryClient } from '../lib/queryClient';

export function showAchievementUnlockToasts(
  achievementsUnlocked?: AchievementUnlockResponse[]
): void {
  if (!achievementsUnlocked?.length) return;

  for (const achievement of achievementsUnlocked) {
    showToast({
      message: `${achievement.icon} Badge Unlocked: ${achievement.name} (+${achievement.xpAwarded} XP)`,
      type: 'success',
      duration: 5000,
    });
  }

  queryClient.invalidateQueries({ queryKey: ['achievements'] });
}
