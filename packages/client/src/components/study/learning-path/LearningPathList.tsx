import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studyApi } from '../../../api/client';
import { useCertificationStore } from '../../../stores/certificationStore';
import { LearningPathItem } from './LearningPathItem';
import styles from './LearningPath.module.css';

export function LearningPathList() {
  const queryClient = useQueryClient();
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);

  const { data: learningPath = [], isLoading } = useQuery({
    queryKey: ['learningPath', selectedCertificationId],
    queryFn: () => studyApi.getLearningPath(selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

  const { data: stats } = useQuery({
    queryKey: ['learningPathStats', selectedCertificationId],
    queryFn: () => studyApi.getLearningPathStats(selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

  const toggleMutation = useMutation({
    mutationFn: (order: number) =>
      studyApi.toggleLearningPathItem(order, selectedCertificationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learningPath', selectedCertificationId] });
      queryClient.invalidateQueries({ queryKey: ['learningPathStats', selectedCertificationId] });
    },
  });

  if (isLoading) {
    return <div className={styles.loading}>Loading learning path...</div>;
  }

  const completedCount = stats?.completed || 0;
  const totalCount = stats?.total || 14;
  const percentComplete = stats?.percentComplete || 0;

  return (
    <div className={styles.container}>
      <div className={styles.progressHeader}>
        <div className={styles.progressInfo}>
          <span className={styles.progressLabel}>Your Progress</span>
          <span className={styles.progressCount}>
            {completedCount} of {totalCount} completed
          </span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${percentComplete}%` }} />
        </div>
        <span className={styles.progressPercent}>{percentComplete}%</span>
      </div>

      <div className={styles.pathList}>
        {learningPath.map((item) => (
          <LearningPathItem
            key={item.order}
            item={item}
            onToggle={() => toggleMutation.mutate(item.order)}
            isToggling={toggleMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}
