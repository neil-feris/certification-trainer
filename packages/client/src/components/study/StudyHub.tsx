import { useState, useEffect } from 'react';
import { useStudyStore } from '../../stores/studyStore';
import { useDrillStore } from '../../stores/drillStore';
import { LearningPathList } from './learning-path/LearningPathList';
import { DomainList } from './domains/DomainList';
import { TopicPractice } from './practice/TopicPractice';
import { SummaryBrowser } from './summaries/SummaryBrowser';
import { DrillHub } from './drills/DrillHub';
import { SessionRecoveryModal } from './SessionRecoveryModal';
import styles from './StudyHub.module.css';

type Tab = 'path' | 'domains' | 'practice' | 'drills' | 'summaries';

export function StudyHub() {
  const [activeTab, setActiveTab] = useState<Tab>('path');
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  const {
    sessionId,
    needsRecovery,
    startSession,
    recoverSession,
    abandonSession,
    resetSession,
    setNeedsRecovery,
  } = useStudyStore();

  // Check for session recovery on mount
  useEffect(() => {
    const checkRecovery = async () => {
      const hasSession = await recoverSession();
      if (hasSession) {
        setShowRecoveryModal(true);
      }
    };
    checkRecovery();
  }, [recoverSession]);

  // If there's an active session, show practice view
  useEffect(() => {
    if (sessionId && !needsRecovery) {
      setActiveTab('practice');
    }
  }, [sessionId, needsRecovery]);

  const handleContinueSession = () => {
    setShowRecoveryModal(false);
    setNeedsRecovery(false);
    setActiveTab('practice');
  };

  const handleDiscardSession = async () => {
    await abandonSession();
    setShowRecoveryModal(false);
    setNeedsRecovery(false);
    resetSession();
  };

  const handleStartPractice = async (topicId: number, domainId: number) => {
    try {
      await startSession('topic_practice', topicId, domainId);
      setActiveTab('practice');
    } catch (error) {
      console.error('Failed to start practice session:', error);
    }
  };

  const handleExitPractice = () => {
    resetSession();
    setActiveTab('domains');
  };

  // If in practice mode, show the practice view full-screen
  if (activeTab === 'practice' && sessionId) {
    return <TopicPractice onExit={handleExitPractice} />;
  }

  // If in drills mode with active drill, show full-screen
  const { drillId, isActive: isDrillActive, showSummary: showDrillSummary } = useDrillStore.getState();
  if (activeTab === 'drills' && drillId && (isDrillActive || showDrillSummary)) {
    return <DrillHub />;
  }

  return (
    <div className={styles.container}>
      {showRecoveryModal && (
        <SessionRecoveryModal
          onContinue={handleContinueSession}
          onDiscard={handleDiscardSession}
        />
      )}

      <header className={styles.header}>
        <h1>Study Hub</h1>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'path' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('path')}
          >
            Learning Path
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'domains' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('domains')}
          >
            Practice
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'drills' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('drills')}
          >
            Drills
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'summaries' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('summaries')}
          >
            Summaries
          </button>
        </div>
      </header>

      <div className={styles.content}>
        {activeTab === 'path' && <LearningPathList />}
        {activeTab === 'domains' && <DomainList onStartPractice={handleStartPractice} />}
        {activeTab === 'drills' && <DrillHub />}
        {activeTab === 'summaries' && <SummaryBrowser />}
      </div>
    </div>
  );
}
