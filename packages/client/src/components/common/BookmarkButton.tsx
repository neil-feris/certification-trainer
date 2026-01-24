import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookmarksApi } from '../../api/client';
import { showToast } from './Toast';
import styles from './BookmarkButton.module.css';

import type { BookmarkTargetType } from '@ace-prep/shared';

interface BookmarkButtonProps {
  targetType: BookmarkTargetType;
  targetId: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function BookmarkButton({
  targetType,
  targetId,
  size = 'md',
  className,
}: BookmarkButtonProps) {
  const queryClient = useQueryClient();
  const [optimisticBookmarked, setOptimisticBookmarked] = useState<boolean | null>(null);

  const { data: checkData } = useQuery({
    queryKey: ['bookmarkCheck', targetType, targetId],
    queryFn: () => bookmarksApi.check(targetType, targetId),
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: () => bookmarksApi.toggle(targetType, targetId),
    onMutate: () => {
      // Optimistic update
      setOptimisticBookmarked((prev) => {
        const current = prev ?? checkData?.bookmarked ?? false;
        return !current;
      });
    },
    onSuccess: (data) => {
      setOptimisticBookmarked(null);
      // Update the check query cache directly
      queryClient.setQueryData(['bookmarkCheck', targetType, targetId], {
        bookmarked: data.bookmarked,
      });
      // Invalidate bookmark lists
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarkCheck', targetType, targetId] });
    },
    onError: () => {
      // Rollback optimistic update
      setOptimisticBookmarked(null);
      showToast({
        message: 'Failed to update bookmark. Try again.',
        type: 'error',
      });
    },
  });

  const isBookmarked = optimisticBookmarked ?? checkData?.bookmarked ?? false;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!toggleMutation.isPending) {
        toggleMutation.mutate();
      }
    },
    [toggleMutation]
  );

  return (
    <button
      className={`${styles.bookmarkBtn} ${isBookmarked ? styles.active : ''} ${styles[size]} ${className ?? ''}`}
      onClick={handleClick}
      aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
      aria-pressed={isBookmarked}
      title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
    >
      <svg
        className={`${styles.icon} ${toggleMutation.isPending ? styles.pending : ''}`}
        viewBox="0 0 24 24"
        fill={isBookmarked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
