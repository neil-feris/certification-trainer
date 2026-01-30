import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { AuthLoader } from './common/AuthLoader';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * ProtectedRoute guards routes that require authentication.
 * It only checks the auth store state - auth verification is centralized
 * in RootRedirect (App.tsx) to avoid duplicate API calls.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuthStore();

  // Show full-screen loader while auth is being verified (by RootRedirect)
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
