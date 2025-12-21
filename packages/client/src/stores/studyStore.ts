import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { studyApi } from '../api/client';

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
  startSession: (type: 'topic_practice' | 'learning_path', topicId?: number, domainId?: number) => Promise<void>;
  answerQuestion: (questionId: number, selectedAnswers: number[]) => void;
  revealAnswer: () => Promise<{ isCorrect: boolean; explanation: string; addedToSR: boolean }>;
  nextQuestion: () => void;
  previousQuestion: () => void;
  completeSession: () => Promise<{ score: number; correctCount: number; totalCount: number; addedToSRCount: number }>;
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
        const { sessionId, questions, currentQuestionIndex, responses, questionStartTime } = get();
        const question = questions[currentQuestionIndex];
        if (!question || !sessionId) {
          throw new Error('No active question or session');
        }

        const response = responses.get(question.id);
        if (!response) {
          throw new Error('No response found');
        }

        const timeSpent = questionStartTime ? Math.floor((Date.now() - questionStartTime) / 1000) : 0;

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
        const questionIndex = newQuestions.findIndex(q => q.id === question.id);
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
        const { sessionId, responses, startTime } = get();
        if (!sessionId) {
          throw new Error('No active session');
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
        const { sessionId } = get();
        if (sessionId) {
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
        questions: state.questions,
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
