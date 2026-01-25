import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useStudyPlanStore } from '../../stores/studyPlanStore';
import { useCertificationStore } from '../../stores/certificationStore';
import { PlanSetupModal } from './PlanSetupModal';
import { DailyChecklist } from './DailyChecklist';
import { CalendarView } from './CalendarView';
import { StudyPlanSkeleton } from './StudyPlanSkeleton';
import styles from './StudyPlanPage.module.css';

// SVG Illustration for empty state - calendar with sparkles
const EmptyStateIllustration = () => (
  <svg
    width="180"
    height="160"
    viewBox="0 0 180 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={styles.emptyIllustration}
  >
    {/* Calendar base */}
    <rect
      x="30"
      y="35"
      width="120"
      height="105"
      rx="8"
      fill="var(--bg-secondary)"
      stroke="var(--border-color)"
      strokeWidth="2"
    />
    {/* Calendar header */}
    <rect x="30" y="35" width="120" height="28" rx="8" fill="var(--accent-primary)" />
    <rect x="30" y="55" width="120" height="8" fill="var(--accent-primary)" />
    {/* Calendar rings */}
    <rect x="52" y="28" width="8" height="16" rx="2" fill="var(--text-muted)" />
    <rect x="120" y="28" width="8" height="16" rx="2" fill="var(--text-muted)" />
    {/* Calendar grid lines */}
    <line x1="30" y1="85" x2="150" y2="85" stroke="var(--border-color)" strokeWidth="1" />
    <line x1="30" y1="107" x2="150" y2="107" stroke="var(--border-color)" strokeWidth="1" />
    <line x1="70" y1="63" x2="70" y2="140" stroke="var(--border-color)" strokeWidth="1" />
    <line x1="110" y1="63" x2="110" y2="140" stroke="var(--border-color)" strokeWidth="1" />
    {/* Checkmark */}
    <circle cx="90" cy="96" r="14" fill="var(--success)" fillOpacity="0.15" />
    <path
      d="M82 96L87 101L98 90"
      stroke="var(--success)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Sparkles */}
    <path
      d="M20 55L22 50L24 55L29 57L24 59L22 64L20 59L15 57L20 55Z"
      fill="var(--accent-primary)"
    />
    <path
      d="M155 75L157 70L159 75L164 77L159 79L157 84L155 79L150 77L155 75Z"
      fill="var(--warning)"
    />
    <path
      d="M160 30L162 25L164 30L169 32L164 34L162 39L160 34L155 32L160 30Z"
      fill="var(--accent-primary)"
    />
    {/* Small dots */}
    <circle cx="12" cy="80" r="3" fill="var(--accent-primary)" fillOpacity="0.5" />
    <circle cx="168" cy="50" r="2" fill="var(--warning)" fillOpacity="0.6" />
    <circle cx="25" cy="120" r="2" fill="var(--success)" fillOpacity="0.5" />
  </svg>
);

// SVG for error state
const ErrorIllustration = () => (
  <svg
    width="120"
    height="100"
    viewBox="0 0 120 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={styles.errorIllustration}
  >
    {/* Cloud with error */}
    <path
      d="M90 55C95.5228 55 100 50.5228 100 45C100 39.4772 95.5228 35 90 35C89.6716 35 89.3465 35.0147 89.0255 35.0436C87.5156 28.7561 81.8479 24 75 24C68.1521 24 62.4844 28.7561 60.9745 35.0436C60.6535 35.0147 60.3284 35 60 35C54.4772 35 50 39.4772 50 45C50 50.5228 54.4772 55 60 55"
      stroke="var(--text-muted)"
      strokeWidth="2"
      strokeLinecap="round"
    />
    {/* Error circle */}
    <circle
      cx="60"
      cy="68"
      r="20"
      fill="var(--error)"
      fillOpacity="0.15"
      stroke="var(--error)"
      strokeWidth="2"
    />
    {/* X mark */}
    <path
      d="M52 60L68 76M68 60L52 76"
      stroke="var(--error)"
      strokeWidth="3"
      strokeLinecap="round"
    />
    {/* Small elements */}
    <circle cx="25" cy="45" r="4" fill="var(--text-muted)" fillOpacity="0.3" />
    <circle cx="95" cy="70" r="3" fill="var(--text-muted)" fillOpacity="0.3" />
  </svg>
);

