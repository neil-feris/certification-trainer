// Certification Trainer Shared Types

// Certification types
export type CertificationProvider = 'gcp' | 'aws' | 'azure';

export interface CertificationCapabilities {
  hasCaseStudies: boolean;
}

export const DEFAULT_CERTIFICATION_CAPABILITIES: CertificationCapabilities = {
  hasCaseStudies: false,
};

export interface Certification {
  id: number;
  code: string; // 'ACE', 'PCA', 'PDE', etc.
  name: string; // 'Associate Cloud Engineer'
  shortName: string; // 'ACE'
  description: string | null;
  provider: CertificationProvider;
  examDurationMinutes: number;
  totalQuestions: number;
  passingScorePercent: number | null;
  isActive: boolean;
  capabilities: CertificationCapabilities;
  createdAt: Date;
}

export interface CertificationWithCount extends Certification {
  questionCount: number;
}

// LLM Provider and Model types
export type LLMProvider = 'openai' | 'anthropic';

export const ANTHROPIC_MODELS = [
  // Claude 4.5 (Current)
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001',
  // Claude 4.x (Legacy)
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
] as const;

export const OPENAI_MODELS = [
  // GPT-5 Family (Latest)
  'gpt-5.2',
  'gpt-5.2-mini',
  // GPT-4.1 Family
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  // GPT-4o Family
  'gpt-4o',
  'gpt-4o-mini',
  // Reasoning Models (o-series)
  'o3',
  'o3-pro',
  'o3-mini',
  'o4-mini',
] as const;

export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];
export type OpenAIModel = (typeof OPENAI_MODELS)[number];
export type LLMModel = AnthropicModel | OpenAIModel;

// Models that use max_completion_tokens instead of max_tokens
const MODELS_WITH_COMPLETION_TOKENS = [
  'gpt-5.2',
  'gpt-5.2-mini',
  'o3',
  'o3-pro',
  'o3-mini',
  'o4-mini',
] as const;

// Helper to check if a model uses max_completion_tokens parameter
export function usesMaxCompletionTokens(model: string): boolean {
  return MODELS_WITH_COMPLETION_TOKENS.some((m) => model.startsWith(m) || model === m);
}

export const DEFAULT_ANTHROPIC_MODEL: AnthropicModel = 'claude-sonnet-4-5-20250929';
export const DEFAULT_OPENAI_MODEL: OpenAIModel = 'gpt-5.2';

// Model display names for UI
export const MODEL_DISPLAY_NAMES: Record<LLMModel, string> = {
  // Anthropic Claude 4.5 (Current)
  'claude-opus-4-5-20251101': 'Claude Opus 4.5 (Flagship)',
  'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5 (Recommended)',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5 (Fast)',
  // Anthropic Claude 4.x (Legacy)
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-3-7-sonnet-20250219': 'Claude 3.7 Sonnet',
  // OpenAI GPT-5 Family (Latest)
  'gpt-5.2': 'GPT-5.2 (Recommended)',
  'gpt-5.2-mini': 'GPT-5.2 Mini',
  // OpenAI GPT-4.1 Family
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-mini': 'GPT-4.1 Mini',
  'gpt-4.1-nano': 'GPT-4.1 Nano (Fast)',
  // OpenAI GPT-4o Family
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  // OpenAI Reasoning Models (o-series)
  o3: 'o3 (Reasoning)',
  'o3-pro': 'o3 Pro (Extended Reasoning)',
  'o3-mini': 'o3 Mini (Reasoning)',
  'o4-mini': 'o4-mini (Reasoning)',
};

// Difficulty options for question generation
export const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard', 'mixed'] as const;
export type DifficultyOption = (typeof DIFFICULTY_OPTIONS)[number];

// Exam size options - single source of truth for valid question counts
export const EXAM_SIZE_OPTIONS = [10, 15, 25, 50] as const;
export type ExamSize = (typeof EXAM_SIZE_OPTIONS)[number];
export const EXAM_SIZE_MIN = 10;
export const EXAM_SIZE_MAX = 50;
export const EXAM_SIZE_DEFAULT = 50;

// Domain types
export interface Domain {
  id: number;
  certificationId: number;
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
  caseStudyId?: number;
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
  caseStudy?: CaseStudy;
}

// Exam types
export type ExamStatus = 'in_progress' | 'completed' | 'abandoned';

