import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as Sentry from '@sentry/react';
import { workbookApi } from '../api/client';
import { showStreakMilestoneToast } from '../utils/streakNotifications';
import { showAchievementUnlockToasts } from '../utils/achievementNotifications';
import { queryClient } from '../lib/queryClient';
import type { WorkbookMasteryLevel, WorkbookQuestion } from '@ace-prep/shared';

type WorkbookMode = 'guided' | 'quick' | 'full';

/** Assessment questions have answers/explanation withheld until reveal */
type WorkbookAssessmentQuestion = Omit<WorkbookQuestion, 'correctAnswers' | 'explanation'>;

interface WorkbookResponse {
  questionId: number;
  selectedAnswers: number[];
  isCorrect: boolean | null;
  timeSpentSeconds: number;
}

interface WorkbookState {
  // Mode
  mode: WorkbookMode;

  // Guided study state
  currentQuestionIndex: number;
  isRevealed: boolean;

  // Assessment state
  assessmentQuestions: WorkbookAssessmentQuestion[];
  assessmentResponses: Map<number, WorkbookResponse>;
  assessmentStartTime: number | null;
  questionStartTime: number | null;
  timeLimit: number | null;

  // UI state
  isLoading: boolean;
  showSummary: boolean;

  // Actions
  setMode: (mode: WorkbookMode) => void;
  startGuidedStudy: () => void;
  startAssessment: (
    type: 'quick' | 'full',
    count?: number,
    certificationId?: number
  ) => Promise<void>;
  answerQuestion: (questionId: number, selectedAnswers: number[]) => void;
  revealAnswer: (questionId: number) => Promise<{
    isCorrect: boolean;
    correctAnswers: number[];
    explanation: string;
    masteryLevel: WorkbookMasteryLevel;
  }>;
  nextQuestion: () => void;
  previousQuestion: () => void;
  goToQuestion: (index: number) => void;
  completeAssessment: () => Promise<{
    score: number;
    correctCount: number;
    totalCount: number;
  }>;
  resetStore: () => void;

  // Getters
  getCurrentQuestion: () => WorkbookAssessmentQuestion | null;
  getResponse: (questionId: number) => WorkbookResponse | undefined;
  getTimeRemaining: () => number | null;
}

const initialState = {
  mode: 'guided' as WorkbookMode,
  currentQuestionIndex: 0,
  isRevealed: false,
  assessmentQuestions: [] as WorkbookAssessmentQuestion[],
  assessmentResponses: new Map<number, WorkbookResponse>(),
  assessmentStartTime: null as number | null,
  questionStartTime: null as number | null,
  timeLimit: null as number | null,
  isLoading: false,
  showSummary: false,
};

