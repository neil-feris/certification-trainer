/**
 * useOfflineSyncNotifications Hook
 *
 * Listens for sync events and shows toast notifications when offline exams
 * are successfully synced to the server.
 */
import { useEffect } from 'react';
import { SYNC_EVENTS, type SyncItemEventDetail } from '../services/syncService';
import { showToast } from '../components/common';

export function useOfflineSyncNotifications(): void {
  useEffect(() => {
    // Handler for successful sync items
    const handleSyncSuccess = (event: Event) => {
      const customEvent = event as CustomEvent<SyncItemEventDetail>;
      const { item, alreadySynced } = customEvent.detail;

      // Only notify for exam submissions
      if (item.type === 'exam_submission') {
        // Show different message if this was a duplicate/conflict resolution
        const message = alreadySynced
          ? 'This exam was already synced. View your results in the dashboard.'
          : 'Your offline exam has been synced! View your results in the dashboard.';

        showToast({
          message,
          type: 'success',
          duration: 6000,
          action: {
            label: 'View',
            onClick: () => {
              // Navigate to dashboard to see results
              window.location.href = '/dashboard';
            },
          },
        });
      }
    };

    // Handler for items that failed permanently
    const handleSyncDeadLetter = (event: Event) => {
      const customEvent = event as CustomEvent<SyncItemEventDetail>;
      const { item, error } = customEvent.detail;

      // Only notify for exam submissions
      if (item.type === 'exam_submission') {
        showToast({
          message: `Failed to sync offline exam: ${error || 'Unknown error'}`,
          type: 'error',
          duration: 8000,
        });
      }
    };

    // Add event listeners
    window.addEventListener(SYNC_EVENTS.SYNC_ITEM_SUCCESS, handleSyncSuccess);
    window.addEventListener(SYNC_EVENTS.SYNC_ITEM_DEAD_LETTER, handleSyncDeadLetter);

    // Cleanup
    return () => {
      window.removeEventListener(SYNC_EVENTS.SYNC_ITEM_SUCCESS, handleSyncSuccess);
      window.removeEventListener(SYNC_EVENTS.SYNC_ITEM_DEAD_LETTER, handleSyncDeadLetter);
    };
  }, []);
}