export interface Exam {
  id: number;
  certificationId: number;
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

// Study Session Types
export type StudySessionType = 'topic_practice' | 'learning_path';
export type StudySessionStatus = 'in_progress' | 'completed' | 'abandoned';

export interface StudySession {
  id: number;
  certificationId: number;
  sessionType: StudySessionType;
  topicId: number | null;
  domainId: number | null;
  startedAt: Date;
  completedAt: Date | null;
  status: StudySessionStatus;
  totalQuestions: number;
  correctAnswers: number;
  timeSpentSeconds: number;
  syncedAt: Date | null;
}

export interface StudySessionResponseItem {
  id: number;
  sessionId: number;
  questionId: number;
  selectedAnswers: number[];
  isCorrect: boolean | null;
  timeSpentSeconds: number | null;
  orderIndex: number;
  addedToSR: boolean;
}

export interface LearningPathItem {
  order: number;
  title: string;
  type: 'course' | 'skill_badge' | 'exam';
  description: string;
  topics: string[];
  whyItMatters: string;
  isCompleted: boolean;
  completedAt: Date | null;
}

export interface LearningPathSummary {
  id: number;
  pathItemOrder: number;
  certificationId: number;
  overview: string;
  keyTakeaways: string[];
  importantConcepts: string[];
  examTips: string[];
  relatedTopicIds: number[];
  generatedAt: Date;
  isEnhanced: boolean;
}

export interface LearningPathDetailResponse {
  item: LearningPathItem;
  summary: LearningPathSummary | null;
  relatedQuestions: QuestionWithDomain[];
  totalItems: number;
}

export interface LearningPathStats {
  completed: number;
  total: number;
  percentComplete: number;
  nextRecommended: number | null;
}

export interface TopicPracticeStats {
  topicId: number;
  accuracy: number;
  totalAttempted: number;
  lastPracticed: Date | null;
  questionsInSR: number;
  recommendedAction: 'practice' | 'review' | 'mastered';
}

// Case Study types
export interface CaseStudy {
  id: number;
  certificationId: number;
  code: string;
  name: string;
  companyOverview: string;
  solutionConcept: string;
  existingTechnicalEnvironment: string;
  businessRequirements: string[];
  technicalRequirements: string[];
  executiveStatement: string;
  orderIndex: number;
  createdAt: Date;
}

export interface CaseStudyWithCertification extends CaseStudy {
  certification: Pick<Certification, 'id' | 'code' | 'name'>;
}

// Pagination types
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

// API request/response types
export interface CreateExamRequest {
  certificationId?: number; // Optional: uses default (first active) certification if not provided
  focusDomains?: number[];
  questionCount?: ExamSize; // Valid sizes: 10, 15, 25, 50 (defaults to 50)
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
  caseStudyId?: number;
  difficulty: DifficultyOption;
  count: number;
  model?: LLMModel; // Optional: override the default model for this generation
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

// Study Session API Request/Response Types
export interface StartStudySessionRequest {
  certificationId?: number; // Optional: uses default (first active) certification if not provided
  sessionType: StudySessionType;
  topicId?: number;
  domainId?: number;
  questionCount?: number;
}

// Question without answers - used in session start to prevent cheating
export interface QuestionForSession {
  id: number;
  topicId: number;
  domainId: number;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  // correctAnswers and explanation are OMITTED to prevent cheating
  difficulty: Difficulty;
  gcpServices: string[];
  isGenerated: boolean;
  createdAt: Date;
  domain: Domain;
  topic: Topic;
}

export interface StartStudySessionResponse {
  sessionId: number;
  questions: QuestionForSession[];
}

export interface SubmitStudyAnswerRequest {
  questionId: number;
  selectedAnswers: number[];
  timeSpentSeconds: number;
}

export interface SubmitStudyAnswerResponse {
  isCorrect: boolean;
  correctAnswers: number[]; // Revealed only after submission
  explanation: string; // Revealed only after submission
  addedToSR: boolean;
}

export interface CompleteStudySessionRequest {
  responses: SubmitStudyAnswerRequest[];
  totalTimeSeconds: number;
}

export interface CompleteStudySessionResponse {
  score: number;
  correctCount: number;
  totalCount: number;
  addedToSRCount: number;
  streakUpdate?: StreakUpdateResponse;
}

export interface ActiveStudySessionResponse {
  session: StudySession;
  responses: StudySessionResponseItem[];
  questions: QuestionWithDomain[];
}

// Settings
export interface Settings {
  llmProvider: LLMProvider;
  hasOpenaiKey: boolean;
  hasAnthropicKey: boolean;
  anthropicModel: AnthropicModel;
  openaiModel: OpenAIModel;
  examDurationMinutes: number;
  questionsPerExam: number;
  showDifficultyDuringExam: boolean;
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
// @deprecated - Domain codes are now certification-specific and loaded from the database.
// This constant is kept for backward compatibility but will be removed in a future version.
export const DOMAIN_CODES = {
  SETUP_CLOUD_ENV: 'SETUP_CLOUD_ENV',
  PLAN_CONFIG: 'PLAN_CONFIG',
  DEPLOY_IMPLEMENT: 'DEPLOY_IMPLEMENT',
  OPERATIONS: 'OPERATIONS',
  ACCESS_SECURITY: 'ACCESS_SECURITY',
} as const;

/** @deprecated Use certification-specific domain codes from the API instead */
export type DomainCode = (typeof DOMAIN_CODES)[keyof typeof DOMAIN_CODES];

// ============ TIMED DRILL TYPES ============

export type DrillMode = 'domain' | 'weak_areas';
export const DRILL_QUESTION_COUNTS = [5, 10, 15, 20] as const;
export const DRILL_TIME_LIMITS = [60, 120, 300, 600] as const; // seconds (1, 2, 5, 10 min)
export type DrillQuestionCount = (typeof DRILL_QUESTION_COUNTS)[number];
export type DrillTimeLimit = (typeof DRILL_TIME_LIMITS)[number];

export interface DrillConfig {
  mode: DrillMode;
  domainId?: number;
  questionCount: DrillQuestionCount;
  timeLimitSeconds: DrillTimeLimit;
}

export interface DrillQuestion {
  id: number;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  difficulty: Difficulty;
  domain: { id: number; name: string; code: string };
  topic: { id: number; name: string };
}

export interface DrillResult {
  questionId: number;
  selectedAnswers: number[];
  isCorrect: boolean;
  correctAnswers: number[];
  explanation: string;
  timeSpentSeconds: number;
}

export interface StartDrillRequest {
  mode: DrillMode;
  domainId?: number;
  questionCount: DrillQuestionCount;
  timeLimitSeconds: DrillTimeLimit;
}

export interface StartDrillResponse {
  drillId: number;
  questions: DrillQuestion[];
  startedAt: string;
  timeLimitSeconds: number;
}

export interface SubmitDrillAnswerRequest {
  questionId: number;
  selectedAnswers: number[];
  timeSpentSeconds: number;
}

export interface SubmitDrillAnswerResponse {
  isCorrect: boolean;
  correctAnswers: number[];
  explanation: string;
  addedToSR: boolean;
}

export interface CompleteDrillRequest {
  totalTimeSeconds: number;
  timedOut?: boolean;
}

export interface CompleteDrillResponse {
  score: number;
  correctCount: number;
  totalCount: number;
  avgTimePerQuestion: number;
  addedToSRCount: number;
  results: DrillResult[];
}

export interface ActiveDrillResponse {
  session: {
    id: number;
    sessionType: string;
    topicId: number | null;
    domainId: number | null;
    startedAt: Date | string;
    completedAt: Date | string | null;
    timeSpentSeconds: number | null;
    correctAnswers: number | null;
    totalQuestions: number;
    status: string;
    syncedAt: Date | string | null;
  };
  responses: Array<{
    id: number;
    sessionId: number;
    questionId: number;
    selectedAnswers: number[];
    isCorrect: boolean;
    timeSpentSeconds: number | null;
    orderIndex: number;
    addedToSR: boolean;
  }>;
}

// ============ PERFORMANCE TRENDS TYPES ============

export type Granularity = 'attempt' | 'day' | 'week';

export interface TrendDataPoint {
  date: string;
  score: number;
  certificationId: number;
  certificationCode: string;
}

export interface TrendsResponse {
  data: TrendDataPoint[];
  totalExamCount: number;
}

// ============ QUESTION BROWSER TYPES ============

export interface QuestionBrowseParams {
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

export interface QuestionFilterOptions {
  certifications: Pick<Certification, 'id' | 'code' | 'name'>[];
  domains: Pick<Domain, 'id' | 'name' | 'certificationId'>[];
  topics: Pick<Topic, 'id' | 'name' | 'domainId'>[];
  caseStudies: Pick<CaseStudy, 'id' | 'code' | 'name' | 'certificationId'>[];
  difficulties: Difficulty[];
  totalQuestions: number;
}

// ============ CASE STUDY API TYPES ============

export interface GetCaseStudiesResponse {
  caseStudies: CaseStudyWithCertification[];
}

export interface GetCaseStudyResponse {
  caseStudy: CaseStudyWithCertification;
}

// ============ AUTHENTICATION TYPES ============

export interface User {
  id: number;
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface GoogleCallbackRequest {
  code: string;
  state?: string;
}

// ============ STREAK TYPES ============

export interface UserStreak {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null; // ISO date string YYYY-MM-DD
}

export const STREAK_MILESTONES = [7, 30, 100, 365] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

export interface StreakUpdateResponse {
  current: number;
  milestone?: StreakMilestone;
}

// ============ XP AND LEVELING TYPES ============

export interface UserXP {
  totalXp: number;
  currentLevel: number;
  levelTitle: string;
  xpToNextLevel: number;
  xpInCurrentLevel: number;
  levelProgress: number; // 0-100 percentage
}

// XP awards by activity type
export const XP_AWARDS = {
  // Question-based awards
  QUESTION_CORRECT: 10,
  QUESTION_INCORRECT: 2,

  // Exam awards
  EXAM_COMPLETE: 50,
  EXAM_PERFECT_SCORE: 100,

  // Study session awards
  STUDY_SESSION_COMPLETE: 25,

  // Drill awards
  DRILL_QUESTION: 5,
  DRILL_COMPLETE: 20,
  DRILL_PERFECT_SCORE: 50,

  // Spaced repetition awards
  SR_CARD_REVIEWED: 3,
} as const;

export type XPAwardType = keyof typeof XP_AWARDS;

// Level thresholds and titles
export interface LevelThreshold {
  level: number;
  minXp: number;
  title: string;
}

export const LEVEL_THRESHOLDS: LevelThreshold[] = [
  { level: 1, minXp: 0, title: 'Novice' },
  { level: 2, minXp: 100, title: 'Apprentice' },
  { level: 3, minXp: 300, title: 'Student' },
  { level: 4, minXp: 600, title: 'Practitioner' },
  { level: 5, minXp: 1000, title: 'Journeyman' },
  { level: 6, minXp: 1500, title: 'Expert' },
  { level: 7, minXp: 2200, title: 'Specialist' },
  { level: 8, minXp: 3000, title: 'Master' },
  { level: 9, minXp: 4000, title: 'Grandmaster' },
  { level: 10, minXp: 5500, title: 'Legend' },
  { level: 11, minXp: 7500, title: 'Mythic' },
  { level: 12, minXp: 10000, title: 'Transcendent' },
];

export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

// Calculate level info from total XP
export function calculateLevel(totalXp: number): UserXP {
  // Find the highest level the user qualifies for
  let currentLevelData = LEVEL_THRESHOLDS[0];
  let nextLevelData: LevelThreshold | undefined;

  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalXp >= LEVEL_THRESHOLDS[i].minXp) {
      currentLevelData = LEVEL_THRESHOLDS[i];
      nextLevelData = LEVEL_THRESHOLDS[i + 1];
    } else {
      break;
    }
  }

