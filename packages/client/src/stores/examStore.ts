import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as Sentry from '@sentry/react';
import { examApi } from '../api/client';
import { showStreakMilestoneToast } from '../utils/streakNotifications';
import { showAchievementUnlockToasts } from '../utils/achievementNotifications';
import { queryClient } from '../lib/queryClient';
import type {
  CaseStudy,
  XPAwardResponse,
  QuestionWithDomain,
  OfflineExamSubmission,
} from '@ace-prep/shared';
import {
  saveOfflineExam,
  getOfflineExam,
  deleteOfflineExam,
  getInProgressOfflineExams,
  queueForSync,
  type OfflineExamState,
} from '../services/offlineDb';
import { getCachedQuestions } from '../services/cacheService';

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
  // Offline exam state
  isOfflineExam: boolean;
  offlineExamId: string | null; // Client-generated UUID for offline exams

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

  // Offline exam actions
  createOfflineExam: (
    certificationId: number,
    questionCount?: number
  ) => Promise<{ success: boolean; error?: string }>;
  submitOfflineExam: () => Promise<{ success: boolean; queuedForSync: boolean; error?: string }>;
  resumeOfflineExam: (offlineExamId: string) => Promise<boolean>;
  abandonOfflineExam: () => Promise<void>;
  getInProgressOfflineExam: () => Promise<OfflineExamState | null>;

  // Getters
  getCurrentQuestion: () => ExamQuestion | null;
  getResponse: (questionId: number) => ExamResponse | undefined;
  getProgress: () => { answered: number; flagged: number; total: number };
}

const EXAM_DURATION = 2 * 60 * 60; // 2 hours in seconds
const DEFAULT_OFFLINE_QUESTION_COUNT = 50;

