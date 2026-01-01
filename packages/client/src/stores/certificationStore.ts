import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CertificationWithCount } from '@ace-prep/shared';

interface CertificationState {
  // Selected certification ID (persisted)
  selectedCertificationId: number | null;

  // Loaded certifications (runtime only, fetched from API)
  certifications: CertificationWithCount[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setSelectedCertification: (id: number) => void;
  setCertifications: (certs: CertificationWithCount[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Computed
  getSelectedCertification: () => CertificationWithCount | undefined;
}

export const useCertificationStore = create<CertificationState>()(
  persist(
    (set, get) => ({
      selectedCertificationId: null,
      certifications: [],
      isLoading: false,
      error: null,

      setSelectedCertification: (id) => set({ selectedCertificationId: id }),

      setCertifications: (certs) => {
        const state = get();
        // If no certification selected, auto-select the first one
        if (state.selectedCertificationId === null && certs.length > 0) {
          set({ certifications: certs, selectedCertificationId: certs[0].id });
        } else {
          set({ certifications: certs });
        }
      },

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      getSelectedCertification: () => {
        const state = get();
        return state.certifications.find((c) => c.id === state.selectedCertificationId);
      },
    }),
    {
      name: 'cert-trainer-certification',
      partialize: (state) => ({
        // Only persist the selected certification ID
        selectedCertificationId: state.selectedCertificationId,
      }),
    }
  )
);
