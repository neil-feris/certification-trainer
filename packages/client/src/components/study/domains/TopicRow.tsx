import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { studyApi, questionApi } from '../../../api/client';
import styles from './Domains.module.css';

interface TopicRowProps {
  topic: {
    id: number;
    name: string;
    description: string;
    questionCount: number;
  };
  domainId: number;
  onStartPractice: (topicId: number, domainId: number) => void;
}

export function TopicRow({ topic, domainId, onStartPractice }: TopicRowProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['topicStats', topic.id],
    queryFn: () => studyApi.getTopicStats(topic.id),
    staleTime: 60000, // 1 minute
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await questionApi.generate({
        domainId,
        topicId: topic.id,
        difficulty: 'mixed',
        count: 10,
      });
      // Refresh domains to update question counts
      queryClient.invalidateQueries({ queryKey: ['studyDomains'] });
    } catch (error) {
      console.error('Failed to generate questions:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const getActionBadge = () => {
    if (!stats) return null;

    const colors: Record<string, string> = {
      practice: 'var(--accent-secondary)',
      review: 'var(--warning)',
      mastered: 'var(--success)',
    };

    const labels: Record<string, string> = {
      practice: 'Practice',
      review: 'Needs Review',
      mastered: 'Mastered',
    };

    return (
      <span className={styles.actionBadge} style={{ background: colors[stats.recommendedAction] }}>
        {labels[stats.recommendedAction]}
      </span>
    );
  };

  const hasQuestions = topic.questionCount > 0;

  return (
    <div className={styles.topicRow}>
      <div className={styles.topicInfo}>
        <div className={styles.topicHeader}>
          <span className={styles.topicBullet}>▸</span>
          <span className={styles.topicName}>{topic.name}</span>
          {hasQuestions && getActionBadge()}
          {!hasQuestions && (
            <span className={styles.actionBadge} style={{ background: 'var(--text-muted)' }}>
              No Questions
            </span>
          )}
        </div>
        {topic.description && <p className={styles.topicDescription}>{topic.description}</p>}
        {stats && stats.totalAttempted > 0 && (
          <div className={styles.topicStats}>
            <span className={styles.accuracy}>{stats.accuracy}% accuracy</span>
            <span className={styles.attempts}>({stats.totalAttempted} attempts)</span>
            {stats.questionsInSR > 0 && (
              <span className={styles.srCount}>{stats.questionsInSR} in review queue</span>
            )}
          </div>
        )}
      </div>

      {hasQuestions ? (
        <button
          className={`btn btn-secondary ${styles.practiceBtn}`}
          onClick={() => onStartPractice(topic.id, domainId)}
        >
          Practice
        </button>
      ) : (
        <button
          className={`btn btn-secondary ${styles.practiceBtn}`}
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
      )}
    </div>
  );
}