// Generate a unique ID for offline exams
function generateOfflineExamId(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Convert QuestionWithDomain to ExamQuestion format
function mapToExamQuestion(q: QuestionWithDomain): ExamQuestion {
  return {
    id: q.id,
    questionText: q.questionText,
    questionType: q.questionType,
    options: q.options,
    correctAnswers: q.correctAnswers,
    explanation: q.explanation,
    difficulty: q.difficulty,
    domain: { id: q.domain.id, name: q.domain.name, code: q.domain.code },
    topic: { id: q.topic.id, name: q.topic.name },
    caseStudy: q.caseStudy,
  };
}

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
      isOfflineExam: false,
      offlineExamId: null,

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
        const { questions, isOfflineExam, offlineExamId } = get();
        if (index >= 0 && index < questions.length) {
          set({ currentQuestionIndex: index });

          // Persist to IndexedDB for offline exams
          if (isOfflineExam && offlineExamId) {
            getOfflineExam(offlineExamId).then((exam) => {
              if (exam) {
                exam.currentQuestionIndex = index;
                saveOfflineExam(exam).catch(console.error);
              }
            });
          }
        }
      },

      answerQuestion: (questionId, selectedAnswers) => {
        Sentry.startSpan(
          {
            op: 'ui.action',
            name: 'Submit Answer',
          },
          (span) => {
            const { responses, questions, examId, isOfflineExam, offlineExamId } = get();
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

            // Persist to IndexedDB for offline exams
            if (isOfflineExam && offlineExamId) {
              getOfflineExam(offlineExamId).then((exam) => {
                if (exam) {
                  exam.responses.set(questionId, selectedAnswers);
                  saveOfflineExam(exam).catch(console.error);
                }
              });
            }
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
          isOfflineExam: false,
          offlineExamId: null,
        });
      },

      abandonExam: async () => {
        const { examId, isOfflineExam, offlineExamId } = get();

        if (isOfflineExam && offlineExamId) {
          // For offline exams, delete from IndexedDB
          try {
            await deleteOfflineExam(offlineExamId);
          } catch (error) {
            console.error('Failed to delete offline exam:', error);
          }
        } else if (examId) {
          // Mark exam as abandoned in DB using API client
          try {
            await examApi.abandon(examId);
          } catch (error) {
            // Log but continue - still clear local state even if API fails
            // This prevents orphaned UI state while accepting the server may have stale data
            console.error('Failed to abandon exam on server:', error);
          }
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
          isOfflineExam: false,
          offlineExamId: null,
        });
      },

      hasIncompleteExam: () => {
        const { examId, offlineExamId, questions, timeRemaining } = get();
        return (
          (examId !== null || offlineExamId !== null) && questions.length > 0 && timeRemaining > 0
        );
      },

      // ============ OFFLINE EXAM METHODS ============

      createOfflineExam: async (
        certificationId,
        questionCount = DEFAULT_OFFLINE_QUESTION_COUNT
      ) => {
        const { logger } = Sentry;

        return Sentry.startSpan(
          {
            op: 'ui.action',
            name: 'Create Offline Exam',
          },
          async (span) => {
            span.setAttribute('certification.id', certificationId);
            span.setAttribute('question_count', questionCount);

            try {
              // Fetch questions from local cache
              const cachedQuestions = await getCachedQuestions(certificationId, {
                limit: questionCount,
              });

              if (cachedQuestions.length === 0) {
                logger.warn('No cached questions available for offline exam', { certificationId });
                return {
                  success: false,
                  error: 'No cached questions available. Please download questions while online.',
                };
              }

              if (cachedQuestions.length < questionCount) {
                logger.warn('Not enough cached questions', {
                  certificationId,
                  requested: questionCount,
                  available: cachedQuestions.length,
                });
              }

              // Shuffle questions for variety
              const shuffled = [...cachedQuestions].sort(() => Math.random() - 0.5);
              const selectedQuestions = shuffled.slice(0, questionCount);

              // Generate offline exam ID
              const offlineExamId = generateOfflineExamId();

              // Create responses map
              const responses = new Map<number, ExamResponse>();
              selectedQuestions.forEach((q) => {
                responses.set(q.id, {
                  questionId: q.id,
                  selectedAnswers: [],
                  isCorrect: null,
                  flagged: false,
                  timeSpentSeconds: 0,
                });
              });

              // Convert to ExamQuestion format
              const examQuestions = selectedQuestions.map(mapToExamQuestion);

              const now = Date.now();

              // Save to IndexedDB for persistence
              const offlineExamState: OfflineExamState = {
                id: offlineExamId,
                certificationId,
                questionIds: selectedQuestions.map((q) => q.id),
                currentQuestionIndex: 0,
                responses: new Map(),
                timeSpentSeconds: 0,
                startedAt: new Date(now).toISOString(),
                lastUpdatedAt: new Date(now).toISOString(),
                status: 'in_progress',
              };

              await saveOfflineExam(offlineExamState);

              // Update store state
              set({
                examId: null, // No server exam ID for offline exams
                offlineExamId,
                questions: examQuestions,
                responses,
                currentQuestionIndex: 0,
                startTime: now,
                timeRemaining: EXAM_DURATION,
                isSubmitting: false,
                isOfflineExam: true,
              });

              span.setAttribute('offline_exam.id', offlineExamId);
              span.setAttribute('offline_exam.question_count', selectedQuestions.length);

              logger.info('Offline exam created', {
                offlineExamId,
                questionCount: selectedQuestions.length,
              });

              Sentry.addBreadcrumb({
                category: 'offline-exam',
                message: `Created offline exam with ${selectedQuestions.length} questions`,
                level: 'info',
                data: { offlineExamId, certificationId },
              });

              return { success: true };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              logger.error('Failed to create offline exam', {
                error: errorMessage,
                certificationId,
              });
              Sentry.captureException(error, {
                extra: { certificationId, questionCount, context: 'create_offline_exam' },
              });
              return { success: false, error: errorMessage };
            }
          }
        );
      },

      submitOfflineExam: async () => {
        const { offlineExamId, startTime, responses, questions, isOfflineExam } = get();
        const { logger } = Sentry;

        if (!isOfflineExam || !offlineExamId || !startTime) {
          return { success: false, queuedForSync: false, error: 'No offline exam in progress' };
        }

        set({ isSubmitting: true });

        return Sentry.startSpan(
          {
            op: 'ui.action',
            name: 'Submit Offline Exam',
          },
          async (span) => {
            try {
              const totalTimeSeconds = Math.floor((Date.now() - startTime) / 1000);
              span.setAttribute('offline_exam.id', offlineExamId);
              span.setAttribute('offline_exam.total_time_seconds', totalTimeSeconds);

              // Get the offline exam from IndexedDB to get certification ID
              const offlineExam = await getOfflineExam(offlineExamId);
              if (!offlineExam) {
                return {
                  success: false,
                  queuedForSync: false,
                  error: 'Offline exam not found in storage',
                };
              }

              // Prepare submission payload
              const responsesArray = Array.from(responses.values());
              const submission: OfflineExamSubmission = {
                offlineExamId,
                certificationId: offlineExam.certificationId,
                questions: responsesArray.map((r) => ({
                  questionId: r.questionId,
                  selectedAnswers: r.selectedAnswers,
                  isCorrect: r.isCorrect === true,
                  flagged: r.flagged,
                  timeSpentSeconds: r.timeSpentSeconds,
                })),
                totalTimeSeconds,
                startedAt: new Date(startTime).toISOString(),
                completedAt: new Date().toISOString(),
                isOffline: true,
                clientTimestamp: new Date().toISOString(),
              };

              // Queue for background sync
              await queueForSync(
                'exam_submission',
                submission as unknown as Record<string, unknown>
              );

              // Mark offline exam as completed in IndexedDB
              // Convert responses Map to the format expected by OfflineExamState
              const offlineResponses = new Map<number, number[]>();
              responses.forEach((r, questionId) => {
                offlineResponses.set(questionId, r.selectedAnswers);
              });
              offlineExam.status = 'completed';
              offlineExam.timeSpentSeconds = totalTimeSeconds;
              offlineExam.responses = offlineResponses;
              await saveOfflineExam(offlineExam);

              // Calculate local results for immediate feedback
              const correctCount = responsesArray.filter((r) => r.isCorrect === true).length;
              const score = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;

              span.setAttribute('offline_exam.correct_count', correctCount);
              span.setAttribute('offline_exam.score', score);

              logger.info('Offline exam submitted and queued for sync', {
                offlineExamId,
                correctCount,
                totalQuestions: questions.length,
                score,
              });

              Sentry.addBreadcrumb({
                category: 'offline-exam',
                message: `Offline exam queued for sync: ${correctCount}/${questions.length} correct`,
                level: 'info',
                data: { offlineExamId, score },
              });

              // Reset exam state
              set({
                examId: null,
                offlineExamId: null,
                currentQuestionIndex: 0,
                questions: [],
                responses: new Map(),
                startTime: null,
                timeRemaining: EXAM_DURATION,
                isSubmitting: false,
                isOfflineExam: false,
              });

              return { success: true, queuedForSync: true };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              logger.error('Failed to submit offline exam', { error: errorMessage, offlineExamId });
              Sentry.captureException(error, {
                extra: { offlineExamId, context: 'submit_offline_exam' },
              });
              set({ isSubmitting: false });
              return { success: false, queuedForSync: false, error: errorMessage };
            }
          }
        );
      },

      resumeOfflineExam: async (offlineExamId) => {
        const { logger } = Sentry;

        try {
          const offlineExam = await getOfflineExam(offlineExamId);
          if (!offlineExam || offlineExam.status !== 'in_progress') {
            return false;
          }

          // Fetch the actual questions from cache to restore full question data
          const cachedQuestions = await getCachedQuestions(offlineExam.certificationId, {
            limit: 200, // Get all cached questions
          });

          // Filter to only the questions in this exam
          const examQuestionIds = new Set(offlineExam.questionIds);
          const examQuestionsRaw = cachedQuestions.filter((q) => examQuestionIds.has(q.id));

          // Maintain original order
          const questionsMap = new Map(examQuestionsRaw.map((q) => [q.id, q]));
          const orderedQuestions = offlineExam.questionIds
            .map((id) => questionsMap.get(id))
            .filter((q): q is QuestionWithDomain => q !== undefined);

          if (orderedQuestions.length === 0) {
            logger.warn('Could not restore offline exam questions', { offlineExamId });
            return false;
          }

          // Convert to ExamQuestion format
          const examQuestions = orderedQuestions.map(mapToExamQuestion);

          // Restore responses
          const responses = new Map<number, ExamResponse>();
          examQuestions.forEach((q) => {
            const savedResponse = offlineExam.responses.get(q.id);
            responses.set(q.id, {
              questionId: q.id,
              selectedAnswers: savedResponse || [],
              isCorrect: null, // Will be calculated on answer
              flagged: false,
              timeSpentSeconds: 0,
            });
          });

          // Calculate remaining time
          const startedAtTime = new Date(offlineExam.startedAt).getTime();
          const elapsedSeconds = Math.floor((Date.now() - startedAtTime) / 1000);
          const remainingTime = Math.max(0, EXAM_DURATION - elapsedSeconds);

          set({
            examId: null,
            offlineExamId: offlineExam.id,
            questions: examQuestions,
            responses,
            currentQuestionIndex: offlineExam.currentQuestionIndex,
            startTime: startedAtTime,
            timeRemaining: remainingTime,
            isSubmitting: false,
            isOfflineExam: true,
          });

          logger.info('Offline exam resumed', {
            offlineExamId,
            questionCount: examQuestions.length,
          });

          return true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Failed to resume offline exam', { error: errorMessage, offlineExamId });
          Sentry.captureException(error, {
            extra: { offlineExamId, context: 'resume_offline_exam' },
          });
          return false;
        }
      },

      abandonOfflineExam: async () => {
        const { offlineExamId } = get();
        if (!offlineExamId) return;

        try {
          await deleteOfflineExam(offlineExamId);
        } catch (error) {
          console.error('Failed to delete offline exam:', error);
        }

        set({
          examId: null,
          offlineExamId: null,
          currentQuestionIndex: 0,
          questions: [],
          responses: new Map(),
          startTime: null,
          timeRemaining: EXAM_DURATION,
          isSubmitting: false,
          isOfflineExam: false,
        });
      },

      getInProgressOfflineExam: async () => {
        const exams = await getInProgressOfflineExams();
        return exams.length > 0 ? exams[0] : null;
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
        isOfflineExam: state.isOfflineExam,
        offlineExamId: state.offlineExamId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.responses)) {
          state.responses = new Map(state.responses as any);
        }
      },
    }
  )
);
