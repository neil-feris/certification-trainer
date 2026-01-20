import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { studyApi } from '../api/client';
import { getCachedQuestions } from '../services/offlineStorage';
import { queueResponse, type OfflineSessionContext } from '../services/syncQueue';
import type { Question } from '@ace-prep/shared';

interface StudyQuestion {
  id: number;
  questionText: string;
  questionType: 'single' | 'multiple';
  options: string[];
  // correctAnswers and explanation are NOT available until after answer submission
  // They are returned by the /sessions/:id/answer endpoint
  correctAnswers?: number[];
  explanation?: string;
  difficulty: string;
  gcpServices: string[];
  domain: { id: number; name: string; code: string };
  topic: { id: number; name: string };
}

interface StudyResponse {
  questionId: number;
  selectedAnswers: number[];
  isCorrect: boolean | null;
  timeSpentSeconds: number;
  addedToSR: boolean;
}

interface StudySessionState {
  // Session State
  sessionId: number | null;
  sessionType: 'topic_practice' | 'learning_path' | null;
  topicId: number | null;
  domainId: number | null;
  isOfflineMode: boolean;

  // Questions & Responses
  currentQuestionIndex: number;
  questions: StudyQuestion[];
  responses: Map<number, StudyResponse>;

  // Timing
  startTime: number | null;
  questionStartTime: number | null;

  // UI State
  isRevealed: boolean;
  showSummary: boolean;
  isLoading: boolean;
  needsRecovery: boolean;

  // Actions
  startSession: (
    type: 'topic_practice' | 'learning_path',
    topicId?: number,
    domainId?: number
  ) => Promise<void>;
  answerQuestion: (questionId: number, selectedAnswers: number[]) => void;
  revealAnswer: () => Promise<{ isCorrect: boolean; explanation: string; addedToSR: boolean }>;
  nextQuestion: () => void;
  previousQuestion: () => void;
  completeSession: () => Promise<{
    score: number;
    correctCount: number;
    totalCount: number;
    addedToSRCount: number;
  }>;
  abandonSession: () => Promise<void>;
  recoverSession: () => Promise<boolean>;
  setNeedsRecovery: (value: boolean) => void;
  resetSession: () => void;

  // Getters
  getCurrentQuestion: () => StudyQuestion | null;
  getResponse: (questionId: number) => StudyResponse | undefined;
  getProgress: () => { answered: number; correct: number; total: number };
}

const initialState = {
  sessionId: null,
  sessionType: null,
  topicId: null,
  domainId: null,
  isOfflineMode: false,
  currentQuestionIndex: 0,
  questions: [],
  responses: new Map(),
  startTime: null,
  questionStartTime: null,
  isRevealed: false,
  showSummary: false,
  isLoading: false,
  needsRecovery: false,
};

