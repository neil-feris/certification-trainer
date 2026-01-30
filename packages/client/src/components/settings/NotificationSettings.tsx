/**
 * NotificationSettings Component
 *
 * UI for managing push notification preferences.
 * Uses custom toggle styling consistent with other Settings sections.
 */

import { useState, useEffect, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import styles from './NotificationSettings.module.css';

interface NotificationPreferences {
  enabled: boolean;
  streakReminders: boolean;
  reviewReminders: boolean;
  qotdReminders: boolean;
  preferredTime: string;
  timezone: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  streakReminders: true,
  reviewReminders: true,
  qotdReminders: true,
  preferredTime: '09:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

/**
 * Round time to nearest 15-minute slot to match scheduler intervals
 * e.g., "09:07" → "09:00", "09:08" → "09:15"
 */
function roundToQuarterHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const roundedM = Math.round(m / 15) * 15;
  const adjustedH = roundedM === 60 ? (h + 1) % 24 : h;
  const adjustedM = roundedM === 60 ? 0 : roundedM;
  return `${String(adjustedH).padStart(2, '0')}:${String(adjustedM).padStart(2, '0')}`;
}

export function NotificationSettings() {
  const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(false);

  // Load preferences from server when subscribed
  useEffect(() => {
    if (!isSubscribed) return;

    let cancelled = false;
    setIsLoadingPrefs(true);

    fetch('/api/notifications/preferences', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setPreferences((prev) => ({ ...prev, ...data }));
        }
      })
      .catch((error) => {
        Sentry.captureException(error);
        console.error('[NotificationSettings] Failed to load preferences:', error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPrefs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isSubscribed]);

  // Save preferences with optimistic update and rollback
  const savePreferences = useCallback(
    async (updates: Partial<NotificationPreferences>) => {
      const previousPrefs = preferences;
      const newPrefs = { ...preferences, ...updates };

      // Optimistic update
      setPreferences(newPrefs);
      setIsSaving(true);

      try {
        const response = await fetch('/api/notifications/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        // Rollback on failure
        setPreferences(previousPrefs);
        Sentry.captureException(error);
        console.error('[NotificationSettings] Failed to save preferences:', error);
      } finally {
        setIsSaving(false);
      }
    },
    [preferences]
  );

  const handleSubscribe = async () => {
    const success = await subscribe();
    if (success) {
      // Save initial preferences with detected timezone
      await savePreferences({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }
  };

  if (!isSupported) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Push Notifications</h3>
        </div>
        <p className={styles.unsupported}>
          Push notifications are not supported in your browser. Try using Chrome, Firefox, or Edge.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Push Notifications</h3>
        {isSubscribed && (
          <span className={styles.statusBadge}>
            <span className={styles.statusDot} />
            Enabled
          </span>
        )}
      </div>

      <p className={styles.description}>
        Get reminders about your streak, cards due for review, and the daily question.
      </p>

      {!isSubscribed ? (
        <button
          className={styles.enableBtn}
          onClick={handleSubscribe}
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? 'Enabling...' : 'Enable Notifications'}
        </button>
      ) : (
        <>
          {isLoadingPrefs ? (
            <div className={styles.loading}>Loading preferences...</div>
          ) : (
            <div
              className={styles.preferencesForm}
              role="form"
              aria-label="Notification preferences"
            >
              {/* Master toggle */}
              <div className={styles.toggleGroup}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    className={styles.toggleInput}
                    checked={preferences.enabled}
                    onChange={(e) => savePreferences({ enabled: e.target.checked })}
                    disabled={isSaving}
                    aria-describedby="all-notifications-hint"
                  />
                  <span className={styles.toggleText}>All notifications</span>
                </label>
              </div>

              {preferences.enabled && (
                <>
                  <div className={styles.toggleGroup}>
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        className={styles.toggleInput}
                        checked={preferences.streakReminders}
                        onChange={(e) => savePreferences({ streakReminders: e.target.checked })}
                        disabled={isSaving}
                        aria-describedby="streak-hint"
                      />
                      <span className={styles.toggleText}>Streak reminders</span>
                    </label>
                    <span className={styles.hint} id="streak-hint">
                      Get warned before your streak resets
                    </span>
                  </div>

                  <div className={styles.toggleGroup}>
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        className={styles.toggleInput}
                        checked={preferences.reviewReminders}
                        onChange={(e) => savePreferences({ reviewReminders: e.target.checked })}
                        disabled={isSaving}
                        aria-describedby="review-hint"
                      />
                      <span className={styles.toggleText}>Review reminders</span>
                    </label>
                    <span className={styles.hint} id="review-hint">
                      Get notified when cards are due
                    </span>
                  </div>

                  <div className={styles.toggleGroup}>
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        className={styles.toggleInput}
                        checked={preferences.qotdReminders}
                        onChange={(e) => savePreferences({ qotdReminders: e.target.checked })}
                        disabled={isSaving}
                        aria-describedby="qotd-hint"
                      />
                      <span className={styles.toggleText}>Question of the Day</span>
                    </label>
                    <span className={styles.hint} id="qotd-hint">
                      Daily question notification
                    </span>
                  </div>

                  <div className={styles.timeGroup}>
                    <label className={styles.timeLabel} htmlFor="notification-time">
                      Preferred time
                    </label>
                    <input
                      id="notification-time"
                      type="time"
                      value={preferences.preferredTime}
                      onChange={(e) =>
                        savePreferences({ preferredTime: roundToQuarterHour(e.target.value) })
                      }
                      className={styles.timeInput}
                      disabled={isSaving}
                      step="900"
                      aria-describedby="timezone-hint"
                    />
                    <span className={styles.hint} id="timezone-hint">
                      Timezone: {preferences.timezone}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          <button
            className={styles.disableBtn}
            onClick={unsubscribe}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            Disable Notifications
          </button>
        </>
      )}
    </div>
  );
}