  const xpInCurrentLevel = totalXp - currentLevelData.minXp;
  const xpToNextLevel = nextLevelData ? nextLevelData.minXp - totalXp : 0; // Max level reached
  const levelRange = nextLevelData ? nextLevelData.minXp - currentLevelData.minXp : 1; // Avoid division by zero
  const levelProgress = nextLevelData
    ? Math.min(100, Math.floor((xpInCurrentLevel / levelRange) * 100))
    : 100; // Max level = 100%

  return {
    totalXp,
    currentLevel: currentLevelData.level,
    levelTitle: currentLevelData.title,
    xpToNextLevel,
    xpInCurrentLevel,
    levelProgress,
  };
}

// Response when XP is awarded
export interface XPAwardResponse {
  awarded: number;
  totalXp: number;
  currentLevel: number;
  levelTitle: string;
  newLevel?: number; // Only present if user leveled up
  newTitle?: string; // Only present if user leveled up
}

// XP History record for tracking XP gains
export interface XPHistoryRecord {
  id: number;
  userId: number;
  amount: number;
  source: XPAwardType | string; // XP_AWARDS key or custom source
  createdAt: Date | string;
}

// Human-readable labels for XP sources
export const XP_SOURCE_LABELS: Record<string, string> = {
  QUESTION_CORRECT: 'Correct Answer',
  QUESTION_INCORRECT: 'Answer Attempt',
  EXAM_COMPLETE: 'Exam Completed',
  EXAM_PERFECT_SCORE: 'Perfect Exam Score',
  STUDY_SESSION_COMPLETE: 'Study Session',
  DRILL_QUESTION: 'Drill Question',
  DRILL_COMPLETE: 'Drill Completed',
  DRILL_PERFECT_SCORE: 'Perfect Drill Score',
  SR_CARD_REVIEWED: 'Card Reviewed',
};