export const useStudyStore = create<StudySessionState>()(
  persist(
    (set, get) => ({
      ...initialState,

      startSession: async (type, topicId, domainId) => {
        set({ isLoading: true });

        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

        // If offline, try to use cached questions
        if (isOffline && topicId) {
          try {
            const cachedQuestions = await getCachedQuestions(topicId);
            if (cachedQuestions.length > 0) {
              // Take up to 10 questions for offline practice
              const questions = cachedQuestions.slice(0, 10).map((q: Question) => ({
                id: q.id,
                questionText: q.questionText,
                questionType: q.questionType,
                options: q.options,
                correctAnswers: q.correctAnswers,
                explanation: q.explanation,
                difficulty: q.difficulty,
                gcpServices: q.gcpServices,
                domain: { id: q.domainId, name: '', code: '' },
                topic: { id: q.topicId, name: '' },
              }));

              const responses = new Map<number, StudyResponse>();
              questions.forEach((q) => {
                responses.set(q.id, {
                  questionId: q.id,
                  selectedAnswers: [],
                  isCorrect: null,
                  timeSpentSeconds: 0,
                  addedToSR: false,
                });
              });

              // Generate unique negative ID using cryptographic randomness
              // Uses 40 bits of timestamp (~35 years) + 12 bits crypto random = 52 bits
              // Stays safely within Number.MAX_SAFE_INTEGER (53 bits)
              const timestamp = Date.now() & 0xffffffffff; // 40 bits
              const randomBits = crypto.getRandomValues(new Uint16Array(1))[0] & 0xfff; // 12 bits
              const offlineSessionId = -(timestamp * 0x1000 + randomBits);

              set({
                sessionId: offlineSessionId,
                sessionType: type,
                topicId: topicId || null,
                domainId: domainId || null,
                isOfflineMode: true,
                questions,
                responses,
                currentQuestionIndex: 0,
                startTime: Date.now(),
                questionStartTime: Date.now(),
                isRevealed: false,
                showSummary: false,
                isLoading: false,
                needsRecovery: false,
              });
              return;
            }
          } catch (error) {
            console.error('Failed to load cached questions:', error);
          }
          set({ isLoading: false });
          throw new Error('No cached questions available for offline practice');
        }

        try {
          const result = await studyApi.createSession({
            sessionType: type,
            topicId,
            domainId,
            questionCount: 10,
          });

          const responses = new Map<number, StudyResponse>();
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
            sessionId: result.sessionId,
            sessionType: type,
            topicId: topicId || null,
            domainId: domainId || null,
            isOfflineMode: false,
            questions: result.questions,
            responses,
            currentQuestionIndex: 0,
            startTime: Date.now(),
            questionStartTime: Date.now(),
            isRevealed: false,
            showSummary: false,
            isLoading: false,
            needsRecovery: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      answerQuestion: (questionId, selectedAnswers) => {
        const { responses, questions } = get();
        const question = questions.find((q) => q.id === questionId);
        if (!question) return;

        const newResponses = new Map(responses);
        const existing = newResponses.get(questionId);

        newResponses.set(questionId, {
          ...existing!,
          selectedAnswers,
        });

        set({ responses: newResponses });
      },

      revealAnswer: async () => {
        const {
          sessionId,
          questions,
          currentQuestionIndex,
          responses,
          questionStartTime,
          isOfflineMode,
        } = get();
        const question = questions[currentQuestionIndex];
        if (!question || !sessionId) {
          throw new Error('No active question or session');
        }

        const response = responses.get(question.id);
        if (!response) {
          throw new Error('No response found');
        }

        const timeSpent = questionStartTime
          ? Math.floor((Date.now() - questionStartTime) / 1000)
          : 0;

        // In offline mode, calculate correctness locally (we have the answers from cache)
        if (isOfflineMode) {
          const correctAnswers = question.correctAnswers || [];
          const selectedSet = new Set(response.selectedAnswers);
          const correctSet = new Set(correctAnswers);
          const isCorrect =
            selectedSet.size === correctSet.size &&
            response.selectedAnswers.every((a) => correctSet.has(a));

          const newResponses = new Map(responses);
          newResponses.set(question.id, {
            ...response,
            isCorrect,
            timeSpentSeconds: timeSpent,
            addedToSR: false, // Can't add to SR in offline mode
          });

          // Build offline session context for sync
          const {
            sessionType,
            topicId: storeTopicId,
            domainId: storeDomainId,
            questions: storeQuestions,
          } = get();
          const offlineContext: OfflineSessionContext | undefined = sessionType
            ? {
                sessionType,
                topicId: storeTopicId ?? undefined,
                domainId: storeDomainId ?? undefined,
                questionCount: storeQuestions.length,
              }
            : undefined;

          // Queue the response for sync when back online
          // Await to ensure it's saved before proceeding - throws on failure
          try {
            await queueResponse({
              sessionId: sessionId,
              questionId: question.id,
              selectedAnswers: response.selectedAnswers,
              timeSpentSeconds: timeSpent,
              offlineSessionContext: offlineContext,
              responseType: 'session',
            });
          } catch (err) {
            console.error('Failed to queue offline response:', err);
            throw new Error('Failed to save response for offline sync');
          }

          set({
            responses: newResponses,
            isRevealed: true,
          });

          return {
            isCorrect,
            correctAnswers,
            explanation: question.explanation || 'Explanation not available offline',
            addedToSR: false,
          };
        }

        // Submit to server
        const result = await studyApi.submitAnswer(sessionId, {
          questionId: question.id,
          selectedAnswers: response.selectedAnswers,
          timeSpentSeconds: timeSpent,
        });

        // Update local state with response
        const newResponses = new Map(responses);
        newResponses.set(question.id, {
          ...response,
          isCorrect: result.isCorrect,
          timeSpentSeconds: timeSpent,
          addedToSR: result.addedToSR,
        });

        // Update question with correctAnswers and explanation from server
        const newQuestions = [...questions];
        const questionIndex = newQuestions.findIndex((q) => q.id === question.id);
        if (questionIndex !== -1) {
          newQuestions[questionIndex] = {
            ...newQuestions[questionIndex],
            correctAnswers: result.correctAnswers,
            explanation: result.explanation,
          };
        }

        set({
          questions: newQuestions,
          responses: newResponses,
          isRevealed: true,
        });

        return result;
      },

      nextQuestion: () => {
        const { currentQuestionIndex, questions } = get();
        if (currentQuestionIndex < questions.length - 1) {
          set({
            currentQuestionIndex: currentQuestionIndex + 1,
            isRevealed: false,
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
            isRevealed: true, // Already answered
            questionStartTime: Date.now(),
          });
        }
      },

      completeSession: async () => {
        const { sessionId, responses, startTime, isOfflineMode, questions } = get();
        if (!sessionId) {
          throw new Error('No active session');
        }

        // In offline mode, calculate results locally
        if (isOfflineMode) {
          const responsesArr = Array.from(responses.values());
          const correctCount = responsesArr.filter((r) => r.isCorrect).length;
          const totalCount = questions.length;
          const score = Math.round((correctCount / totalCount) * 100);

          // Reset state after completion
          set(initialState);

          return {
            score,
            correctCount,
            totalCount,
            addedToSRCount: 0, // Can't add to SR in offline mode
          };
        }

        const totalTimeSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

        const responsesArray = Array.from(responses.values()).map((r) => ({
          questionId: r.questionId,
          selectedAnswers: r.selectedAnswers,
          timeSpentSeconds: r.timeSpentSeconds,
        }));

        const result = await studyApi.completeSession(sessionId, {
          responses: responsesArray,
          totalTimeSeconds,
        });

        // Reset state after completion
        set(initialState);

        return result;
      },

      abandonSession: async () => {
        const { sessionId, isOfflineMode } = get();
        // Only call API if not in offline mode and session ID is valid
        if (sessionId && !isOfflineMode && sessionId > 0) {
          await studyApi.abandonSession(sessionId);
        }
        set(initialState);
      },

      recoverSession: async () => {
        try {
          const activeSession = await studyApi.getActiveSession();
          if (!activeSession) {
            set({ needsRecovery: false });
            return false;
          }

          // Check if we have local state that matches
          const { sessionId } = get();
          if (sessionId === activeSession.session.id) {
            set({ needsRecovery: true });
            return true;
          }

          // We have a server session but no local state
          set({ needsRecovery: true });
          return true;
        } catch {
          set({ needsRecovery: false });
          return false;
        }
      },

      setNeedsRecovery: (value) => {
        set({ needsRecovery: value });
      },

      resetSession: () => {
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
      name: 'ace-study-store',
      partialize: (state) => ({
        sessionId: state.sessionId,
        sessionType: state.sessionType,
        topicId: state.topicId,
        domainId: state.domainId,
        // Strip sensitive fields (correctAnswers, explanation) before persisting
        // to prevent cheating and reduce localStorage size
        questions: state.questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options,
          difficulty: q.difficulty,
          gcpServices: q.gcpServices,
          domain: q.domain,
          topic: q.topic,
          // correctAnswers and explanation intentionally omitted
        })),
        responses: Array.from(state.responses.entries()),
        currentQuestionIndex: state.currentQuestionIndex,
        startTime: state.startTime,
        isRevealed: state.isRevealed,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.responses)) {
          state.responses = new Map(state.responses as [number, StudyResponse][]);
        }
      },
    }
  )
);
