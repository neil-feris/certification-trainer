import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import styles from './ProtectedRoute.module.css';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading, accessToken, setLoading, login, logout } = useAuthStore();

  // Verify token with server on mount if we have a token but no user data
  useEffect(() => {
    const verifyAuth = async () => {
      if (!accessToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
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

    if (isLoading && accessToken) {
      verifyAuth();
    } else if (isLoading && !accessToken) {
      setLoading(false);
    }
  }, [accessToken, isLoading, setLoading, login, logout]);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <span className={styles.loadingText}>Verifying authentication...</span>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated - render children
  return <>{children}</>;
}
