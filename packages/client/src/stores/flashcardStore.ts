import { create } from 'zustand';
import { flashcardApi } from '../api/client';
import { showToast } from '../components/common';
import type {
  FlashcardCard,
  FlashcardSession,
  ReviewQuality,
  StartFlashcardSessionRequest,
  CompleteFlashcardSessionResponse,
  RateFlashcardResponse,
} from '@ace-prep/shared';

interface FlashcardState {
  // Session
  session: FlashcardSession | null;
  cards: FlashcardCard[];
  currentCardIndex: number;
  isFlipped: boolean;
  isLoading: boolean;

  // Ratings
  ratings: Map<number, ReviewQuality>;
  isRating: boolean;

  // Results
  isCompleting: boolean;
  results: CompleteFlashcardSessionResponse | null;

  // Actions
  startSession: (config: StartFlashcardSessionRequest) => Promise<number>;
  loadSession: (sessionId: number) => Promise<void>;
  flipCard: () => void;
  rateCard: (rating: ReviewQuality) => Promise<RateFlashcardResponse | null>;
  nextCard: () => void;
  previousCard: () => void;
  goToCard: (index: number) => void;
  completeSession: () => Promise<CompleteFlashcardSessionResponse | null>;
  reset: () => void;

  // Getters
  getCurrentCard: () => FlashcardCard | null;
  getProgress: () => { current: number; total: number; rated: number };
  isLastCard: () => boolean;
  isFirstCard: () => boolean;
  allCardsRated: () => boolean;
}

const initialState = {
  session: null,
  cards: [],
  currentCardIndex: 0,
  isFlipped: false,
  isLoading: false,
  ratings: new Map<number, ReviewQuality>(),
  isRating: false,
  isCompleting: false,
  results: null,
};

export const useFlashcardStore = create<FlashcardState>()((set, get) => ({
  ...initialState,

  startSession: async (config) => {
    set({ isLoading: true });
    try {
      const response = await flashcardApi.startSession(config);
      return response.sessionId;
    } finally {
      set({ isLoading: false });
    }
  },

  loadSession: async (sessionId) => {
    set({ isLoading: true });
    try {
      const response = await flashcardApi.getSession(sessionId);
      set({
        session: response.session,
        cards: response.cards,
        currentCardIndex: 0,
        isFlipped: false,
        ratings: new Map(),
        results: null,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  flipCard: () => {
    set((state) => ({ isFlipped: !state.isFlipped }));
  },

  rateCard: async (rating) => {
    const { session, cards, currentCardIndex, isRating } = get();
    if (!session) return null;
    if (isRating) return null; // Prevent concurrent rating calls

    const card = cards[currentCardIndex];
    if (!card) return null;

    set({ isRating: true });
    try {
      const response = await flashcardApi.rateCard(session.id, {
        questionId: card.questionId,
        rating,
      });

      set((state) => {
        const newRatings = new Map(state.ratings);
        newRatings.set(card.questionId, rating);
        return { ratings: newRatings, isRating: false };
      });

      return response;
    } catch {
      set({ isRating: false });
      showToast({ message: 'Failed to save rating', type: 'error' });
      return null;
    }
  },

  nextCard: () => {
    const { currentCardIndex, cards } = get();
    if (currentCardIndex < cards.length - 1) {
      set({ currentCardIndex: currentCardIndex + 1, isFlipped: false });
    }
  },

  previousCard: () => {
    const { currentCardIndex } = get();
    if (currentCardIndex > 0) {
      set({ currentCardIndex: currentCardIndex - 1, isFlipped: false });
    }
  },

  goToCard: (index) => {
    const { cards } = get();
    if (index >= 0 && index < cards.length) {
      set({ currentCardIndex: index, isFlipped: false });
    }
  },

  completeSession: async () => {
    const { session, isCompleting } = get();
    if (!session || isCompleting) return null;

    set({ isCompleting: true });
    try {
      const response = await flashcardApi.completeSession(session.id);
      set({ results: response });
      return response;
    } finally {
      set({ isCompleting: false });
    }
  },

  reset: () => {
    set(initialState);
  },

  getCurrentCard: () => {
    const { cards, currentCardIndex } = get();
    return cards[currentCardIndex] ?? null;
  },

  getProgress: () => {
    const { cards, currentCardIndex, ratings } = get();
    return {
      current: currentCardIndex + 1,
      total: cards.length,
      rated: ratings.size,
    };
  },

  isLastCard: () => {
    const { currentCardIndex, cards } = get();
    return currentCardIndex === cards.length - 1;
  },

  isFirstCard: () => {
    const { currentCardIndex } = get();
    return currentCardIndex === 0;
  },

  allCardsRated: () => {
    const { cards, ratings } = get();
    return cards.length > 0 && ratings.size === cards.length;
  },
}));
