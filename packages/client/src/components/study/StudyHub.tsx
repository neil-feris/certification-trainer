import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useStudyStore } from '../../stores/studyStore';
import { useDrillStore } from '../../stores/drillStore';
import { useCertificationStore } from '../../stores/certificationStore';
import { studyApi } from '../../api/client';
import { useQuestionCache } from '../../hooks/useQuestionCache';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { LearningPathList } from './learning-path/LearningPathList';
import { DomainList } from './domains/DomainList';
import { TopicPractice } from './practice/TopicPractice';
import { SummaryBrowser } from './summaries/SummaryBrowser';
import { DrillHub } from './drills/DrillHub';
import { SessionRecoveryModal } from './SessionRecoveryModal';
import styles from './StudyHub.module.css';

type Tab = 'path' | 'domains' | 'practice' | 'drills' | 'summaries';

export function StudyHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const domainIdParam = searchParams.get('domainId');
  const [activeTab, setActiveTab] = useState<Tab>(domainIdParam ? 'domains' : 'path');
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const hasCachedRef = useRef(false);

  // Clear domainId param after reading it (prevents re-triggering on tab switch)
  useEffect(() => {
    if (domainIdParam) {
      setSearchParams({}, { replace: true });
    }
  }, [domainIdParam, setSearchParams]);

  const {
    sessionId,
    needsRecovery,
    startSession,
    recoverSession,
    abandonSession,
    resetSession,
    setNeedsRecovery,
  } = useStudyStore();

  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const drillId = useDrillStore((s) => s.drillId);
  const isDrillActive = useDrillStore((s) => s.isActive);
  const showDrillSummary = useDrillStore((s) => s.showSummary);
  const { isOnline } = useOnlineStatus();
  const { cacheQuestionsForTopics } = useQuestionCache();

  // Fetch domains to get topic IDs for caching
  const { data: domains = [] } = useQuery({
    queryKey: ['studyDomains', selectedCertificationId],
    queryFn: () => studyApi.getDomains(selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null && isOnline,
  });

  // Cache questions when domains load (only once per session)
  useEffect(() => {
    if (domains.length > 0 && isOnline && !hasCachedRef.current) {
      hasCachedRef.current = true;

      // Extract all topic IDs from domains
      const topicIds: number[] = [];
      for (const domain of domains) {
        if (domain.topics) {
          for (const topic of domain.topics) {
            topicIds.push(topic.id);
          }
        }
      }

      // Cache questions for all topics (limited by MAX_CACHE_SIZE in the hook)
      if (topicIds.length > 0) {
        cacheQuestionsForTopics(topicIds);
      }
    }
  }, [domains, isOnline, cacheQuestionsForTopics]);

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
  if (activeTab === 'drills' && drillId && (isDrillActive || showDrillSummary)) {
    return <DrillHub />;
  }

  return (
    <div className={styles.container}>
      {showRecoveryModal && (
        <SessionRecoveryModal onContinue={handleContinueSession} onDiscard={handleDiscardSession} />
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
        {activeTab === 'domains' && (
          <DomainList
            onStartPractice={handleStartPractice}
            highlightDomainId={domainIdParam ? parseInt(domainIdParam, 10) : undefined}
          />
        )}
        {activeTab === 'drills' && <DrillHub />}
        {activeTab === 'summaries' && <SummaryBrowser />}
      </div>
    </div>
  );
}
