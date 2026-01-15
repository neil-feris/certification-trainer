import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { RouteErrorBoundary } from './components/common/RouteErrorBoundary';
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

function App() {
  return (
    <ErrorBoundary>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <RouteErrorBoundary>
                <Dashboard />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/exam"
            element={
              <RouteErrorBoundary>
                <ExamSetup />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/exam/:id"
            element={
              <RouteErrorBoundary>
                <ExamContainer />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/exam/:id/review"
            element={
              <RouteErrorBoundary>
                <ExamReview />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/study"
            element={
              <RouteErrorBoundary>
                <StudyHub />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/study/learning-path/:order"
            element={
              <RouteErrorBoundary>
                <LearningPathDetail />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/review"
            element={
              <RouteErrorBoundary>
                <Review />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/settings"
            element={
              <RouteErrorBoundary>
                <Settings />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/questions"
            element={
              <RouteErrorBoundary>
                <QuestionBrowser />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/progress"
            element={
              <RouteErrorBoundary>
                <ProgressPage />
              </RouteErrorBoundary>
            }
          />
        </Routes>
      </AppShell>
    </ErrorBoundary>
  );
}

export default App;
