import { ReactNode, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { AuthLoader } from './common/AuthLoader';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * ProtectedRoute guards routes that require authentication.
 * Handles auth verification if user navigates directly to a protected route.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading, accessToken, setLoading, login, logout } = useAuthStore();
  const authCheckStarted = useRef(false);

  // Verify auth if loading and haven't started check yet
  useEffect(() => {
    if (!isLoading || authCheckStarted.current) return;
    authCheckStarted.current = true;

    const verifyAuth = async () => {
      if (!accessToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
        });

        if (response.ok) {
          const user = await response.json();
          login(user, accessToken);
        } else {
          // Token invalid, try refresh
          const refreshResponse = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
          });

          if (refreshResponse.ok) {
            const { accessToken: newToken, user } = await refreshResponse.json();
            login(user, newToken);
          } else {
            logout();
          }
        }
      } catch {
        logout();
      }
    };

    verifyAuth();
  }, [isLoading, accessToken, setLoading, login, logout]);

  // Show loader while auth is being verified
  if (isLoading) {
    return <AuthLoader message="Verifying authentication..." />;
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated - render children
  return <>{children}</>;
}
