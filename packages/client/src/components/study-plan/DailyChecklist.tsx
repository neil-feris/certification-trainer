import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useStudyPlanStore } from '../../stores/studyPlanStore';
import type { StudyPlanTask, StudyPlanTaskType } from '@ace-prep/shared';
import styles from './DailyChecklist.module.css';

interface TaskConfig {
  icon: string;
  label: string;
  getLink: (task: StudyPlanTask) => string;
}

const TASK_CONFIGS: Record<StudyPlanTaskType, TaskConfig> = {
  learning: {
    icon: '📖',
    label: 'Learning',
    getLink: (task) => (task.targetId ? `/study/learning-path/${task.targetId}` : '/study'),
  },
  practice: {
    icon: '✏️',
    label: 'Practice',
    getLink: () => '/study',
  },
  review: {
    icon: '🔄',
    label: 'Review',
    getLink: () => '/review',
  },
  drill: {
    icon: '⏱️',
    label: 'Drill',
    getLink: () => '/study',
  },
};

function getTaskDescription(task: StudyPlanTask): string {
  const config = TASK_CONFIGS[task.taskType];
  const duration = task.estimatedMinutes ? `${task.estimatedMinutes} min` : '';
  return `${config.label}${duration ? ` · ${duration}` : ''}`;
}

export function DailyChecklist() {
  const { activePlan, completeTask, isLoading } = useStudyPlanStore();
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null);

  const todaysTasks = activePlan?.todaysTasks ?? [];
  const completedCount = todaysTasks.filter((t) => t.completedAt).length;
  const totalCount = todaysTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allComplete = totalCount > 0 && completedCount === totalCount;

  const handleTaskComplete = async (task: StudyPlanTask) => {
    if (task.completedAt || completingTaskId) return;

    setCompletingTaskId(task.id);

    return Sentry.startSpan(
      {
        op: 'ui.action',
        name: 'Complete Daily Task',
      },
      async (span) => {
        span.setAttribute('task_id', task.id);
        span.setAttribute('task_type', task.taskType);

        try {
          await completeTask(task.id);
        } catch (error) {
          // Error handling is done in store
          console.error('Failed to complete task:', error);
        } finally {
          setCompletingTaskId(null);
        }
      }
    );
  };

  if (totalCount === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Today's Tasks</h3>
        </div>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📭</span>
          <p className={styles.emptyText}>No tasks scheduled for today</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Today's Tasks</h3>
        <span className={styles.counter}>
          {completedCount}/{totalCount}
        </span>
      </div>

      <div className={styles.progressContainer}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
        </div>
        <span className={styles.progressLabel}>{progressPercent}%</span>
      </div>

      {allComplete ? (
        <div className={styles.celebration}>
          <span className={styles.celebrationIcon}>🎉</span>
          <h4 className={styles.celebrationTitle}>All done!</h4>
          <p className={styles.celebrationText}>Great work completing today's study tasks!</p>
        </div>
      ) : (
        <ul className={styles.taskList}>
          {todaysTasks.map((task) => {
            const config = TASK_CONFIGS[task.taskType];
            const isCompleted = !!task.completedAt;
            const isCompleting = completingTaskId === task.id;

            return (
              <li key={task.id} className={styles.taskItem}>
                <button
                  type="button"
                  className={`${styles.checkbox} ${isCompleted ? styles.checkboxCompleted : ''}`}
                  onClick={() => handleTaskComplete(task)}
                  disabled={isCompleted || isCompleting || isLoading}
                  aria-label={isCompleted ? 'Task completed' : 'Mark task as complete'}
                >
                  {isCompleting ? (
                    <span className={styles.checkboxSpinner} />
                  ) : isCompleted ? (
                    <span className={styles.checkmark}>✓</span>
                  ) : null}
                </button>

                <Link
                  to={config.getLink(task)}
                  className={`${styles.taskContent} ${isCompleted ? styles.taskCompleted : ''}`}
                >
                  <span className={styles.taskIcon}>{config.icon}</span>
                  <span className={styles.taskDescription}>{getTaskDescription(task)}</span>
                </Link>

                {task.notes && (
                  <span className={styles.taskNotes} title={task.notes}>
                    📝
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