export const useWorkbookStore = create<WorkbookState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setMode: (mode) => set({ mode }),

      startGuidedStudy: () => {
        set({
          mode: 'guided',
          currentQuestionIndex: 0,
          isRevealed: false,
          showSummary: false,
          questionStartTime: Date.now(),
        });
      },

      startAssessment: async (type, count = 15, certificationId?) => {
        set({ isLoading: true });

        try {
          const result = await workbookApi.getAssessment(count, type, certificationId);

          const responses = new Map<number, WorkbookResponse>();
          result.questions.forEach((q) => {
            responses.set(q.id, {
              questionId: q.id,
              selectedAnswers: [],
              isCorrect: null,
              timeSpentSeconds: 0,
            });
          });

          set({
            mode: type,
            assessmentQuestions: result.questions,
            assessmentResponses: responses,
            assessmentStartTime: Date.now(),
            questionStartTime: Date.now(),
            timeLimit: result.timeLimit,
            currentQuestionIndex: 0,
            isRevealed: false,
            showSummary: false,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          Sentry.captureException(error);
          throw error;
        }
      },

      answerQuestion: (questionId, selectedAnswers) => {
        const { assessmentResponses, questionStartTime } = get();
        const timeSpent = questionStartTime
          ? Math.floor((Date.now() - questionStartTime) / 1000)
          : 0;

        const newResponses = new Map(assessmentResponses);
        newResponses.set(questionId, {
          questionId,
          selectedAnswers,
          isCorrect: null,
          timeSpentSeconds: timeSpent,
        });

        set({ assessmentResponses: newResponses });
      },

      revealAnswer: async (questionId) => {
        const { assessmentResponses, questionStartTime } = get();
        const response = assessmentResponses.get(questionId);

        if (!response) {
          throw new Error('No response found');
        }

        const timeSpent = questionStartTime
          ? Math.floor((Date.now() - questionStartTime) / 1000)
          : 0;

        const result = await workbookApi.submitAnswer(questionId, response.selectedAnswers);

        // Update response with result
        const newResponses = new Map(assessmentResponses);
        newResponses.set(questionId, {
          ...response,
          isCorrect: result.isCorrect,
          timeSpentSeconds: timeSpent,
        });

        set({
          assessmentResponses: newResponses,
          isRevealed: true,
        });

        // Handle streak/achievements
        if (result.streakUpdate) {
          showStreakMilestoneToast(result.streakUpdate);
          queryClient.invalidateQueries({ queryKey: ['streak'] });
        }
        if (result.achievementsUnlocked?.length) {
          showAchievementUnlockToasts(result.achievementsUnlocked);
        }

        // Invalidate workbook progress
        queryClient.invalidateQueries({ queryKey: ['workbookProgress'] });

        return result;
      },

      nextQuestion: () => {
        const { currentQuestionIndex, assessmentQuestions, mode } = get();
        const maxIndex = assessmentQuestions.length - 1;

        if (currentQuestionIndex < maxIndex) {
          set({
            currentQuestionIndex: currentQuestionIndex + 1,
            isRevealed: mode !== 'guided', // In guided mode, always start unrevealed
            questionStartTime: Date.now(),
          });
        } else {
          set({ showSummary: true });
        }
      },

      previousQuestion: () => {
        const { currentQuestionIndex } = get();
        if (currentQuestionIndex > 0) {
          set({
            currentQuestionIndex: currentQuestionIndex - 1,
            isRevealed: true,
            questionStartTime: Date.now(),
          });
        }
      },

      goToQuestion: (index) => {
        const { assessmentQuestions, mode } = get();
        const maxIndex = assessmentQuestions.length - 1;
        const clampedIndex = Math.max(0, Math.min(index, maxIndex));

        set({
          currentQuestionIndex: clampedIndex,
          isRevealed: mode !== 'guided',
          questionStartTime: Date.now(),
        });
      },

      completeAssessment: async () => {
        const { assessmentResponses, assessmentStartTime, mode } = get();

        const totalTimeSeconds = assessmentStartTime
          ? Math.floor((Date.now() - assessmentStartTime) / 1000)
          : 0;

        const responses = Array.from(assessmentResponses.values()).map((r) => ({
          questionId: r.questionId,
          selectedAnswers: r.selectedAnswers,
          timeSpentSeconds: r.timeSpentSeconds,
        }));

        const result = await workbookApi.completeAssessment({
          responses,
          totalTimeSeconds,
          assessmentType: mode === 'full' ? 'full' : 'quick',
        });

        // Handle streak/achievements
        if (result.streakUpdate) {
          showStreakMilestoneToast(result.streakUpdate);
          queryClient.invalidateQueries({ queryKey: ['streak'] });
        }
        if (result.achievementsUnlocked?.length) {
          showAchievementUnlockToasts(result.achievementsUnlocked);
        }

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['workbookProgress'] });

        set({ showSummary: true });

        return {
          score: result.score,
          correctCount: result.correctCount,
          totalCount: result.totalCount,
        };
      },

      resetStore: () => set(initialState),

      getCurrentQuestion: () => {
        const { assessmentQuestions, currentQuestionIndex } = get();
        return assessmentQuestions[currentQuestionIndex] || null;
      },

      getResponse: (questionId) => {
        return get().assessmentResponses.get(questionId);
      },

      getTimeRemaining: () => {
        const { assessmentStartTime, timeLimit } = get();
        if (!assessmentStartTime || !timeLimit) return null;

        const elapsed = Math.floor((Date.now() - assessmentStartTime) / 1000);
        return Math.max(0, timeLimit - elapsed);
      },
    }),
    {
      name: 'ace-workbook-store',
      partialize: (state) => ({
        mode: state.mode,
        // Only persist question index for guided mode; assessments start fresh
        currentQuestionIndex: state.mode === 'guided' ? state.currentQuestionIndex : 0,
      }),
    }
  )
);
