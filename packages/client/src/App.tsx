import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './components/dashboard/Dashboard';
import { ExamSetup } from './components/exam/ExamSetup';
import { ExamContainer } from './components/exam/ExamContainer';
import { ExamReview } from './components/exam/ExamReview';
import { StudyHub } from './components/study/StudyHub';
import { Settings } from './components/settings/Settings';

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/exam" element={<ExamSetup />} />
        <Route path="/exam/:id" element={<ExamContainer />} />
        <Route path="/exam/:id/review" element={<ExamReview />} />
        <Route path="/study" element={<StudyHub />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}

export default App;
