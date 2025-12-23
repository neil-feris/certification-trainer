import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Generation progress state (not persisted - runtime only)
interface GenerationProgress {
  isGenerating: boolean;
  domainsCompleted: number;
  domainsTotal: number;
  questionsGenerated: number;
  error: string | null;
  lastResult: { generated: number; timestamp: Date } | null;
}

interface SettingsState {
  theme: 'dark' | 'light';
  llmProvider: 'openai' | 'anthropic';
  examDurationMinutes: number;
  questionsPerExam: number;
  showTimerWarning: boolean;
  showDifficultyDuringExam: boolean;

  // Generation state (survives navigation)
  generation: GenerationProgress;

  setTheme: (theme: 'dark' | 'light') => void;
  setLlmProvider: (provider: 'openai' | 'anthropic') => void;
  setExamDuration: (minutes: number) => void;
  setQuestionsPerExam: (count: number) => void;
  setShowTimerWarning: (show: boolean) => void;
  setShowDifficultyDuringExam: (show: boolean) => void;

  // Generation actions
  startGeneration: (totalDomains: number) => void;
  updateGenerationProgress: (domainsCompleted: number, questionsGenerated: number) => void;
  completeGeneration: (totalGenerated: number) => void;
  failGeneration: (error: string) => void;
  clearGenerationStatus: () => void;
}

const initialGenerationState: GenerationProgress = {
  isGenerating: false,
  domainsCompleted: 0,
  domainsTotal: 0,
  questionsGenerated: 0,
  error: null,
  lastResult: null,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      llmProvider: 'anthropic',
      examDurationMinutes: 120,
      questionsPerExam: 50,
      showTimerWarning: true,
      showDifficultyDuringExam: false,
      generation: initialGenerationState,

      setTheme: (theme) => set({ theme }),
      setLlmProvider: (llmProvider) => set({ llmProvider }),
      setExamDuration: (examDurationMinutes) => set({ examDurationMinutes }),
      setQuestionsPerExam: (questionsPerExam) => set({ questionsPerExam }),
      setShowTimerWarning: (showTimerWarning) => set({ showTimerWarning }),
      setShowDifficultyDuringExam: (showDifficultyDuringExam) => set({ showDifficultyDuringExam }),

      startGeneration: (totalDomains) =>
        set({
          generation: {
            isGenerating: true,
            domainsCompleted: 0,
            domainsTotal: totalDomains,
            questionsGenerated: 0,
            error: null,
            lastResult: null,
          },
        }),

      updateGenerationProgress: (domainsCompleted, questionsGenerated) =>
        set((state) => ({
          generation: {
            ...state.generation,
            domainsCompleted,
            questionsGenerated,
          },
        })),

      completeGeneration: (totalGenerated) =>
        set({
          generation: {
            isGenerating: false,
            domainsCompleted: 0,
            domainsTotal: 0,
            questionsGenerated: 0,
            error: null,
            lastResult: { generated: totalGenerated, timestamp: new Date() },
          },
        }),

      failGeneration: (error) =>
        set((state) => ({
          generation: {
            ...state.generation,
            isGenerating: false,
            error,
          },
        })),

      clearGenerationStatus: () =>
        set({ generation: initialGenerationState }),
    }),
    {
      name: 'ace-settings-store',
      partialize: (state) => ({
        // Only persist these fields, NOT generation state
        theme: state.theme,
        llmProvider: state.llmProvider,
        examDurationMinutes: state.examDurationMinutes,
        questionsPerExam: state.questionsPerExam,
        showTimerWarning: state.showTimerWarning,
        showDifficultyDuringExam: state.showDifficultyDuringExam,
      }),
    }
  )
);
