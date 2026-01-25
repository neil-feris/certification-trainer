import * as Sentry from '@sentry/react';
import type {
  LearningPathItem,
  LearningPathStats,
  LearningPathDetailResponse,
  TopicPracticeStats,
  StartStudySessionRequest,
  StartStudySessionResponse,
  SubmitStudyAnswerRequest,
  SubmitStudyAnswerResponse,
  CompleteStudySessionRequest,
  CompleteStudySessionResponse,
  ActiveStudySessionResponse,
  CreateExamRequest,
  DifficultyOption,
  LLMModel,
  LLMProvider,
  AnthropicModel,
  OpenAIModel,
  StartDrillRequest,
  StartDrillResponse,
  SubmitDrillAnswerRequest,
  SubmitDrillAnswerResponse,
  CompleteDrillRequest,
  CompleteDrillResponse,
  ActiveDrillResponse,
  PaginatedResponse,
  QuestionWithDomain,
  Difficulty,
  CertificationWithCount,
  QuestionFilterOptions,
  Granularity,
  TrendDataPoint,
  TrendsResponse,
  GetCaseStudiesResponse,
  GetCaseStudyResponse,
  UserStreak,
  StreakUpdateResponse,
  UserXP,
  XPHistoryRecord,
  XPAwardResponse,
  AchievementRarity,
  AchievementCriteria,
  AchievementUnlockResponse,
  BookmarkTargetType,
  Bookmark,
  ToggleBookmarkResponse,
  CheckBookmarkResponse,
  BookmarkedQuestion,
  Note,
  SaveNoteResponse,
  NoteWithQuestion,
  StartFlashcardSessionRequest,
  StartFlashcardSessionResponse,
  GetFlashcardSessionResponse,
  RateFlashcardRequest,
  RateFlashcardResponse,
  CompleteFlashcardSessionRequest,
  CompleteFlashcardSessionResponse,
  LastFlashcardSessionResponse,
  ReadinessResponse,
  ReadinessSnapshot,
  QotdResponse,
  QotdCompletionRequest,
  QotdCompletionResponse,
  CreateStudyPlanRequest,
  StudyPlanResponse,
  CompleteTaskRequest,
  CompleteTaskResponse,
  RegenerateStudyPlanRequest,
  RegenerateStudyPlanResponse,
} from '@ace-prep/shared';
import { useAuthStore } from '../stores/authStore';
import { showToast } from '../components/common';

const API_BASE = '/api';

// Track if we're currently refreshing to avoid multiple concurrent refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Attempt to refresh the access token using the httpOnly refresh token cookie
 * Returns new access token or null if refresh failed
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // Include cookies for refresh token
    });

    if (!response.ok) {
      return null;
    }

    const data: { accessToken: string; expiresAt: number } = await response.json();
    return data.accessToken;
  } catch {
    return null;
  }
}

/**
 * Handle 401 response by attempting token refresh and retrying the request
 */
async function handleUnauthorized<T>(endpoint: string, options: RequestInit): Promise<T | null> {
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    const newToken = await refreshPromise;
    if (newToken) {
      // Retry with new token
      return retryWithToken<T>(endpoint, options, newToken);
    }
    return null;
  }

  // Start refresh process
  isRefreshing = true;
  refreshPromise = refreshAccessToken();

  try {
    const newToken = await refreshPromise;

    if (newToken) {
      // Update auth store with new token
      const authStore = useAuthStore.getState();
      if (authStore.user) {
        authStore.login(authStore.user, newToken);
      }

      // Retry original request with new token
      return retryWithToken<T>(endpoint, options, newToken);
    }

    // Refresh failed - show notification, logout and redirect
    const authStore = useAuthStore.getState();
    authStore.logout();

    // Only redirect if we're in a browser context and not already on login page
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      // Show session expired notification before redirect
      showToast({
        message: 'Your session has expired. Redirecting to login...',
        type: 'warning',
        duration: 2000,
      });

      // Delay redirect to allow user to see the notification
      setTimeout(() => {
        window.location.href = '/login?error=session_expired';
      }, 2000);
    }

    return null;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

/**
 * Retry a request with a new access token
 */
async function retryWithToken<T>(
  endpoint: string,
  options: RequestInit,
  token: string
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    Authorization: `Bearer ${token}`,
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || error.error || 'Request failed');
  }

  return response.json();
}

