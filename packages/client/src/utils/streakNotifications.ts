import { StreakUpdateResponse } from '@ace-prep/shared';
import { showToast } from '../components/common/Toast';

const MILESTONE_MESSAGES: Record<number, string> = {
  7: 'One week strong! Keep it up!',
  30: "One month milestone! You're on fire!",
  100: '100 days! Incredible dedication!',
  365: "One full year! You're unstoppable!",
};

export function showStreakMilestoneToast(streakUpdate?: StreakUpdateResponse): void {
  if (!streakUpdate?.milestone) return;

  const message = MILESTONE_MESSAGES[streakUpdate.milestone];
  if (!message) return;

  showToast({
    message: `🔥 ${streakUpdate.milestone}-Day Streak! ${message}`,
    type: 'success',
    duration: 5000,
  });
}
