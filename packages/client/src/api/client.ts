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
} from '@ace-prep/shared';

const API_BASE = '/api';

// Certifications
export const certificationApi = {
  list: () => request<CertificationWithCount[]>('/certifications'),
  get: (id: number) => request<CertificationWithCount>(`/certifications/${id}`),
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  // Only set Content-Type for requests with a body
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || error.error || 'Request failed');
  }

  return response.json();
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
  complete: (examId: number, totalTimeSeconds: number) =>
    request(`/exams/${examId}/complete`, {
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
  difficulty?: Difficulty;
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
    if (params?.difficulty) searchParams.set('difficulty', params.difficulty);
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
    request('/questions/review', {
      method: 'POST',
      body: JSON.stringify({ questionId, quality }),
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
    return request<{ isCompleted: boolean; completedAt: Date | null }>(
      `/study/learning-path/${order}/complete${params}`,
      {
        method: 'PATCH',
      }
    );
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
