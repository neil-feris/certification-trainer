import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackApi } from '../../api/client';
import type { IssueType } from '@ace-prep/shared';
import styles from './ReportIssueModal.module.css';

interface ReportIssueModalProps {
  questionId: number;
  isOpen: boolean;
  onClose: () => void;
  existingReport?: { issueType: IssueType; comment: string | null };
}

const ISSUE_TYPES: { value: IssueType; label: string }[] = [
  { value: 'wrong_answer', label: 'Wrong answer marked correct' },
  { value: 'unclear', label: 'Question is unclear' },
  { value: 'outdated', label: 'Content is outdated' },
  { value: 'other', label: 'Other issue' },
];

export function ReportIssueModal({
  questionId,
  isOpen,
  onClose,
  existingReport,
}: ReportIssueModalProps) {
  const [issueType, setIssueType] = useState<IssueType>(
    existingReport?.issueType ?? 'wrong_answer'
  );
  const [comment, setComment] = useState(existingReport?.comment ?? '');
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: () => feedbackApi.submitReport(questionId, issueType, comment || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionFeedback', questionId] });
      onClose();
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Report an Issue</h2>

        <form onSubmit={handleSubmit}>
          <div className={styles.options}>
            {ISSUE_TYPES.map((type) => (
              <label key={type.value} className={styles.option}>
                <input
                  type="radio"
                  name="issueType"
                  value={type.value}
                  checked={issueType === type.value}
                  onChange={() => setIssueType(type.value)}
                />
                <span>{type.label}</span>
              </label>
            ))}
          </div>

          <div className={styles.commentSection}>
            <label className={styles.commentLabel}>Add details (optional)</label>
            <textarea
              className={styles.commentInput}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Describe the issue..."
              maxLength={1000}
            />
          </div>

          {submitMutation.isError && (
            <div className={styles.error}>Failed to submit report. Please try again.</div>
          )}

          <div className={styles.actions}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitMutation.isPending}>
              {submitMutation.isPending ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
