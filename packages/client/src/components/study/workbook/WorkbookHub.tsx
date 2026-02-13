import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workbookApi } from '../../../api/client';
import { useWorkbookStore } from '../../../stores/workbookStore';
import { useCertificationStore } from '../../../stores/certificationStore';
import { WorkbookProgress } from './WorkbookProgress';
import { GuidedStudy } from './GuidedStudy';
import { QuickAssessment } from './QuickAssessment';
import { FullExam } from './FullExam';
import styles from './WorkbookHub.module.css';

type WorkbookTab = 'guided' | 'quick' | 'full';

export function WorkbookHub() {
  const [activeTab, setActiveTab] = useState<WorkbookTab>('guided');
  const mode = useWorkbookStore((s) => s.mode);
  const showSummary = useWorkbookStore((s) => s.showSummary);
  const resetStore = useWorkbookStore((s) => s.resetStore);
  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );
  const certShortName = selectedCert?.shortName ?? 'Exam';

  const { data: progressData, isLoading } = useQuery({
    queryKey: ['workbookProgress'],
    queryFn: workbookApi.getProgress,
  });

  // Fetch benchmark data for comparison
  const { data: benchmarkData } = useQuery({
    queryKey: ['workbookBenchmark'],
    queryFn: workbookApi.getBenchmark,
    enabled: !!progressData, // Only fetch after progress loads
    staleTime: 300000, // 5 min cache
  });

  // If in active session, show that view
  if (mode === 'guided' && !showSummary) {
    return <GuidedStudy onExit={resetStore} />;
  }
  if ((mode === 'quick' || mode === 'full') && !showSummary) {
    return mode === 'quick' ? (
      <QuickAssessment onExit={resetStore} />
    ) : (
      <FullExam onExit={resetStore} />
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Official Practice Questions</h1>
        <p className={styles.subtitle}>
          Diagnostic questions from the {certShortName} Exam Prep Workbook
        </p>
      </header>

      {/* Progress Overview */}
      {progressData && (
        <WorkbookProgress summary={progressData.summary} benchmark={benchmarkData} />
      )}

      {/* Mode Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'guided' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('guided')}
        >
          Guided Study
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'quick' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('quick')}
        >
          Quick Assessment
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'full' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('full')}
        >
          Full Exam
        </button>
      </div>

      {/* Tab Content */}
      <div className={styles.content}>
        {activeTab === 'guided' && (
          <GuidedStudyLanding summary={progressData?.summary} isLoading={isLoading} />
        )}
        {activeTab === 'quick' && <QuickAssessmentLanding />}
        {activeTab === 'full' && (
          <FullExamLanding
            hasProgress={
              (progressData?.summary.unattempted ?? progressData?.summary.total ?? 0) <
              (progressData?.summary.total ?? 0)
            }
            totalQuestions={progressData?.summary.total ?? 0}
          />
        )}
      </div>
    </div>
  );
}

function GuidedStudyLanding({
  summary,
  isLoading,
}: {
  summary?: { unattempted: number; total: number };
  isLoading: boolean;
}) {
  const startGuidedStudy = useWorkbookStore((s) => s.startGuidedStudy);

  const nextQuestion = summary ? summary.total - summary.unattempted + 1 : 1;

  return (
    <div className={styles.landing}>
      <h2>Sequential Walkthrough</h2>
      <p>
        Work through all questions in order, just like the official workbook. Get detailed
        explanations and learning resources after each question.
      </p>

      {!isLoading && summary && (
        <p className={styles.progress}>
          {summary.unattempted === 0
            ? 'All questions completed! Review your progress or retake.'
            : `Continue from Question ${nextQuestion} of ${summary.total}`}
        </p>
      )}

      <button className={styles.startButton} onClick={startGuidedStudy} disabled={isLoading}>
        {summary?.unattempted === 0 ? 'Review Questions' : 'Continue Study'}
      </button>
    </div>
  );
}

function QuickAssessmentLanding() {
  const startAssessment = useWorkbookStore((s) => s.startAssessment);
  const [count, setCount] = useState(15);

  return (
    <div className={styles.landing}>
      <h2>Quick Assessment</h2>
      <p>
        Test yourself with a random selection of workbook questions. Weighted toward questions you
        haven&apos;t mastered yet.
      </p>

      <div className={styles.countSelector}>
        <label>Number of questions:</label>
        <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
          <option value={10}>10 questions (~15 min)</option>
          <option value={15}>15 questions (~22 min)</option>
          <option value={20}>20 questions (~30 min)</option>
        </select>
      </div>

      <button className={styles.startButton} onClick={() => startAssessment('quick', count)}>
        Start Assessment
      </button>
    </div>
  );
}

function FullExamLanding({
  hasProgress,
  totalQuestions,
}: {
  hasProgress: boolean;
  totalQuestions: number;
}) {
  const startAssessment = useWorkbookStore((s) => s.startAssessment);
  const resetProgress = async () => {
    await workbookApi.resetProgress();
    startAssessment('full', totalQuestions);
  };

  return (
    <div className={styles.landing}>
      <h2>Full Exam Mode</h2>
      <p>
        All {totalQuestions} questions, randomized, with a 60-minute time limit. Simulates real exam
        pressure.
      </p>

      {hasProgress && (
        <div className={styles.warning}>
          <strong>Warning:</strong> Starting a full exam will reset your mastery progress to record
          a fresh first-attempt score.
        </div>
      )}

      <button className={styles.startButton} onClick={resetProgress}>
        {hasProgress ? 'Reset & Start Exam' : 'Start Full Exam'}
      </button>
    </div>
  );
}
