import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStudyPlanStore } from '../../stores/studyPlanStore';
import { useCertificationStore } from '../../stores/certificationStore';
import type { StudyPlanTask, StudyPlanTaskType } from '@ace-prep/shared';
import styles from './StudyPlanWidget.module.css';

const TASK_ICONS: Record<StudyPlanTaskType, string> = {
  learning: '📖',
  practice: '✏️',
  review: '🔄',
  drill: '⏱️',
};

function getTaskLabel(task: StudyPlanTask): string {
  const labels: Record<StudyPlanTaskType, string> = {
    learning: 'Learning',
    practice: 'Practice',
    review: 'Review',
    drill: 'Drill',
  };
  const duration = task.estimatedMinutes ? `${task.estimatedMinutes}m` : '';
  return `${labels[task.taskType]}${duration ? ` · ${duration}` : ''}`;
}

export function StudyPlanWidget() {
  const navigate = useNavigate();
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const { activePlan, isLoading, error, fetchActivePlan } = useStudyPlanStore();

  // Fetch plan on mount if we have a certification selected
  useEffect(() => {
    if (selectedCertificationId) {
      fetchActivePlan(selectedCertificationId).catch(() => {
        // Error handled in store
      });
    }
  }, [selectedCertificationId, fetchActivePlan]);

  // Hide widget if no certification selected
  if (!selectedCertificationId) {
    return null;
  }

  // Loading state
  if (isLoading && !activePlan) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.icon}>📅</span>
          <h3 className={styles.title}>Study Plan</h3>
        </div>
        <div className={styles.loading}>
          <div className={styles.loadingDot} />
          <div className={styles.loadingDot} />
          <div className={styles.loadingDot} />
        </div>
      </div>
    );
  }

  // Error state (still show CTA to create)
  if (error && !activePlan) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.icon}>📅</span>
          <h3 className={styles.title}>Study Plan</h3>
        </div>
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>Unable to load study plan</p>
          <button className={styles.ctaButton} onClick={() => navigate('/study-plan')}>
            View Study Plan
          </button>
        </div>
      </div>
    );
  }

  // No active plan - show CTA
  if (!activePlan) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.icon}>📅</span>
          <h3 className={styles.title}>Study Plan</h3>
        </div>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🎯</span>
          <p className={styles.emptyText}>Create a personalized study plan</p>
          <button className={styles.ctaButton} onClick={() => navigate('/study-plan')}>
            Create Plan
          </button>
        </div>
      </div>
    );
  }

  // Show today's tasks
  const todaysTasks = activePlan.todaysTasks;
  const completedCount = todaysTasks.filter((t) => t.completedAt).length;
  const totalCount = todaysTasks.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.icon}>📅</span>
        <h3 className={styles.title}>Today's Study</h3>
        {totalCount > 0 && (
          <span className={styles.badge}>
            {completedCount}/{totalCount}
          </span>
        )}
      </div>

      {totalCount === 0 ? (
        <div className={styles.noTasks}>
          <span className={styles.noTasksIcon}>✨</span>
          <p className={styles.noTasksText}>No tasks for today</p>
        </div>
      ) : allComplete ? (
        <div className={styles.complete}>
          <span className={styles.completeIcon}>🎉</span>
          <p className={styles.completeText}>All done for today!</p>
        </div>
      ) : (
        <>
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <ul className={styles.taskList}>
            {todaysTasks.slice(0, 3).map((task) => (
              <li
                key={task.id}
                className={`${styles.taskItem} ${task.completedAt ? styles.taskCompleted : ''}`}
              >
                <span className={styles.taskIcon}>{TASK_ICONS[task.taskType]}</span>
                <span className={styles.taskLabel}>{getTaskLabel(task)}</span>
                {task.completedAt && <span className={styles.taskCheck}>✓</span>}
              </li>
            ))}
            {todaysTasks.length > 3 && (
              <li className={styles.moreText}>+{todaysTasks.length - 3} more</li>
            )}
          </ul>
        </>
      )}

      <Link to="/study-plan" className={styles.viewLink}>
        View Full Plan →
      </Link>
    </div>
  );
}
