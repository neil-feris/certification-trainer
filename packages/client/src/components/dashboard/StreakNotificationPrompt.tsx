/**
 * StreakNotificationPrompt Component
 *
 * Contextual prompt shown on dashboard to encourage enabling notifications.
 * Only shows when:
 * - Push is supported
 * - User is not subscribed
 * - User has 3+ day streak
 * - User hasn't dismissed the prompt
 */

import { useState } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import styles from './StreakNotificationPrompt.module.css';

const DISMISS_KEY = 'ace-notification-prompt-dismissed';

/** Safe localStorage getter for private browsing mode */
function getStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Safe localStorage setter for private browsing mode */
function setStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore - private browsing or quota exceeded
  }
}

interface StreakNotificationPromptProps {
  currentStreak: number;
}

export function StreakNotificationPrompt({ currentStreak }: StreakNotificationPromptProps) {
  const { isSupported, isSubscribed, isLoading, subscribe } = usePushNotifications();
  const [isDismissed, setIsDismissed] = useState(() => {
    return getStorageItem(DISMISS_KEY) === 'true';
  });
  const [isEnabling, setIsEnabling] = useState(false);

  // Don't show if:
  // - Push not supported
  // - Already subscribed
  // - Streak less than 3
  // - Dismissed
  // - Loading
  if (!isSupported || isSubscribed || currentStreak < 3 || isDismissed || isLoading) {
    return null;
  }

  const handleEnable = async () => {
    setIsEnabling(true);
    const success = await subscribe();
    if (!success) {
      // Permission denied or error - dismiss to avoid nagging
      setStorageItem(DISMISS_KEY, 'true');
      setIsDismissed(true);
    }
    setIsEnabling(false);
  };

  const handleDismiss = () => {
    setStorageItem(DISMISS_KEY, 'true');
    setIsDismissed(true);
  };

  return (
    <div className={styles.prompt}>
      <div className={styles.content}>
        <div className={styles.icon}>🔔</div>
        <div className={styles.text}>
          <strong>Protect your {currentStreak}-day streak</strong>
          <span>Get reminded before your streak resets</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.enableBtn} onClick={handleEnable} disabled={isEnabling}>
          {isEnabling ? 'Enabling...' : 'Enable'}
        </button>
        <button className={styles.dismissBtn} onClick={handleDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
