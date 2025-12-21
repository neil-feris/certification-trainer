const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || error.error || 'Request failed');
  }

  return response.json();
}

// Exams
export const examApi = {
  list: () => request<any[]>('/exams'),
  get: (id: number) => request<any>(`/exams/${id}`),
  create: (focusDomains?: number[]) =>
    request<{ examId: number; totalQuestions: number }>('/exams', {
      method: 'POST',
      body: JSON.stringify({ focusDomains }),
    }),
  submitAnswer: (examId: number, data: { questionId: number; selectedAnswers: number[]; timeSpentSeconds?: number }) =>
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
};

// Questions
export const questionApi = {
  list: (params?: { domainId?: number; topicId?: number; difficulty?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.domainId) searchParams.set('domainId', String(params.domainId));
    if (params?.topicId) searchParams.set('topicId', String(params.topicId));
    if (params?.difficulty) searchParams.set('difficulty', params.difficulty);
    return request<any[]>(`/questions?${searchParams}`);
  },
  get: (id: number) => request<any>(`/questions/${id}`),
  generate: (data: { domainId: number; topicId?: number; difficulty: string; count: number }) =>
    request<{ success: boolean; generated: number; questions: any[] }>('/questions/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getReviewQueue: () => request<any[]>('/questions/review'),
  submitReview: (questionId: number, quality: string) =>
    request('/questions/review', {
      method: 'POST',
      body: JSON.stringify({ questionId, quality }),
    }),
};

// Progress
export const progressApi = {
  getDashboard: () => request<any>('/progress/dashboard'),
  getDomains: () => request<any[]>('/progress/domains'),
  getWeakAreas: () => request<any[]>('/progress/weak-areas'),
  getHistory: () => request<any[]>('/progress/history'),
  exportData: () =>
    request<any>('/progress/export', { method: 'POST' }),
};

// Study
export const studyApi = {
  getDomains: () => request<any[]>('/study/domains'),
  getLearningPath: () => request<any[]>('/study/learning-path'),
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
};

// Settings
export const settingsApi = {
  get: () => request<any>('/settings'),
  update: (data: Partial<{
    llmProvider: string;
    openaiApiKey: string;
    anthropicApiKey: string;
    examDurationMinutes: number;
    questionsPerExam: number;
  }>) =>
    request('/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  testApi: (provider: 'openai' | 'anthropic', apiKey: string) =>
    request<{ success: boolean; message: string }>('/settings/test-api', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey }),
    }),
};
