import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  theme: 'dark' | 'light';
  llmProvider: 'openai' | 'anthropic';
  examDurationMinutes: number;
  questionsPerExam: number;
  showTimerWarning: boolean;

  setTheme: (theme: 'dark' | 'light') => void;
  setLlmProvider: (provider: 'openai' | 'anthropic') => void;
  setExamDuration: (minutes: number) => void;
  setQuestionsPerExam: (count: number) => void;
  setShowTimerWarning: (show: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      llmProvider: 'anthropic',
      examDurationMinutes: 120,
      questionsPerExam: 50,
      showTimerWarning: true,

      setTheme: (theme) => set({ theme }),
      setLlmProvider: (llmProvider) => set({ llmProvider }),
      setExamDuration: (examDurationMinutes) => set({ examDurationMinutes }),
      setQuestionsPerExam: (questionsPerExam) => set({ questionsPerExam }),
      setShowTimerWarning: (showTimerWarning) => set({ showTimerWarning }),
    }),
    {
      name: 'ace-settings-store',
    }
  )
);
