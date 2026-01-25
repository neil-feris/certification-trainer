import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@ace-prep/shared';
import { clearAllUserData } from '../services/offlineDb';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (user: User, accessToken: string) => void;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true, // Start true to check auth on app load

      login: (user, accessToken) =>
        set({
          user,
          accessToken,
          isAuthenticated: true,
          isLoading: false,
        }),

      logout: async () => {
        // SECURITY: Clear all cached data including questions with correctAnswers
        // This prevents sensitive exam data from persisting after logout
        try {
          await clearAllUserData();
        } catch (error) {
          console.error('Failed to clear user data on logout:', error);
        }

        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      setLoading: (isLoading) => set({ isLoading }),

      setUser: (user) => set({ user }),
    }),
    {
      name: 'ace-auth-store',
      partialize: (state) => ({
        // Only persist accessToken - refresh token is in httpOnly cookie
        // User data will be fetched fresh on app load via /api/auth/me
        accessToken: state.accessToken,
      }),
      onRehydrateStorage: () => (state) => {
        // Initialize isAuthenticated based on stored token existence
        if (state) {
          state.isAuthenticated = !!state.accessToken;
          // isLoading remains true until app verifies token with /api/auth/me
        }
      },
    }
  )
);
