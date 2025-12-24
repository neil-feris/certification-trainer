import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  submitExam: () => Promise<void>;
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
      },

      setCurrentQuestion: (index) => {
        const { questions } = get();
        if (index >= 0 && index < questions.length) {
          set({ currentQuestionIndex: index });
        }
      },

      answerQuestion: (questionId, selectedAnswers) => {
        const { responses, questions } = get();
        const question = questions.find((q) => q.id === questionId);
        if (!question) return;

        const newResponses = new Map(responses);
        const existing = newResponses.get(questionId);

        // Check if answer is correct
        const isCorrect =
          selectedAnswers.length === question.correctAnswers.length &&
          selectedAnswers.every((a) => question.correctAnswers.includes(a)) &&
          question.correctAnswers.every((a) => selectedAnswers.includes(a));

        newResponses.set(questionId, {
          ...existing!,
          selectedAnswers,
          isCorrect,
        });

        set({ responses: newResponses });
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
        const { examId, startTime, responses } = get();
        if (!examId || !startTime) return;

        set({ isSubmitting: true });

        const totalTimeSeconds = Math.floor((Date.now() - startTime) / 1000);

        // Submit answers to API
        const responsesArray = Array.from(responses.values());
        for (const response of responsesArray) {
          if (response.selectedAnswers.length > 0) {
            await fetch(`/api/exams/${examId}/answer`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                questionId: response.questionId,
                selectedAnswers: response.selectedAnswers,
                timeSpentSeconds: response.timeSpentSeconds,
                flagged: response.flagged,
              }),
            });
          }
        }

        // Complete the exam
        await fetch(`/api/exams/${examId}/complete`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ totalTimeSeconds }),
        });

        set({ isSubmitting: false });
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

        // Mark exam as abandoned in DB
        await fetch(`/api/exams/${examId}`, {
          method: 'DELETE',
        });

        // Clear local state
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
