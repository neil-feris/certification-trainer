/**
 * StudyActivitySection - Container for study time tracking widgets
 *
 * Displays:
 * - Weekly total with comparison
 * - Activity heatmap (day × hour)
 * - Progress chart (daily time + questions)
 */

import { useQuery } from '@tanstack/react-query';
import { progressApi } from '../../api/client';
import { useCertificationStore } from '../../stores/certificationStore';
import { WeeklyTotalCard } from './WeeklyTotalCard';
import { ActivityHeatmap } from './ActivityHeatmap';
import { StudyProgressChart } from './StudyProgressChart';
import styles from './StudyActivitySection.module.css';

export function StudyActivitySection() {
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);

  const { data, isLoading, error } = useQuery({
    queryKey: ['studyTime', selectedCertificationId],
    queryFn: () => progressApi.getStudyTime(selectedCertificationId ?? undefined),
    staleTime: 300000, // 5 min cache
  });

  if (isLoading) {
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Study Activity</h2>
        <div className={styles.loading}>
          <div className="animate-pulse">Loading study activity...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null; // Silently fail - not critical
  }

  const hasAnyActivity =
    data.weeklyTotalSeconds > 0 ||
    data.previousWeekTotalSeconds > 0 ||
    data.heatmap.length > 0 ||
    data.daily.length > 0;

  if (!hasAnyActivity) {
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Study Activity</h2>
        <div className={styles.emptyState}>
          <p>Complete practice exams, drills, or flashcards to see your study activity</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Study Activity</h2>

      <div className={styles.topRow}>
        <WeeklyTotalCard
          weeklyTotalSeconds={data.weeklyTotalSeconds}
          previousWeekTotalSeconds={data.previousWeekTotalSeconds}
        />
        <ActivityHeatmap data={data.heatmap} />
      </div>

      <div className={styles.chartRow}>
        <h3 className={styles.chartTitle}>Last 30 Days</h3>
        <StudyProgressChart data={data.daily} />
      </div>
    </div>
  );
}