// Trophy celebration SVG
const CelebrationIllustration = () => (
  <svg
    width="200"
    height="180"
    viewBox="0 0 200 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={styles.celebrationIllustration}
  >
    {/* Trophy base */}
    <rect x="75" y="140" width="50" height="12" rx="4" fill="var(--warning)" />
    <rect x="85" y="125" width="30" height="20" fill="var(--warning)" />
    {/* Trophy cup */}
    <path
      d="M60 45C60 45 55 45 52 55C49 65 52 80 60 85L65 120H135L140 85C148 80 151 65 148 55C145 45 140 45 140 45"
      fill="var(--warning)"
    />
    <path
      d="M60 45H140V75C140 95 125 115 100 115C75 115 60 95 60 75V45Z"
      fill="var(--accent-primary)"
    />
    {/* Trophy shine */}
    <path
      d="M75 55V85C75 95 85 105 100 105"
      stroke="white"
      strokeWidth="4"
      strokeLinecap="round"
      strokeOpacity="0.3"
    />
    {/* Star on trophy */}
    <path
      d="M100 60L103.5 70H114L105.5 77L109 87L100 80L91 87L94.5 77L86 70H96.5L100 60Z"
      fill="white"
      fillOpacity="0.9"
    />
    {/* Confetti */}
    <rect
      x="30"
      y="25"
      width="8"
      height="8"
      rx="2"
      fill="var(--success)"
      transform="rotate(15 30 25)"
    />
    <rect
      x="160"
      y="35"
      width="10"
      height="10"
      rx="2"
      fill="var(--accent-primary)"
      transform="rotate(-20 160 35)"
    />
    <rect
      x="45"
      y="75"
      width="6"
      height="6"
      rx="1"
      fill="var(--warning)"
      transform="rotate(30 45 75)"
    />
    <rect
      x="150"
      y="85"
      width="7"
      height="7"
      rx="1"
      fill="var(--error)"
      transform="rotate(-15 150 85)"
    />
    {/* Sparkles */}
    <path d="M25 50L28 42L31 50L39 53L31 56L28 64L25 56L17 53L25 50Z" fill="var(--warning)" />
    <path
      d="M170 55L173 47L176 55L184 58L176 61L173 69L170 61L162 58L170 55Z"
      fill="var(--success)"
    />
    <path
      d="M100 15L103 7L106 15L114 18L106 21L103 29L100 21L92 18L100 15Z"
      fill="var(--accent-primary)"
    />
    {/* Floating dots */}
    <circle cx="40" cy="110" r="4" fill="var(--success)" fillOpacity="0.5" />
    <circle cx="165" cy="115" r="3" fill="var(--accent-primary)" fillOpacity="0.5" />
    <circle cx="55" cy="40" r="3" fill="var(--warning)" fillOpacity="0.6" />
    <circle cx="145" cy="25" r="4" fill="var(--error)" fillOpacity="0.5" />
  </svg>
);

