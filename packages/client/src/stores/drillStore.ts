import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { drillApi } from '../api/client';
import type {
  DrillMode,
  DrillQuestionCount,
  DrillTimeLimit,
  DrillQuestion,
  CompleteDrillResponse,
} from '@ace-prep/shared';

interface DrillResponse {
  questionId: number;
  selectedAnswers: number[];
  isCorrect: boolean | null;
  correctAnswers?: number[];
  explanation?: string;
  timeSpentSeconds: number;
  addedToSR: boolean;
}

interface DrillState {
  // Drill State
  drillId: number | null;
  mode: DrillMode | null;
  domainId: number | null;
  timeLimitSeconds: number;
  startedAt: number | null;

  // Questions & Responses
  currentQuestionIndex: number;
  questions: DrillQuestion[];
  responses: Map<number, DrillResponse>;

  // Timer
  timeRemaining: number;
  isActive: boolean;
  isCompleting: boolean; // Synchronous flag to prevent race conditions

  // UI State
  showFeedback: boolean;
  showSummary: boolean;
  isLoading: boolean;
  drillResults: CompleteDrillResponse | null;

  // Actions
  startDrill: (
    mode: DrillMode,
    domainId: number | null,
    questionCount: DrillQuestionCount,
    timeLimitSeconds: DrillTimeLimit
  ) => Promise<void>;
  answerQuestion: (questionId: number, selectedAnswers: number[]) => void;
  submitAnswer: () => Promise<{ isCorrect: boolean; explanation: string; addedToSR: boolean }>;
  nextQuestion: () => void;
  tick: () => void;
  completeDrill: (timedOut?: boolean) => Promise<CompleteDrillResponse>;
  abandonDrill: () => Promise<void>;
  reset: () => void;

  // Getters
  getCurrentQuestion: () => DrillQuestion | null;
  getResponse: (questionId: number) => DrillResponse | undefined;
  getProgress: () => { answered: number; correct: number; total: number };
}

const initialState = {
  drillId: null,
  mode: null,
  domainId: null,
  timeLimitSeconds: 60,
  startedAt: null,
  currentQuestionIndex: 0,
  questions: [],
  responses: new Map<number, DrillResponse>(),
  timeRemaining: 60,
  isActive: false,
  isCompleting: false,
  showFeedback: false,
  showSummary: false,
  isLoading: false,
  drillResults: null,
};

