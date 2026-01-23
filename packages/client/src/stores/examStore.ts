import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as Sentry from '@sentry/react';
import { examApi } from '../api/client';
import { showStreakMilestoneToast } from '../utils/streakNotifications';
import { showAchievementUnlockToasts } from '../utils/achievementNotifications';
import { queryClient } from '../lib/queryClient';
import type { CaseStudy, XPAwardResponse } from '@ace-prep/shared';

interface ExamQuestion {
  id: number;
  questionText: string;
  questionType: 'single' | 'multiple';
  options: string[];
  correctAnswers: number[];
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  domain: { id: number; name: string; code: string };
  topic: { id: number; name: string };
  caseStudy?: CaseStudy;
}

interface ExamResponse {
  questionId: number;
  selectedAnswers: number[];
  isCorrect: boolean | null;
  flagged: boolean;
  timeSpentSeconds: number;
}

interface ExamState {
  examId: number | null;
  currentQuestionIndex: number;
  questions: ExamQuestion[];
  responses: Map<number, ExamResponse>;
  startTime: number | null;
  timeRemaining: number; // seconds
  isSubmitting: boolean;

  // Actions
  startExam: (examId: number, questions: ExamQuestion[]) => void;
  setCurrentQuestion: (index: number) => void;
  answerQuestion: (questionId: number, selectedAnswers: number[]) => void;
  toggleFlag: (questionId: number) => void;
  updateTimeRemaining: (seconds: number) => void;
  submitExam: () => Promise<{ xpUpdate?: XPAwardResponse } | undefined>;
  resetExam: () => void;
  abandonExam: () => Promise<void>;
  hasIncompleteExam: () => boolean;

  // Getters
  getCurrentQuestion: () => ExamQuestion | null;
  getResponse: (questionId: number) => ExamResponse | undefined;
  getProgress: () => { answered: number; flagged: number; total: number };
}

const EXAM_DURATION = 2 * 60 * 60; // 2 hours in seconds

