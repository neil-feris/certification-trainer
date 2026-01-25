import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AuthLoader, ErrorBoundary, RouteErrorBoundary, Toast } from './components/common';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './components/dashboard/Dashboard';
import { ExamSetup } from './components/exam/ExamSetup';
import { ExamContainer } from './components/exam/ExamContainer';
import { ExamReview } from './components/exam/ExamReview';
import { StudyHub } from './components/study/StudyHub';
import { FlashcardSetup, FlashcardStudy, FlashcardSummary } from './components/study/flashcards';
import { LearningPathDetail } from './components/study/learning-path/LearningPathDetail';
import { Review } from './components/review/Review';
import { Settings } from './components/settings/Settings';
import { QuestionBrowser } from './components/questions';
import { ProgressPage } from './components/progress/ProgressPage';
import { ReadinessPage } from './components/progress/ReadinessPage';
import { CaseStudiesPage, CaseStudyDetail } from './components/case-studies';
import { AchievementsPage } from './components/achievements/AchievementsPage';
import { BookmarksPage } from './components/bookmarks/BookmarksPage';
import { NotesPage } from './components/notes/NotesPage';
import { LoginPage, AuthCallbackPage, ShareExamPage } from './pages';
import { useAuthStore } from './stores/authStore';

// Root redirect component - handles auth-aware redirects
function RootRedirect() {
  const { isAuthenticated, isLoading, accessToken, setLoading, login, logout } = useAuthStore();

  // Handle auth initialization on mount
  useEffect(() => {
    const initAuth = async () => {
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

    if (isLoading) {
      initAuth();
    }
  }, [accessToken, isLoading, setLoading, login, logout]);

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
      <Toast />
      <Routes>
        {/* Root redirect based on auth state */}
        <Route path="/" element={<RootRedirect />} />

        {/* Public auth routes - no AppShell, no ProtectedRoute */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Public share route - accessible without auth */}
        <Route path="/share/exam/:hash" element={<ShareExamPage />} />

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
          path="/study/flashcards"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <FlashcardSetup />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/study/flashcards/:sessionId"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <FlashcardStudy />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/study/flashcards/:sessionId/summary"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <FlashcardSummary />
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
          path="/bookmarks"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <BookmarksPage />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notes"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <NotesPage />
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
        <Route
          path="/readiness"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <ReadinessPage />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/achievements"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <AchievementsPage />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/case-studies"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <CaseStudiesPage />
                </RouteErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/case-studies/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <RouteErrorBoundary>
                  <CaseStudyDetail />
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