export const useDrillStore = create<DrillState>()(
  persist(
    (set, get) => ({
      ...initialState,

      startDrill: async (mode, domainId, questionCount, timeLimitSeconds) => {
        set({ isLoading: true });

        try {
          const result = await drillApi.start({
            mode,
            domainId: domainId ?? undefined,
            questionCount,
            timeLimitSeconds,
          });

          const responses = new Map<number, DrillResponse>();
          result.questions.forEach((q) => {
            responses.set(q.id, {
              questionId: q.id,
              selectedAnswers: [],
              isCorrect: null,
              timeSpentSeconds: 0,
              addedToSR: false,
            });
          });

          set({
            drillId: result.drillId,
            mode,
            domainId,
            timeLimitSeconds,
            questions: result.questions,
            responses,
            currentQuestionIndex: 0,
            startedAt: Date.now(),
            timeRemaining: timeLimitSeconds,
            isActive: true,
            showFeedback: false,
            showSummary: false,
            isLoading: false,
            drillResults: null,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      answerQuestion: (questionId, selectedAnswers) => {
        const { responses, questions, timeLimitSeconds, timeRemaining } = get();
        const question = questions.find((q) => q.id === questionId);
        if (!question) return;

        const newResponses = new Map(responses);
        const existing = newResponses.get(questionId);

        // Guard against undefined response (shouldn't happen, but prevents crash)
        if (!existing) return;

        // Calculate time spent on this question based on remaining time
        const timeSpent = timeLimitSeconds - timeRemaining;

        newResponses.set(questionId, {
          ...existing,
          selectedAnswers,
          timeSpentSeconds: timeSpent,
        });

        set({ responses: newResponses });
      },

      submitAnswer: async () => {
        const { drillId, questions, currentQuestionIndex, responses, startedAt, timeLimitSeconds, timeRemaining } = get();
        const question = questions[currentQuestionIndex];
        if (!question || !drillId) {
          throw new Error('No active question or drill');
        }

        const response = responses.get(question.id);
        if (!response) {
          throw new Error('No response found');
        }

        // Calculate time spent
        const timeSpent = timeLimitSeconds - timeRemaining;

        // Submit to server
        const result = await drillApi.submitAnswer(drillId, {
          questionId: question.id,
          selectedAnswers: response.selectedAnswers,
          timeSpentSeconds: timeSpent,
        });

        // Update local state with response
        const newResponses = new Map(responses);
        newResponses.set(question.id, {
          ...response,
          isCorrect: result.isCorrect,
          correctAnswers: result.correctAnswers,
          explanation: result.explanation,
          timeSpentSeconds: timeSpent,
          addedToSR: result.addedToSR,
        });

        set({
          responses: newResponses,
          showFeedback: true,
        });

        return result;
      },

      nextQuestion: () => {
        const { currentQuestionIndex, questions, isCompleting } = get();
        if (currentQuestionIndex < questions.length - 1) {
          set({
            currentQuestionIndex: currentQuestionIndex + 1,
            showFeedback: false,
          });
        } else if (!isCompleting) {
          // Last question - auto complete with error handling
          set({ isCompleting: true });
          get().completeDrill(false).catch((error) => {
            console.error('Failed to complete drill:', error);
            set({ isCompleting: false });
          });
        }
      },

      tick: () => {
        const { timeRemaining, isActive, showSummary, isCompleting } = get();
        // Guard against ticking when not active or already completing
        if (!isActive || showSummary || isCompleting) return;

        if (timeRemaining <= 1) {
          // Time's up - set state synchronously FIRST to prevent race
          set({ timeRemaining: 0, isActive: false, isCompleting: true });
          // Then trigger async completion with error handling
          get().completeDrill(true).catch((error) => {
            console.error('Failed to complete drill on timeout:', error);
            set({ isCompleting: false });
          });
        } else {
          set({ timeRemaining: timeRemaining - 1 });
        }
      },

      completeDrill: async (timedOut = false) => {
        const { drillId, startedAt, showSummary, drillResults, isLoading, isCompleting } = get();

        // Guard: prevent double completion
        if (showSummary || drillResults || isLoading) {
          if (!drillResults) {
            throw new Error('Drill completion already in progress');
          }
          return drillResults;
        }

        if (!drillId) {
          throw new Error('No active drill');
        }

        set({ isActive: false, isLoading: true, isCompleting: true });

        const totalTimeSeconds = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;

        try {
          const result = await drillApi.complete(drillId, {
            totalTimeSeconds,
            timedOut,
          });

          set({
            showSummary: true,
            drillResults: result,
            isLoading: false,
            isCompleting: false,
          });

          return result;
        } catch (error) {
          set({ isLoading: false, isCompleting: false });
          throw error;
        }
      },

      abandonDrill: async () => {
        const { drillId } = get();
        if (drillId) {
          await drillApi.abandon(drillId);
        }
        set(initialState);
      },

      reset: () => {
        set(initialState);
      },

      getCurrentQuestion: () => {
        const { questions, currentQuestionIndex } = get();
        return questions[currentQuestionIndex] || null;
      },

      getResponse: (questionId) => {
        return get().responses.get(questionId);
      },

      getProgress: () => {
        const { responses, questions } = get();
        let answered = 0;
        let correct = 0;

        responses.forEach((r) => {
          if (r.isCorrect !== null) {
            answered++;
            if (r.isCorrect) correct++;
          }
        });

        return { answered, correct, total: questions.length };
      },
    }),
    {
      name: 'ace-drill-store',
      partialize: (state) => ({
        drillId: state.drillId,
        mode: state.mode,
        domainId: state.domainId,
        timeLimitSeconds: state.timeLimitSeconds,
        questions: state.questions,
        responses: Array.from(state.responses.entries()),
        currentQuestionIndex: state.currentQuestionIndex,
        startedAt: state.startedAt,
        timeRemaining: state.timeRemaining,
        isActive: state.isActive,
        showFeedback: state.showFeedback,
      }),
      // Use merge to handle Map conversion atomically during hydration
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<DrillState> & { responses?: [number, DrillResponse][] };
        let responses: Map<number, DrillResponse>;

        try {
          // Safely convert array back to Map
          if (Array.isArray(persisted?.responses)) {
            responses = new Map(persisted.responses);
          } else {
            responses = new Map();
          }
        } catch {
          // If conversion fails, start fresh
          responses = new Map();
        }

        return {
          ...currentState,
          ...persisted,
          responses,
          // Ensure these are always proper defaults if not persisted
          showSummary: false,
          isLoading: false,
          drillResults: null,
        };
      },
    }
  )
);