export const useExamStore = create<ExamState>()(
  persist(
    (set, get) => ({
      examId: null,
      currentQuestionIndex: 0,
      questions: [],
      responses: new Map(),
      startTime: null,
      timeRemaining: EXAM_DURATION,
      isSubmitting: false,

      startExam: (examId, questions) => {
        Sentry.startSpan(
          {
            op: 'ui.action',
            name: 'Start Exam',
          },
          (span) => {
            span.setAttribute('exam.id', examId);
            span.setAttribute('exam.question_count', questions.length);

            const responses = new Map<number, ExamResponse>();
            questions.forEach((q) => {
              responses.set(q.id, {
                questionId: q.id,
                selectedAnswers: [],
                isCorrect: null,
                flagged: false,
                timeSpentSeconds: 0,
              });
            });

            set({
              examId,
              questions,
              responses,
              currentQuestionIndex: 0,
              startTime: Date.now(),
              timeRemaining: EXAM_DURATION,
              isSubmitting: false,
            });
          }
        );
      },

      setCurrentQuestion: (index) => {
        const { questions } = get();
        if (index >= 0 && index < questions.length) {
          set({ currentQuestionIndex: index });
        }
      },

      answerQuestion: (questionId, selectedAnswers) => {
        Sentry.startSpan(
          {
            op: 'ui.action',
            name: 'Submit Answer',
          },
          (span) => {
            const { responses, questions, examId } = get();
            const question = questions.find((q) => q.id === questionId);
            if (!question) return;

            span.setAttribute('exam.id', examId || 0);
            span.setAttribute('question.id', questionId);
            span.setAttribute('question.type', question.questionType);
            span.setAttribute('question.difficulty', question.difficulty);
            span.setAttribute('question.domain', question.domain.name);
            span.setAttribute('question.topic', question.topic.name);

            const newResponses = new Map(responses);
            const existing = newResponses.get(questionId);

            // Check if answer is correct
            const isCorrect =
              selectedAnswers.length === question.correctAnswers.length &&
              selectedAnswers.every((a) => question.correctAnswers.includes(a)) &&
              question.correctAnswers.every((a) => selectedAnswers.includes(a));

            span.setAttribute('answer.is_correct', isCorrect);
            span.setAttribute('answer.selected_count', selectedAnswers.length);

            newResponses.set(questionId, {
              ...existing!,
              selectedAnswers,
              isCorrect,
            });

            set({ responses: newResponses });
          }
        );
      },

      toggleFlag: (questionId) => {
        const { responses } = get();
        const newResponses = new Map(responses);
        const existing = newResponses.get(questionId);
        if (existing) {
          newResponses.set(questionId, {
            ...existing,
            flagged: !existing.flagged,
          });
          set({ responses: newResponses });
        }
      },

      updateTimeRemaining: (seconds) => {
        set({ timeRemaining: seconds });
      },

      submitExam: async () => {
        const { examId, startTime, responses, questions } = get();
        if (!examId || !startTime) return undefined;

        set({ isSubmitting: true });

        return await Sentry.startSpan(
          {
            op: 'ui.action',
            name: 'Complete Exam',
          },
          async (span) => {
            try {
              const totalTimeSeconds = Math.floor((Date.now() - startTime) / 1000);
              span.setAttribute('exam.id', examId);
              span.setAttribute('exam.total_time_seconds', totalTimeSeconds);
              span.setAttribute('exam.question_count', questions.length);

              // Calculate score from responses
              const responsesArray = Array.from(responses.values());
              const answeredCount = responsesArray.filter(
                (r) => r.selectedAnswers.length > 0
              ).length;
              const correctCount = responsesArray.filter((r) => r.isCorrect === true).length;

              span.setAttribute('exam.answered_count', answeredCount);
              span.setAttribute('exam.correct_count', correctCount);
              span.setAttribute(
                'exam.score_percentage',
                answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0
              );

              // Submit all answers in one batch request (performance optimization)
              const answeredResponses = responsesArray.filter((r) => r.selectedAnswers.length > 0);
              if (answeredResponses.length > 0) {
                await examApi.submitBatch(
                  examId,
                  answeredResponses.map((r) => ({
                    questionId: r.questionId,
                    selectedAnswers: r.selectedAnswers,
                    timeSpentSeconds: r.timeSpentSeconds,
                    flagged: r.flagged,
                  }))
                );
              }

              // Complete the exam using client
              const result = await examApi.complete(examId, totalTimeSeconds);

              // Show milestone toast if applicable
              showStreakMilestoneToast(result.streakUpdate);
              showAchievementUnlockToasts(result.achievementsUnlocked);

              // Invalidate streak query to refresh displays
              queryClient.invalidateQueries({ queryKey: ['streak'] });

              // Return xpUpdate for level-up modal handling
              return { xpUpdate: result.xpUpdate };
            } finally {
              set({ isSubmitting: false });
            }
          }
        );
      },

      resetExam: () => {
        set({
          examId: null,
          currentQuestionIndex: 0,
          questions: [],
          responses: new Map(),
          startTime: null,
          timeRemaining: EXAM_DURATION,
          isSubmitting: false,
        });
      },

      abandonExam: async () => {
        const { examId } = get();
        if (!examId) return;

        // Mark exam as abandoned in DB using API client
        try {
          await examApi.abandon(examId);
        } catch (error) {
          // Log but continue - still clear local state even if API fails
          // This prevents orphaned UI state while accepting the server may have stale data
          console.error('Failed to abandon exam on server:', error);
        }

        // Clear local state regardless of API success
        set({
          examId: null,
          currentQuestionIndex: 0,
          questions: [],
          responses: new Map(),
          startTime: null,
          timeRemaining: EXAM_DURATION,
          isSubmitting: false,
        });
      },

      hasIncompleteExam: () => {
        const { examId, questions, timeRemaining } = get();
        return examId !== null && questions.length > 0 && timeRemaining > 0;
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
        let flagged = 0;

        responses.forEach((r) => {
          if (r.selectedAnswers.length > 0) answered++;
          if (r.flagged) flagged++;
        });

        return { answered, flagged, total: questions.length };
      },
    }),
    {
      name: 'ace-exam-store',
      partialize: (state) => ({
        examId: state.examId,
        questions: state.questions,
        responses: Array.from(state.responses.entries()),
        currentQuestionIndex: state.currentQuestionIndex,
        startTime: state.startTime,
        timeRemaining: state.timeRemaining,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.responses)) {
          state.responses = new Map(state.responses as any);
        }
      },
    }
  )
);
