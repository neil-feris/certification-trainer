import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studyApi } from '../../../api/client';
import { LearningPathItem } from './LearningPathItem';
import styles from './LearningPath.module.css';

export function LearningPathList() {
  const queryClient = useQueryClient();

  const { data: learningPath = [], isLoading } = useQuery({
    queryKey: ['learningPath'],
    queryFn: studyApi.getLearningPath,
  });

  const { data: stats } = useQuery({
    queryKey: ['learningPathStats'],
    queryFn: studyApi.getLearningPathStats,
  });

  const toggleMutation = useMutation({
    mutationFn: (order: number) => studyApi.toggleLearningPathItem(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learningPath'] });
      queryClient.invalidateQueries({ queryKey: ['learningPathStats'] });
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
