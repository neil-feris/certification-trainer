import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as Sentry from '@sentry/react';
import { studyPlanApi } from '../api/client';
import { useCertificationStore } from './certificationStore';
import type {
  StudyPlanResponse,
  StudyPlanTask,
  CreateStudyPlanRequest,
  CompleteTaskResponse,
} from '@ace-prep/shared';

interface StudyPlanState {
  // Plan data
  activePlan: StudyPlanResponse | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchActivePlan: (certificationId?: number) => Promise<void>;
  createPlan: (request: CreateStudyPlanRequest) => Promise<void>;
  completeTask: (taskId: number, notes?: string) => Promise<CompleteTaskResponse>;
  abandonPlan: () => Promise<void>;
  regeneratePlan: (keepCompletedTasks?: boolean) => Promise<void>;
  clearError: () => void;
  reset: () => void;

  // Getters
  getActivePlanId: () => number | null;
  getTodaysTasks: () => StudyPlanTask[];
}

const initialState = {
  activePlan: null,
  isLoading: false,
  error: null,
};

export const useStudyPlanStore = create<StudyPlanState>()(
  persist(
    (set, get) => ({
      ...initialState,

      fetchActivePlan: async (certificationId?: number) => {
        const certId =
          certificationId ?? useCertificationStore.getState().selectedCertificationId ?? undefined;

        set({ isLoading: true, error: null });

        try {
          // API returns null for 404 (no active plan) - this is expected, not an error
          const result = await studyPlanApi.getActive(certId);
          set({ activePlan: result, isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch active plan';
          Sentry.captureException(error, {
            extra: { certificationId: certId },
          });
          set({ error: message, isLoading: false, activePlan: null });
          throw error;
        }
      },

      createPlan: async (request: CreateStudyPlanRequest) => {
        return Sentry.startSpan(
          {
            op: 'ui.action',
            name: 'Create Study Plan',
          },
          async (span) => {
            const certId =
              request.certificationId ??
              useCertificationStore.getState().selectedCertificationId ??
              undefined;
            span.setAttribute('certification_id', certId || 0);
            span.setAttribute('target_exam_date', request.targetExamDate);

            set({ isLoading: true, error: null });

            try {
              const result = await studyPlanApi.create({
                ...request,
                certificationId: certId,
              });
              span.setAttribute('plan_id', result.plan.id);
              span.setAttribute('total_days', result.progress.totalDays);
              span.setAttribute('total_tasks', result.progress.totalTasks);
              set({ activePlan: result, isLoading: false });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Failed to create study plan';
              Sentry.captureException(error, {
                extra: { request },
              });
              set({ error: message, isLoading: false });
              throw error;
            }
          }
        );
      },

      completeTask: async (taskId: number, notes?: string) => {
        const { activePlan } = get();
        if (!activePlan) {
          throw new Error('No active plan');
        }

        return Sentry.startSpan(
          {
            op: 'ui.action',
            name: 'Complete Study Plan Task',
          },
          async (span) => {
            span.setAttribute('plan_id', activePlan.plan.id);
            span.setAttribute('task_id', taskId);

            // Optimistic update - mark task as completed locally
            const updatedPlan = { ...activePlan };
            let taskFound = false;

            for (const day of updatedPlan.plan.days) {
              const task = day.tasks.find((t) => t.id === taskId);
              if (task) {
                task.completedAt = new Date().toISOString();
                taskFound = true;
                break;
              }
            }

            // Update today's tasks as well
            const todayTask = updatedPlan.todaysTasks.find((t) => t.id === taskId);
            if (todayTask) {
              todayTask.completedAt = new Date().toISOString();
            }

            // Update progress optimistically
            updatedPlan.progress = {
              ...updatedPlan.progress,
              completedTasks: updatedPlan.progress.completedTasks + 1,
              percentComplete: Math.round(
                ((updatedPlan.progress.completedTasks + 1) / updatedPlan.progress.totalTasks) * 100
              ),
            };

            if (taskFound) {
              set({ activePlan: updatedPlan });
            }

            try {
              const result = await studyPlanApi.completeTask(activePlan.plan.id, taskId, { notes });
              span.setAttribute('day_complete', result.dayComplete);

              // If day is complete, update the day's isComplete flag
              if (result.dayComplete) {
                const planAfterUpdate = get().activePlan;
                if (planAfterUpdate) {
                  const day = planAfterUpdate.plan.days.find((d) =>
                    d.tasks.some((t) => t.id === taskId)
                  );
                  if (day) {
                    day.isComplete = true;
                    planAfterUpdate.progress.completedDays += 1;
                    set({ activePlan: { ...planAfterUpdate } });
                  }
                }
              }

              return result;
            } catch (error) {
              // Revert optimistic update on failure
              set({ activePlan });
              Sentry.captureException(error, {
                extra: { planId: activePlan.plan.id, taskId },
              });
              throw error;
            }
          }
        );
      },

      abandonPlan: async () => {
        const { activePlan } = get();
        if (!activePlan) {
          return;
        }

        return Sentry.startSpan(
          {
            op: 'ui.action',
            name: 'Abandon Study Plan',
          },
          async (span) => {
            span.setAttribute('plan_id', activePlan.plan.id);

            set({ isLoading: true, error: null });

            try {
              await studyPlanApi.abandon(activePlan.plan.id);
              set({ activePlan: null, isLoading: false });
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Failed to abandon plan';
              Sentry.captureException(error, {
                extra: { planId: activePlan.plan.id },
              });
              set({ error: message, isLoading: false });
              throw error;
            }
          }
        );
      },

      regeneratePlan: async (keepCompletedTasks = true) => {
        const { activePlan } = get();
        if (!activePlan) {
          throw new Error('No active plan to regenerate');
        }

        return Sentry.startSpan(
          {
            op: 'ui.action',
            name: 'Regenerate Study Plan',
          },
          async (span) => {
            span.setAttribute('plan_id', activePlan.plan.id);
            span.setAttribute('keep_completed_tasks', keepCompletedTasks);

            set({ isLoading: true, error: null });

            try {
              const result = await studyPlanApi.regenerate(activePlan.plan.id, {
                keepCompletedTasks,
              });
              span.setAttribute('tasks_removed', result.tasksRemoved);
              span.setAttribute('tasks_generated', result.tasksGenerated);

              // Refresh the full plan to get updated progress
              const updatedPlan = await studyPlanApi.get(activePlan.plan.id);
              set({ activePlan: updatedPlan, isLoading: false });
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Failed to regenerate plan';
              Sentry.captureException(error, {
                extra: { planId: activePlan.plan.id, keepCompletedTasks },
              });
              set({ error: message, isLoading: false });
              throw error;
            }
          }
        );
      },

      clearError: () => set({ error: null }),

      reset: () => set(initialState),

      getActivePlanId: () => {
        const { activePlan } = get();
        return activePlan?.plan.id ?? null;
      },

      getTodaysTasks: () => {
        const { activePlan } = get();
        return activePlan?.todaysTasks ?? [];
      },
    }),
    {
      name: 'ace-study-plan-store',
      partialize: (state) => ({
        // Only persist the active plan ID for rehydration
        // Full data will be fetched fresh on load
        activePlanId: state.activePlan?.plan.id ?? null,
      }),
      onRehydrateStorage: () => () => {
        // Note: We don't auto-fetch here because the component should handle
        // fetching when it mounts to ensure fresh data
      },
    }
  )
);