// Certifications (public - no auth required)
export const certificationApi = {
  list: () => request<CertificationWithCount[]>('/certifications', {}, false),
  get: (id: number) => request<CertificationWithCount>(`/certifications/${id}`, {}, false),
};

// Case Studies
export const caseStudyApi = {
  getAll: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<GetCaseStudiesResponse>(`/case-studies${params}`);
  },
  getById: (id: number) => request<GetCaseStudyResponse>(`/case-studies/${id}`),
};

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  requiresAuth: boolean = true
): Promise<T> {
  const method = options.method || 'GET';
  const spanName = `${method} ${endpoint}`;

  return Sentry.startSpan(
    {
      op: 'http.client',
      name: spanName,
    },
    async (span) => {
      const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
      };

      // Add Authorization header if token exists and route requires auth
      if (requiresAuth) {
        const token = useAuthStore.getState().accessToken;
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      // Only set Content-Type for requests with a body
      if (options.body) {
        headers['Content-Type'] = 'application/json';
      }

      // Add span attributes for request details
      span.setAttribute('http.method', method);
      span.setAttribute('http.url', `${API_BASE}${endpoint}`);

      let response: Response;
      try {
        response = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers,
          credentials: 'include', // Always include cookies for refresh token
        });
      } catch (err) {
        // Capture network errors in Sentry
        Sentry.captureException(err, {
          extra: {
            endpoint,
            method,
            errorType: 'network_error',
          },
        });

        // Handle network errors (offline, DNS failure, connection refused, etc.)
        if (err instanceof TypeError && err.message === 'Failed to fetch') {
          // Check if browser is offline
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            showToast({
              message: 'You are offline. Please check your internet connection.',
              type: 'error',
              duration: 4000,
            });
            throw new Error(
              'Network error: You are offline. Please check your internet connection.'
            );
          }
          // Generic network error
          showToast({
            message: 'Network error. Please check your connection.',
            type: 'error',
            duration: 4000,
          });
          throw new Error('Network error. Please check your connection and try again.');
        }
        throw err;
      }

      // Add response status to span
      span.setAttribute('http.status_code', response.status);

      // Handle 401 Unauthorized - attempt token refresh
      if (response.status === 401 && requiresAuth) {
        const result = await handleUnauthorized<T>(endpoint, options);
        if (result !== null) {
          return result;
        }
        // If handleUnauthorized returned null, throw error
        const sessionError = new Error('Session expired. Please log in again.');
        Sentry.captureException(sessionError, {
          extra: {
            endpoint,
            method,
            statusCode: 401,
            errorType: 'session_expired',
          },
        });
        throw sessionError;
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: 'Request failed' }));
        const errorMessage = errorBody.message || errorBody.error || 'Request failed';
        const requestError = new Error(errorMessage);

        // Capture HTTP errors in Sentry
        Sentry.captureException(requestError, {
          extra: {
            endpoint,
            method,
            statusCode: response.status,
            errorBody,
            errorType: 'http_error',
          },
        });

        throw requestError;
      }

      return response.json();
    }
  );
}

