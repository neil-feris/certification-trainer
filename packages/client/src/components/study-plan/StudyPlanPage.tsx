import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useStudyPlanStore } from '../../stores/studyPlanStore';
import { useCertificationStore } from '../../stores/certificationStore';
import { PlanSetupModal } from './PlanSetupModal';
import { DailyChecklist } from './DailyChecklist';
import { CalendarView } from './CalendarView';
import styles from './StudyPlanPage.module.css';

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

  // Loading state
  if (isLoading && !activePlan) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading study plan...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !activePlan) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <span className={styles.errorIcon}>⚠️</span>
          <p className={styles.errorText}>{error}</p>
          <button
            className={styles.retryBtn}
            onClick={() => {
              clearError();
              fetchActivePlan(selectedCertificationId);
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No active plan - show CTA
  if (!activePlan) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📅</span>
          <h2 className={styles.emptyTitle}>No Study Plan Yet</h2>
          <p className={styles.emptyText}>
            Create a personalized study schedule based on your exam date and current readiness.
          </p>
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
