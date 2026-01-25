import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useExamStore } from '../stores/examStore';
import { deleteOfflineExam, type OfflineExamState } from '../services/offlineDb';

interface UseOfflineExamRecoveryReturn {
  /** The incomplete offline exam, if one exists */
  incompleteExam: OfflineExamState | null;
  /** Whether we're currently checking for incomplete exams */
  isChecking: boolean;
  /** Whether we're currently resuming an exam */
  isResuming: boolean;
  /** Resume the incomplete offline exam */
  resumeExam: () => Promise<void>;
  /** Abandon the incomplete offline exam */
  abandonExam: () => Promise<void>;
  /** Dismiss the recovery prompt without taking action */
  dismissPrompt: () => void;
  /** Whether the recovery prompt should be shown */
  showPrompt: boolean;
}

/**
 * Hook to detect and handle incomplete offline exams.
 *
 * On mount, checks IndexedDB for any in-progress offline exams.
 * If found, provides methods to resume or abandon the exam.
 *
 * @returns Object containing exam state and action handlers
 */
export function useOfflineExamRecovery(): UseOfflineExamRecoveryReturn {
  const navigate = useNavigate();
  const { getInProgressOfflineExam, resumeOfflineExam, hasIncompleteExam, offlineExamId } =
    useExamStore();

  const [incompleteExam, setIncompleteExam] = useState<OfflineExamState | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isResuming, setIsResuming] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  // Check for incomplete offline exams on mount
  useEffect(() => {
    let mounted = true;

    async function checkForIncompleteExam() {
      try {
        // Skip if there's already an exam in progress in the store
        // This means the user is actively taking an exam
        if (hasIncompleteExam() && offlineExamId) {
          setIsChecking(false);
          return;
        }

        const exam = await getInProgressOfflineExam();

        if (mounted && exam) {
          setIncompleteExam(exam);
          setShowPrompt(true);

          Sentry.addBreadcrumb({
            category: 'offline-exam',
            message: 'Found incomplete offline exam',
            level: 'info',
            data: {
              offlineExamId: exam.id,
              questionCount: exam.questionIds.length,
              answeredCount: exam.responses.size,
            },
          });
        }
      } catch (error) {
        Sentry.captureException(error, {
          extra: { context: 'check_incomplete_offline_exam' },
        });
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    }

    checkForIncompleteExam();

    return () => {
      mounted = false;
    };
  }, [getInProgressOfflineExam, hasIncompleteExam, offlineExamId]);

  const resumeExam = useCallback(async () => {
    if (!incompleteExam) return;

    setIsResuming(true);

    try {
      const success = await resumeOfflineExam(incompleteExam.id);

      if (success) {
        Sentry.addBreadcrumb({
          category: 'offline-exam',
          message: 'Resumed incomplete offline exam',
          level: 'info',
          data: { offlineExamId: incompleteExam.id },
        });

        setShowPrompt(false);
        setIncompleteExam(null);
        navigate('/exam/offline');
      } else {
        // If resume failed, the exam data might be corrupted
        // Offer to abandon
        Sentry.addBreadcrumb({
          category: 'offline-exam',
          message: 'Failed to resume offline exam - data may be corrupted',
          level: 'warning',
          data: { offlineExamId: incompleteExam.id },
        });
      }
    } catch (error) {
      Sentry.captureException(error, {
        extra: { offlineExamId: incompleteExam.id, context: 'resume_offline_exam' },
      });
    } finally {
      setIsResuming(false);
    }
  }, [incompleteExam, resumeOfflineExam, navigate]);

  const abandonExam = useCallback(async () => {
    if (!incompleteExam) return;

    try {
      await deleteOfflineExam(incompleteExam.id);

      Sentry.addBreadcrumb({
        category: 'offline-exam',
        message: 'Abandoned incomplete offline exam',
        level: 'info',
        data: { offlineExamId: incompleteExam.id },
      });

      setShowPrompt(false);
      setIncompleteExam(null);
    } catch (error) {
      Sentry.captureException(error, {
        extra: { offlineExamId: incompleteExam.id, context: 'abandon_offline_exam' },
      });
    }
  }, [incompleteExam]);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
  }, []);

  return {
    incompleteExam,
    isChecking,
    isResuming,
    resumeExam,
    abandonExam,
    dismissPrompt,
    showPrompt,
  };
}
