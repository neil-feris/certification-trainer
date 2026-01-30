/**
 * Push Notification Service
 *
 * Client-side service for managing Web Push subscriptions.
 */

const API_BASE = '/api/notifications';

/**
 * Check if the browser supports push notifications
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Get the VAPID public key from the server
 */
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/vapid-public-key`, {
      credentials: 'include',
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.publicKey;
  } catch {
    return null;
  }
}

/**
 * Convert a base64 string to Uint8Array for applicationServerKey
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return await Notification.requestPermission();
}

/**
 * Get the current push subscription
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn('[Push] Push notifications not supported');
    return false;
  }

  // Request permission
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    console.warn('[Push] Notification permission denied');
    return false;
  }

  // Get VAPID key
  const vapidPublicKey = await getVapidPublicKey();
  if (!vapidPublicKey) {
    console.error('[Push] Could not get VAPID public key');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // Send subscription to server
    const response = await fetch(`${API_BASE}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
        },
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('[Push] Failed to subscribe:', error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const subscription = await getCurrentSubscription();
    if (!subscription) return true;

    // Unsubscribe locally
    await subscription.unsubscribe();

    // Remove from server
    await fetch(`${API_BASE}/subscribe`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    return true;
  } catch (error) {
    console.error('[Push] Failed to unsubscribe:', error);
    return false;
  }
}

/**
 * Check subscription status from server
 */
export async function getSubscriptionStatus(): Promise<{
  isConfigured: boolean;
  isSubscribed: boolean;
}> {
  try {
    const response = await fetch(`${API_BASE}/status`, {
      credentials: 'include',
    });
    if (!response.ok) {
      return { isConfigured: false, isSubscribed: false };
    }
    return await response.json();
  } catch {
    return { isConfigured: false, isSubscribed: false };
  }
}
