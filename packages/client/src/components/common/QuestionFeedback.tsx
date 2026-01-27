import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackApi } from '../../api/client';
import { ReportIssueModal } from './ReportIssueModal';
import styles from './QuestionFeedback.module.css';

interface QuestionFeedbackProps {
  questionId: number;
  className?: string;
}

export function QuestionFeedback({ questionId, className }: QuestionFeedbackProps) {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: feedback, isLoading } = useQuery({
    queryKey: ['questionFeedback', questionId],
    queryFn: () => feedbackApi.getUserFeedback(questionId),
  });

  const submitRatingMutation = useMutation({
    mutationFn: (rating: 'up' | 'down') => feedbackApi.submitRating(questionId, rating),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionFeedback', questionId] });
    },
  });

  const removeRatingMutation = useMutation({
    mutationFn: () => feedbackApi.removeRating(questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionFeedback', questionId] });
    },
  });

  const handleRatingClick = (rating: 'up' | 'down') => {
    if (feedback?.rating === rating) {
      // Toggle off
      removeRatingMutation.mutate();
    } else {
      submitRatingMutation.mutate(rating);
    }
  };

  const isPending = submitRatingMutation.isPending || removeRatingMutation.isPending;

  return (
    <div className={`${styles.container} ${className ?? ''} ${isPending ? styles.loading : ''}`}>
      <div className={styles.ratingButtons}>
        <button
          className={`${styles.ratingButton} ${styles.up} ${feedback?.rating === 'up' ? styles.active : ''}`}
          onClick={() => handleRatingClick('up')}
          disabled={isPending || isLoading}
          title="Helpful question"
          aria-label="Thumbs up"
        >
          👍
        </button>
        <button
          className={`${styles.ratingButton} ${styles.down} ${feedback?.rating === 'down' ? styles.active : ''}`}
          onClick={() => handleRatingClick('down')}
          disabled={isPending || isLoading}
          title="Not helpful"
          aria-label="Thumbs down"
        >
          👎
        </button>
      </div>

      {feedback?.report ? (
        <span className={styles.reported}>Issue reported</span>
      ) : (
        <button className={styles.reportLink} onClick={() => setIsReportModalOpen(true)}>
          Report issue
        </button>
      )}

      <ReportIssueModal
        questionId={questionId}
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        existingReport={feedback?.report ?? undefined}
      />
    </div>
  );
}