// Exams
export const examApi = {
  list: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<any[]>(`/exams${params}`);
  },
  get: (id: number) => request<any>(`/exams/${id}`),
  create: (options?: CreateExamRequest) =>
    request<{ examId: number; totalQuestions: number }>('/exams', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),
  submitAnswer: (
    examId: number,
    data: { questionId: number; selectedAnswers: number[]; timeSpentSeconds?: number }
  ) =>
    request(`/exams/${examId}/answer`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  submitBatch: (
    examId: number,
    responses: Array<{
      questionId: number;
      selectedAnswers: number[];
      timeSpentSeconds?: number;
      flagged?: boolean;
    }>
  ) =>
    request<{ success: boolean; processedCount: number }>(`/exams/${examId}/submit-batch`, {
      method: 'POST',
      body: JSON.stringify({ responses }),
    }),
  complete: (examId: number, totalTimeSeconds: number) =>
    request<{
      streakUpdate?: StreakUpdateResponse;
      xpUpdate?: XPAwardResponse;
      achievementsUnlocked?: AchievementUnlockResponse[];
    }>(`/exams/${examId}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ totalTimeSeconds }),
    }),
  getReview: (id: number) => request<any>(`/exams/${id}/review`),
  abandon: (id: number) =>
    request<{ success: boolean }>(`/exams/${id}`, {
      method: 'DELETE',
    }),
};

// Question list params
export interface QuestionListParams {
  certificationId?: number;
  domainId?: number;
  topicId?: number;
  caseStudyId?: number;
  difficulty?: Difficulty;
  bookmarked?: boolean;
  search?: string;
  sortBy?: 'createdAt' | 'difficulty' | 'domain';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Questions
export const questionApi = {
  /**
   * Get paginated list of questions with optional filters, search, and sorting.
   * Returns a PaginatedResponse with items, total, limit, offset, hasMore.
   */
  list: (params?: QuestionListParams) => {
    const searchParams = new URLSearchParams();
    if (params?.certificationId)
      searchParams.set('certificationId', String(params.certificationId));
    if (params?.domainId) searchParams.set('domainId', String(params.domainId));
    if (params?.topicId) searchParams.set('topicId', String(params.topicId));
    if (params?.caseStudyId !== undefined)
      searchParams.set('caseStudyId', String(params.caseStudyId));
    if (params?.difficulty) searchParams.set('difficulty', params.difficulty);
    if (params?.bookmarked) searchParams.set('bookmarked', 'true');
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const query = searchParams.toString();
    return request<PaginatedResponse<QuestionWithDomain>>(`/questions${query ? `?${query}` : ''}`);
  },

  /**
   * Get filter options for question browser (certifications, domains, topics, etc.)
   */
  getFilterOptions: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<QuestionFilterOptions>(`/questions/filters${params}`);
  },

  /**
   * Get total count of questions (fetches first page with limit=1 for efficiency).
   * Useful when you only need the count, not the full list.
   */
  getCount: async (params?: Omit<QuestionListParams, 'limit' | 'offset'>): Promise<number> => {
    const searchParams = new URLSearchParams();
    if (params?.certificationId)
      searchParams.set('certificationId', String(params.certificationId));
    if (params?.domainId) searchParams.set('domainId', String(params.domainId));
    if (params?.topicId) searchParams.set('topicId', String(params.topicId));
    if (params?.difficulty) searchParams.set('difficulty', params.difficulty);
    searchParams.set('limit', '1');
    searchParams.set('offset', '0');
    const result = await request<PaginatedResponse<QuestionWithDomain>>(
      `/questions?${searchParams}`
    );
    return result.total;
  },

  get: (id: number) => request<QuestionWithDomain>(`/questions/${id}`),
  generate: (data: {
    domainId: number;
    topicId?: number;
    caseStudyId?: number;
    difficulty: DifficultyOption;
    count: number;
    model?: LLMModel;
  }) =>
    request<{ success: boolean; generated: number; questions: any[] }>('/questions/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getReviewQueue: () => request<QuestionWithDomain[]>('/questions/review'),
  submitReview: (questionId: number, quality: string) =>
    request<{
      streakUpdate?: StreakUpdateResponse;
      achievementsUnlocked?: AchievementUnlockResponse[];
    }>('/questions/review', {
      method: 'POST',
      body: JSON.stringify({ questionId, quality }),
    }),

  // Question of the Day
  getQotd: (certificationId: number) =>
    request<QotdResponse>(`/questions/qotd?certificationId=${certificationId}`),
  completeQotd: (data: QotdCompletionRequest) =>
    request<QotdCompletionResponse>('/questions/qotd/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Re-export trend types from shared for convenience
export type { Granularity, TrendDataPoint, TrendsResponse };

// Progress
export const progressApi = {
  getDashboard: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<any>(`/progress/dashboard${params}`);
  },
  getDomains: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<any[]>(`/progress/domains${params}`);
  },
  getWeakAreas: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<any[]>(`/progress/weak-areas${params}`);
  },
  getHistory: () => request<any[]>('/progress/history'),
  exportData: () => request<any>('/progress/export', { method: 'POST' }),
  getTrends: (certificationId?: number, granularity: Granularity = 'attempt') => {
    const params = new URLSearchParams();
    if (certificationId) params.set('certificationId', String(certificationId));
    params.set('granularity', granularity);
    return request<TrendsResponse>(`/progress/trends?${params}`);
  },
  getStreak: () => request<UserStreak>('/progress/streak'),
  getXp: () => request<UserXP>('/progress/xp'),
  getXpHistory: (limit?: number) => {
    const params = limit ? `?limit=${limit}` : '';
    return request<XPHistoryRecord[]>(`/progress/xp/history${params}`);
  },
  getReadiness: (
    certificationId: number,
    options?: { saveSnapshot?: boolean; include?: string[] }
  ) => {
    const params = new URLSearchParams();
    params.set('certificationId', String(certificationId));
    if (options?.saveSnapshot) params.set('snapshot', 'true');
    if (options?.include?.length) params.set('include', options.include.join(','));
    const query = params.toString();
    return request<ReadinessResponse>(`/progress/readiness${query ? `?${query}` : ''}`);
  },
  getReadinessHistory: (certificationId: number, limit?: number) => {
    const params = new URLSearchParams();
    params.set('certificationId', String(certificationId));
    if (limit) params.set('limit', String(limit));
    return request<ReadinessSnapshot[]>(`/progress/readiness/history?${params}`);
  },
};

// Study
export const studyApi = {
  getDomains: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<any[]>(`/study/domains${params}`);
  },
  getLearningPath: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<LearningPathItem[]>(`/study/learning-path${params}`);
  },
  getLearningPathStats: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<LearningPathStats>(`/study/learning-path/stats${params}`);
  },
  toggleLearningPathItem: (order: number, certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<{ isCompleted: boolean; completedAt: Date | null }>(
      `/study/learning-path/${order}/toggle${params}`,
      {
        method: 'PATCH',
      }
    );
  },
  getLearningPathItem: (order: number, certificationId?: number, regenerate?: boolean) => {
    const searchParams = new URLSearchParams();
    if (certificationId) searchParams.set('certificationId', String(certificationId));
    if (regenerate) searchParams.set('regenerate', 'true');
    const query = searchParams.toString();
    return request<LearningPathDetailResponse>(
      `/study/learning-path/${order}${query ? `?${query}` : ''}`
    );
  },
  markLearningPathComplete: (order: number, certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<{
      isCompleted: boolean;
      completedAt: Date | null;
      streakUpdate?: StreakUpdateResponse;
      achievementsUnlocked?: AchievementUnlockResponse[];
    }>(`/study/learning-path/${order}/complete${params}`, {
      method: 'PATCH',
    });
  },
  generateSummary: (domainId: number, topicId?: number) =>
    request<{ success: boolean; summary: any }>('/study/summary', {
      method: 'POST',
      body: JSON.stringify({ domainId, topicId }),
    }),
  generateExplanation: (questionId: number, userAnswers: number[]) =>
    request<{ success: boolean; explanation: string }>('/study/explain', {
      method: 'POST',
      body: JSON.stringify({ questionId, userAnswers }),
    }),
  getSummaries: () => request<any[]>('/study/summaries'),

  // Study Sessions
  createSession: (data: StartStudySessionRequest) =>
    request<StartStudySessionResponse>('/study/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getActiveSession: () => request<ActiveStudySessionResponse | null>('/study/sessions/active'),
  submitAnswer: (sessionId: number, data: SubmitStudyAnswerRequest) =>
    request<SubmitStudyAnswerResponse>(`/study/sessions/${sessionId}/answer`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  completeSession: (sessionId: number, data: CompleteStudySessionRequest) =>
    request<CompleteStudySessionResponse>(`/study/sessions/${sessionId}/complete`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  abandonSession: (sessionId: number) =>
    request<{ success: boolean }>(`/study/sessions/${sessionId}`, {
      method: 'DELETE',
    }),

  // Topic Practice
  getTopicQuestions: (topicId: number, count?: number, difficulty?: string) => {
    const params = new URLSearchParams();
    if (count) params.set('count', String(count));
    if (difficulty) params.set('difficulty', difficulty);
    return request<any[]>(`/study/topics/${topicId}/questions?${params}`);
  },
  getTopicStats: (topicId: number) => request<TopicPracticeStats>(`/study/topics/${topicId}/stats`),
};

// Settings
export const settingsApi = {
  get: () => request<any>('/settings'),
  update: (
    data: Partial<{
      llmProvider: LLMProvider;
      openaiApiKey: string;
      anthropicApiKey: string;
      anthropicModel: AnthropicModel;
      openaiModel: OpenAIModel;
      examDurationMinutes: number;
      questionsPerExam: number;
    }>
  ) =>
    request('/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  testApi: (provider: LLMProvider, apiKey: string) =>
    request<{ success: boolean; message: string }>('/settings/test-api', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey }),
    }),
};

// Drills
export const drillApi = {
  start: (data: StartDrillRequest) =>
    request<StartDrillResponse>('/drills', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  submitAnswer: (drillId: number, data: SubmitDrillAnswerRequest) =>
    request<SubmitDrillAnswerResponse>(`/drills/${drillId}/answer`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  complete: (drillId: number, data: CompleteDrillRequest) =>
    request<CompleteDrillResponse>(`/drills/${drillId}/complete`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getActive: () => request<ActiveDrillResponse | null>('/drills/active'),
  abandon: (drillId: number) =>
    request<{ success: boolean }>(`/drills/${drillId}`, {
      method: 'DELETE',
    }),
};

// Achievement API response types
export interface AchievementBadge {
  code: string;
  name: string;
  description: string;
  rarity: AchievementRarity;
  icon: string;
  criteria: AchievementCriteria;
  earned: boolean;
  unlockedAt: string | null;
  xpAwarded: number;
}

export interface AchievementsResponse {
  badges: AchievementBadge[];
  earned: number;
  total: number;
  locked: number;
}

export interface AchievementProgressItem {
  code: string;
  name: string;
  rarity: AchievementRarity;
  icon: string;
  currentValue: number;
  targetValue: number;
  percentComplete: number;
}

export interface AchievementProgressResponse {
  progress: AchievementProgressItem[];
}

// Achievements
export const achievementApi = {
  getAll: () => request<AchievementsResponse>('/achievements'),
  getProgress: () => request<AchievementProgressResponse>('/achievements/progress'),
};

// Bookmarks
export const bookmarksApi = {
  toggle: (targetType: BookmarkTargetType, targetId: number) =>
    request<ToggleBookmarkResponse>('/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ targetType, targetId }),
    }),
  list: (type?: BookmarkTargetType) => {
    const params = type ? `?type=${type}` : '';
    return request<Bookmark[]>(`/bookmarks${params}`);
  },
  listQuestions: () => request<BookmarkedQuestion[]>('/bookmarks/questions'),
  check: (targetType: BookmarkTargetType, targetId: number) =>
    request<CheckBookmarkResponse>(
      `/bookmarks/check?targetType=${targetType}&targetId=${targetId}`
    ),
};

// Flashcards
export const flashcardApi = {
  startSession: (data: StartFlashcardSessionRequest) =>
    request<StartFlashcardSessionResponse>('/study/flashcards', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getSession: (sessionId: number) =>
    request<GetFlashcardSessionResponse>(`/study/flashcards/${sessionId}`),
  rateCard: (sessionId: number, data: RateFlashcardRequest) =>
    request<RateFlashcardResponse>(`/study/flashcards/${sessionId}/rate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  completeSession: (sessionId: number, data?: CompleteFlashcardSessionRequest) =>
    request<CompleteFlashcardSessionResponse>(`/study/flashcards/${sessionId}/complete`, {
      method: 'PATCH',
      body: JSON.stringify(data || {}),
    }),
  getLastSession: () =>
    request<{ session: LastFlashcardSessionResponse | null }>('/study/flashcards/last-session'),
};

// Notes
export const notesApi = {
  save: (questionId: number, content: string) =>
    request<SaveNoteResponse>('/notes', {
      method: 'POST',
      body: JSON.stringify({ questionId, content }),
    }),
  get: (questionId: number) => request<Note | null>(`/notes/${questionId}`),
  list: () => request<NoteWithQuestion[]>('/notes'),
  delete: (questionId: number) =>
    request<{ success: boolean }>(`/notes/${questionId}`, {
      method: 'DELETE',
    }),
};

// Study Plans
export const studyPlanApi = {
  create: (data: CreateStudyPlanRequest) =>
    request<StudyPlanResponse>('/study-plans', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getActive: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<StudyPlanResponse | null>(`/study-plans/active${params}`);
  },
  get: (planId: number) => request<StudyPlanResponse>(`/study-plans/${planId}`),
  completeTask: (planId: number, taskId: number, data?: CompleteTaskRequest) =>
    request<CompleteTaskResponse>(`/study-plans/${planId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data || {}),
    }),
  abandon: (planId: number) =>
    request<{ success: boolean }>(`/study-plans/${planId}`, {
      method: 'DELETE',
    }),
  regenerate: (planId: number, data?: RegenerateStudyPlanRequest) =>
    request<RegenerateStudyPlanResponse>(`/study-plans/${planId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
};
