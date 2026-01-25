import styles from './StudyPlanSkeleton.module.css';

/**
 * Skeleton loader for the StudyPlanPage
 * Shows a shimmer effect while content loads
 */
export function StudyPlanSkeleton() {
  return (
    <div className={styles.skeleton}>
      {/* Header skeleton */}
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={`${styles.bar} ${styles.title}`} />
          <div className={styles.examInfo}>
            <div className={`${styles.bar} ${styles.examDate}`} />
            <div className={`${styles.bar} ${styles.daysRemaining}`} />
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={`${styles.bar} ${styles.actionBtn}`} />
          <div className={`${styles.bar} ${styles.actionBtn}`} />
        </div>
      </div>

      {/* Progress cards skeleton */}
      <div className={styles.progressSummary}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.progressCard}>
            <div className={`${styles.bar} ${styles.progressValue}`} />
            <div className={`${styles.bar} ${styles.progressLabel}`} />
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className={styles.content}>
        {/* Checklist skeleton */}
        <div className={styles.checklistSection}>
          <div className={styles.checklistCard}>
            <div className={`${styles.bar} ${styles.checklistTitle}`} />
            <div className={styles.checklistProgress}>
              <div className={`${styles.bar} ${styles.progressBarSkeleton}`} />
            </div>
            <div className={styles.taskList}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={styles.taskItem}>
                  <div className={`${styles.bar} ${styles.taskCheckbox}`} />
                  <div className={`${styles.bar} ${styles.taskText}`} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar skeleton */}
        <div className={styles.calendarSection}>
          <div className={styles.calendarCard}>
            <div className={styles.calendarHeader}>
              <div className={`${styles.bar} ${styles.calendarNav}`} />
              <div className={`${styles.bar} ${styles.calendarMonth}`} />
              <div className={`${styles.bar} ${styles.calendarNav}`} />
            </div>
            <div className={styles.calendarGrid}>
              {/* Day names */}
              <div className={styles.dayNames}>
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} className={`${styles.bar} ${styles.dayName}`} />
                ))}
              </div>
              {/* Calendar days */}
              <div className={styles.days}>
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className={styles.dayCell}>
                    <div className={`${styles.bar} ${styles.dayNumber}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
