import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';

/**
 * Hook to verify authentication state on mount.
 * Handles token validation and refresh flow.
 *
 * Used by both RootRedirect and ProtectedRoute to ensure
 * auth verification runs regardless of entry point.
 */
export function useAuthVerification() {
  const { isLoading, accessToken, setLoading, login, logout } = useAuthStore();
  const authCheckStarted = useRef(false);

  useEffect(() => {
    if (!isLoading || authCheckStarted.current) return;
    authCheckStarted.current = true;

    const controller = new AbortController();

    const verifyAuth = async () => {
      if (!accessToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
          signal: controller.signal,
        });

        if (response.ok) {
          const user = await response.json();
          login(user, accessToken);
        } else {
          // Token invalid, try refresh
          const refreshResponse = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            signal: controller.signal,
          });

          if (refreshResponse.ok) {
            const { accessToken: newToken, user } = await refreshResponse.json();
            login(user, newToken);
          } else {
            logout();
          }
        }
      } catch (error) {
        // Don't logout on abort - component just unmounted
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        logout();
      }
    };

    verifyAuth();

    return () => {
      controller.abort();
      authCheckStarted.current = false;
    };
  }, [isLoading, accessToken, setLoading, login, logout]);
}
