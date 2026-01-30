import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useAuthVerification } from '../hooks/useAuthVerification';
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
  const { isAuthenticated, isLoading } = useAuthStore();

  // Verify auth on mount (handles direct navigation to protected routes)
  useAuthVerification();

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
