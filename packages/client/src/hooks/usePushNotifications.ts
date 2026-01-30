/**
 * usePushNotifications Hook
 *
 * React hook for managing push notification subscriptions.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentSubscription,
  getSubscriptionStatus,
} from '../services/pushService';

interface UsePushNotificationsResult {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const [isSupported] = useState(() => isPushSupported());
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  const refresh = useCallback(async () => {
    if (!isSupported) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Check local subscription
      const subscription = await getCurrentSubscription();

      // Also check server status
      const status = await getSubscriptionStatus();

      setIsSubscribed(Boolean(subscription) && status.isSubscribed);
      setPermission(Notification.permission);
    } catch (error) {
      console.error('[usePushNotifications] Error checking status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const success = await subscribeToPush();
      if (success) {
        setIsSubscribed(true);
        setPermission('granted');
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const success = await unsubscribeFromPush();
      if (success) {
        setIsSubscribed(false);
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    refresh,
  };
}
