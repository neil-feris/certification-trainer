import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AuthLoader, ErrorBoundary, RouteErrorBoundary, Toast } from './components/common';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuthStore } from './stores/authStore';
import { useOfflineSyncNotifications } from './hooks/useOfflineSyncNotifications';
import { useAuthVerification } from './hooks/useAuthVerification';

// Lazy-loaded route components
const Dashboard = lazy(() =>
  import('./components/dashboard/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const ExamSetup = lazy(() =>
  import('./components/exam/ExamSetup').then((m) => ({ default: m.ExamSetup }))
);
const ExamContainer = lazy(() =>
  import('./components/exam/ExamContainer').then((m) => ({ default: m.ExamContainer }))
);
const ExamReview = lazy(() =>
  import('./components/exam/ExamReview').then((m) => ({ default: m.ExamReview }))
);
const StudyHub = lazy(() =>
  import('./components/study/StudyHub').then((m) => ({ default: m.StudyHub }))
);
const FlashcardSetup = lazy(() =>
  import('./components/study/flashcards/FlashcardSetup').then((m) => ({
    default: m.FlashcardSetup,
  }))
);
const FlashcardStudy = lazy(() =>
  import('./components/study/flashcards/FlashcardStudy').then((m) => ({
    default: m.FlashcardStudy,
  }))
);
const FlashcardSummary = lazy(() =>
  import('./components/study/flashcards/FlashcardSummary').then((m) => ({
    default: m.FlashcardSummary,
  }))
);
const LearningPathDetail = lazy(() =>
  import('./components/study/learning-path/LearningPathDetail').then((m) => ({
    default: m.LearningPathDetail,
  }))
);
const StudyPlanPage = lazy(() =>
  import('./components/study-plan/StudyPlanPage').then((m) => ({ default: m.StudyPlanPage }))
);
const Review = lazy(() =>
  import('./components/review/Review').then((m) => ({ default: m.Review }))
);
const Settings = lazy(() =>
  import('./components/settings/Settings').then((m) => ({ default: m.Settings }))
);
const QuestionBrowser = lazy(() =>
  import('./components/questions/QuestionBrowser').then((m) => ({ default: m.QuestionBrowser }))
);
const ProgressPage = lazy(() =>
  import('./components/progress/ProgressPage').then((m) => ({ default: m.ProgressPage }))
);
const ReadinessPage = lazy(() =>
  import('./components/progress/ReadinessPage').then((m) => ({ default: m.ReadinessPage }))
);
const CaseStudiesPage = lazy(() =>
  import('./components/case-studies/CaseStudiesPage').then((m) => ({ default: m.CaseStudiesPage }))
);
const CaseStudyDetail = lazy(() =>
  import('./components/case-studies/CaseStudyDetail').then((m) => ({ default: m.CaseStudyDetail }))
);
const AchievementsPage = lazy(() =>
  import('./components/achievements/AchievementsPage').then((m) => ({
    default: m.AchievementsPage,
  }))
);
const BookmarksPage = lazy(() =>
  import('./components/bookmarks/BookmarksPage').then((m) => ({ default: m.BookmarksPage }))
);
const NotesPage = lazy(() =>
  import('./components/notes/NotesPage').then((m) => ({ default: m.NotesPage }))
);
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const AuthCallbackPage = lazy(() =>
  import('./pages/AuthCallbackPage').then((m) => ({ default: m.AuthCallbackPage }))
);
const ShareExamPage = lazy(() =>
  import('./pages/ShareExamPage').then((m) => ({ default: m.ShareExamPage }))
);
const VerifyCertificatePage = lazy(() =>
  import('./pages/VerifyCertificatePage').then((m) => ({ default: m.VerifyCertificatePage }))
);
const MasteryPage = lazy(() =>
  import('./pages/MasteryPage').then((m) => ({ default: m.MasteryPage }))
);

function LoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text-muted)',
      }}
    >
      Loading...
    </div>
  );
}

// Root redirect component - redirects to dashboard or login
function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuthStore();

  // Verify auth on mount
  useAuthVerification();

  // While loading auth state, show full-screen loader
  if (isLoading) {
    return <AuthLoader message="Loading..." />;
  }

  // Redirect based on authentication status
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

function App() {
  // Listen for offline exam sync notifications
  useOfflineSyncNotifications();

  // Handle navigation from push notification clicks
  const navigate = useNavigate();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data?.url) {
        navigate(event.data.url);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [navigate]);

  return (
    <ErrorBoundary>
      <Toast />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Root redirect based on auth state */}
          <Route path="/" element={<RootRedirect />} />

          {/* Public auth routes - no AppShell, no ProtectedRoute */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/verify/:hash" element={<VerifyCertificatePage />} />

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
            path="/study-plan"
            element={
              <ProtectedRoute>
                <AppShell>
                  <RouteErrorBoundary>
                    <StudyPlanPage />
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
            path="/mastery"
            element={
              <ProtectedRoute>
                <AppShell>
                  <RouteErrorBoundary>
                    <MasteryPage />
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
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
