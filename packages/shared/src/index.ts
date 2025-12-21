// ACE Prep Shared Types

// Domain types
export interface Domain {
  id: number;
  code: string;
  name: string;
  weight: number;
  description: string | null;
  orderIndex: number;
}

export interface Topic {
  id: number;
  domainId: number;
  code: string;
  name: string;
  description: string | null;
}

// Question types
export type QuestionType = 'single' | 'multiple';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: number;
  topicId: number;
  domainId: number;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswers: number[];
  explanation: string;
  difficulty: Difficulty;
  gcpServices: string[];
  isGenerated: boolean;
  createdAt: Date;
}

export interface QuestionWithDomain extends Question {
  domain: Domain;
  topic: Topic;
}

// Exam types
export type ExamStatus = 'in_progress' | 'completed' | 'abandoned';

export interface Exam {
  id: number;
  startedAt: Date;
  completedAt: Date | null;
  timeSpentSeconds: number | null;
  totalQuestions: number;
  correctAnswers: number | null;
  score: number | null;
  status: ExamStatus;
}

export interface ExamResponse {
  id: number;
  examId: number;
  questionId: number;
  selectedAnswers: number[];
  isCorrect: boolean | null;
  timeSpentSeconds: number | null;
  flagged: boolean;
  orderIndex: number;
}

export interface ExamWithResponses extends Exam {
  responses: (ExamResponse & { question: QuestionWithDomain })[];
}

// Progress types
export interface PerformanceStats {
  domainId: number;
  topicId: number | null;
  totalAttempts: number;
  correctAttempts: number;
  avgTimeSeconds: number | null;
  lastAttemptedAt: Date | null;
  accuracy: number;
}

export interface DashboardStats {
  totalExams: number;
  averageScore: number;
  bestScore: number;
  totalQuestionsAnswered: number;
  correctAnswers: number;
  overallAccuracy: number;
  domainStats: (PerformanceStats & { domain: Domain })[];
  weakAreas: { topic: Topic; domain: Domain; accuracy: number }[];
  recentExams: Exam[];
}

// Spaced Repetition types
export interface SpacedRepetitionItem {
  id: number;
  questionId: number;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: Date;
  lastReviewedAt: Date | null;
}

export type ReviewQuality = 'again' | 'hard' | 'good' | 'easy';

// Study types
export interface StudySummary {
  id: number;
  domainId: number | null;
  topicId: number | null;
  content: string;
  generatedAt: Date;
}

// API request/response types
export interface CreateExamRequest {
  focusDomains?: number[];
}

export interface SubmitAnswerRequest {
  questionId: number;
  selectedAnswers: number[];
  timeSpentSeconds: number;
}

export interface CompleteExamRequest {
  totalTimeSeconds: number;
}

export interface GenerateQuestionsRequest {
  domainId: number;
  topicId?: number;
  difficulty: Difficulty;
  count: number;
}

export interface GenerateExplanationRequest {
  questionId: number;
  userAnswers: number[];
}

export interface GenerateStudySummaryRequest {
  domainId: number;
  topicId?: number;
  weakPoints: string[];
}

export interface ReviewQuestionRequest {
  questionId: number;
  quality: ReviewQuality;
}

// Settings
export interface Settings {
  llmProvider: 'openai' | 'anthropic';
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  examDurationMinutes: number;
  questionsPerExam: number;
}

// LLM generated content
export interface GeneratedQuestion {
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswers: number[];
  explanation: string;
  gcpServices: string[];
  difficulty: Difficulty;
}

// ACE Exam Domain Codes
export const DOMAIN_CODES = {
  SETUP_CLOUD_ENV: 'SETUP_CLOUD_ENV',
  PLAN_CONFIG: 'PLAN_CONFIG',
  DEPLOY_IMPLEMENT: 'DEPLOY_IMPLEMENT',
  OPERATIONS: 'OPERATIONS',
  ACCESS_SECURITY: 'ACCESS_SECURITY',
} as const;

export type DomainCode = typeof DOMAIN_CODES[keyof typeof DOMAIN_CODES];