export function StudyPlanPage() {
  const { activePlan, isLoading, error, fetchActivePlan, regeneratePlan, abandonPlan, clearError } =
    useStudyPlanStore();
  const { selectedCertificationId } = useCertificationStore();

  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);

  // Fetch active plan on mount and when certification changes
  useEffect(() => {
    if (selectedCertificationId) {
      fetchActivePlan(selectedCertificationId);
    }
  }, [selectedCertificationId, fetchActivePlan]);

  const handleCreatePlan = () => {
    setIsSetupModalOpen(true);
  };

  const handlePlanCreated = () => {
    // Modal closes itself on success
  };

  const handleRegenerate = async () => {
    return Sentry.startSpan(
      {
        op: 'ui.action',
        name: 'Regenerate Plan from Page',
      },
      async () => {
        setIsRegenerating(true);
        try {
          await regeneratePlan(true);
        } catch (err) {
          // Error is handled in store
          console.error('Failed to regenerate plan:', err);
        } finally {
          setIsRegenerating(false);
        }
      }
    );
  };

  const handleAbandon = async () => {
    return Sentry.startSpan(
      {
        op: 'ui.action',
        name: 'Abandon Plan from Page',
      },
      async () => {
        setIsAbandoning(true);
        try {
          await abandonPlan();
          setShowAbandonConfirm(false);
        } catch (err) {
          console.error('Failed to abandon plan:', err);
        } finally {
          setIsAbandoning(false);
        }
      }
    );
  };

  const formatExamDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysRemaining = () => {
    if (!activePlan) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const examDate = new Date(activePlan.plan.targetExamDate);
    const diff = examDate.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // No certification selected
  if (!selectedCertificationId) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📚</span>
          <h2 className={styles.emptyTitle}>Select a Certification</h2>
          <p className={styles.emptyText}>
            Choose a certification from the sidebar to create a study plan.
          </p>
        </div>
      </div>
    );
  }

  // Loading state - show skeleton
  if (isLoading && !activePlan) {
    return <StudyPlanSkeleton />;
  }

  // Error state with illustration
  if (error && !activePlan) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <ErrorIllustration />
          <h2 className={styles.errorTitle}>Something went wrong</h2>
          <p className={styles.errorText}>{error}</p>
          <button
            className={`btn btn-primary ${styles.retryBtn}`}
            onClick={() => {
              clearError();
              fetchActivePlan(selectedCertificationId);
            }}
          >
            <span className={styles.retryIcon}>↻</span>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No active plan - show CTA with illustration
  if (!activePlan) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <EmptyStateIllustration />
          <h2 className={styles.emptyTitle}>Create Your Study Plan</h2>
          <p className={styles.emptyText}>
            Get a personalized day-by-day schedule tailored to your exam date and current readiness.
            We'll focus more time on your weaker areas to maximize your preparation.
          </p>
          <div className={styles.emptyFeatures}>
            <div className={styles.emptyFeature}>
              <span className={styles.featureIcon}>📊</span>
              <span>Adapts to your strengths</span>
            </div>
            <div className={styles.emptyFeature}>
              <span className={styles.featureIcon}>📅</span>
              <span>Daily task checklists</span>
            </div>
            <div className={styles.emptyFeature}>
              <span className={styles.featureIcon}>🔄</span>
              <span>Spaced repetition built-in</span>
            </div>
          </div>
          <button className={`btn btn-primary ${styles.ctaBtn}`} onClick={handleCreatePlan}>
            <span className={styles.ctaIcon}>✨</span>
            Create Study Plan
          </button>
        </div>

        <PlanSetupModal
          isOpen={isSetupModalOpen}
          onClose={() => setIsSetupModalOpen(false)}
          onSuccess={handlePlanCreated}
        />
      </div>
    );
  }

  // Active plan exists - show full page
  const daysRemaining = getDaysRemaining();
  const progress = activePlan.progress;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>Study Plan</h1>
          <div className={styles.examInfo}>
            <span className={styles.examIcon}>🎯</span>
            <span className={styles.examDate}>
              {formatExamDate(activePlan.plan.targetExamDate)}
            </span>
            <span className={styles.daysRemaining}>
              {daysRemaining > 0 ? (
                <>
                  <strong>{daysRemaining}</strong> days remaining
                </>
              ) : daysRemaining === 0 ? (
                <span className={styles.examToday}>Exam day!</span>
              ) : (
                <span className={styles.examPast}>Exam date passed</span>
              )}
            </span>
          </div>
        </div>

        <div className={styles.headerActions}>
          <button
            className={`btn btn-ghost ${styles.actionBtn}`}
            onClick={handleRegenerate}
            disabled={isRegenerating || isLoading}
            title="Update plan based on current progress"
          >
            {isRegenerating ? (
              <>
                <span className={styles.btnSpinner} />
                Regenerating...
              </>
            ) : (
              <>
                <span className={styles.btnIcon}>🔄</span>
                Regenerate Plan
              </>
            )}
          </button>
          <button
            className={`btn btn-ghost ${styles.actionBtn} ${styles.abandonBtn}`}
            onClick={() => setShowAbandonConfirm(true)}
            disabled={isAbandoning || isLoading}
          >
            <span className={styles.btnIcon}>🗑️</span>
            Abandon Plan
          </button>
        </div>
      </div>

      {/* Plan Complete Celebration */}
      {progress.percentComplete === 100 && (
        <div className={styles.celebrationBanner}>
          <CelebrationIllustration />
          <div className={styles.celebrationContent}>
            <h2 className={styles.celebrationTitle}>Study Plan Complete!</h2>
            <p className={styles.celebrationText}>
              Congratulations! You've completed all {progress.totalDays} days of your study plan.
              You're ready for your exam!
            </p>
            <div className={styles.celebrationStats}>
              <div className={styles.celebrationStat}>
                <span className={styles.celebrationStatValue}>{progress.completedTasks}</span>
                <span className={styles.celebrationStatLabel}>Tasks Completed</span>
              </div>
              <div className={styles.celebrationStat}>
                <span className={styles.celebrationStatValue}>{progress.totalDays}</span>
                <span className={styles.celebrationStatLabel}>Days of Study</span>
              </div>
            </div>
            <button
              className={`btn btn-primary ${styles.celebrationBtn}`}
              onClick={handleCreatePlan}
            >
              Create New Plan
            </button>
          </div>
        </div>
      )}

      {/* Progress Summary */}
      <div className={styles.progressSummary}>
        <div className={styles.progressCard}>
          <span className={styles.progressValue}>{progress.completedDays}</span>
          <span className={styles.progressLabel}>Days Complete</span>
        </div>
        <div className={styles.progressCard}>
          <span className={styles.progressValue}>{progress.totalDays}</span>
          <span className={styles.progressLabel}>Total Days</span>
        </div>
        <div className={styles.progressCard}>
          <span className={styles.progressValue}>{progress.completedTasks}</span>
          <span className={styles.progressLabel}>Tasks Done</span>
        </div>
        <div className={styles.progressCard}>
          <span className={styles.progressValue}>{progress.percentComplete}%</span>
          <span className={styles.progressLabel}>Complete</span>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className={styles.content}>
        <div className={styles.checklistSection}>
          <DailyChecklist />
        </div>
        <div className={styles.calendarSection}>
          <CalendarView />
        </div>
      </div>

      {/* Abandon Confirmation Dialog */}
      {showAbandonConfirm && (
        <div className={styles.confirmOverlay} onClick={() => setShowAbandonConfirm(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Abandon Study Plan?</h3>
            <p className={styles.confirmText}>
              This will remove your current study plan. You can create a new one at any time.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={`btn btn-ghost ${styles.confirmCancel}`}
                onClick={() => setShowAbandonConfirm(false)}
                disabled={isAbandoning}
              >
                Cancel
              </button>
              <button
                className={`btn ${styles.confirmDelete}`}
                onClick={handleAbandon}
                disabled={isAbandoning}
              >
                {isAbandoning ? (
                  <>
                    <span className={styles.btnSpinner} />
                    Abandoning...
                  </>
                ) : (
                  'Abandon Plan'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <PlanSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        onSuccess={handlePlanCreated}
      />
    </div>
  );
}
