import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AuthLoader, ErrorBoundary, RouteErrorBoundary } from './components/common';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './components/dashboard/Dashboard';
import { ExamSetup } from './components/exam/ExamSetup';
import { ExamContainer } from './components/exam/ExamContainer';
import { ExamReview } from './components/exam/ExamReview';
import { StudyHub } from './components/study/StudyHub';
import { LearningPathDetail } from './components/study/learning-path/LearningPathDetail';
import { Review } from './components/review/Review';
import { Settings } from './components/settings/Settings';
import { QuestionBrowser } from './components/questions';
import { ProgressPage } from './components/progress/ProgressPage';
import { LoginPage, AuthCallbackPage } from './pages';
import { useAuthStore } from './stores/authStore';

// Root redirect component - handles auth-aware redirects
function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuthStore();

  // While loading auth state, show full-screen loader
  if (isLoading) {
    return <AuthLoader message="Loading..." />;
  }

  // Redirect based on authentication status
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Root redirect based on auth state */}
        <Route path="/" element={<RootRedirect />} />

        {/* Public auth routes - no AppShell, no ProtectedRoute */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Protected routes - wrapped in AppShell and ProtectedRoute */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <Dashboard />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/exam"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <ExamSetup />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/exam/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <ExamContainer />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/exam/:id/review"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <ExamReview />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/study"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <StudyHub />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/study/learning-path/:order"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <LearningPathDetail />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/review"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <Review />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <Settings />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/questions"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <QuestionBrowser />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/progress"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <ProgressPage />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
