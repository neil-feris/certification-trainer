import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ============ USERS ============
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    googleId: text('google_id').notNull().unique(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    picture: text('picture'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  },
  (table) => [
    uniqueIndex('users_google_id_idx').on(table.googleId),
    uniqueIndex('users_email_idx').on(table.email),
  ]
);

// Case Studies (for PCA certification)
export const caseStudies = sqliteTable(
  'case_studies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    certificationId: integer('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    companyOverview: text('company_overview').notNull(),
    solutionConcept: text('solution_concept').notNull(),
    existingTechnicalEnvironment: text('existing_technical_environment').notNull(),
    businessRequirements: text('business_requirements').notNull(), // JSON array
    technicalRequirements: text('technical_requirements').notNull(), // JSON array
    executiveStatement: text('executive_statement').notNull(),
    orderIndex: integer('order_index').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('case_studies_cert_code_idx').on(table.certificationId, table.code),
    index('case_studies_cert_idx').on(table.certificationId),
  ]
);

// Certifications (supports multiple Google Cloud certifications)
export const certifications = sqliteTable('certifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(), // 'ACE', 'PCA', 'PDE', etc.
  name: text('name').notNull(), // 'Associate Cloud Engineer'
  shortName: text('short_name').notNull(), // 'ACE'
  description: text('description'),
  provider: text('provider').notNull().default('gcp'), // 'gcp', 'aws', 'azure'
  examDurationMinutes: integer('exam_duration_minutes').notNull().default(120),
  totalQuestions: integer('total_questions').notNull().default(50),
  passingScorePercent: integer('passing_score_percent').default(70),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  capabilities: text('capabilities').notNull().default('{"hasCaseStudies":false}'), // JSON object for feature flags
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Exam Domains (linked to certification)
export const domains = sqliteTable(
  'domains',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    certificationId: integer('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    weight: real('weight').notNull(),
    description: text('description'),
    orderIndex: integer('order_index').notNull(),
  },
  (table) => [
    uniqueIndex('domains_cert_code_idx').on(table.certificationId, table.code),
    index('domains_cert_idx').on(table.certificationId),
  ]
);

// Topics within domains
export const topics = sqliteTable(
  'topics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    domainId: integer('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
  },
  (table) => [index('topics_domain_idx').on(table.domainId)]
);

// Question bank
export const questions = sqliteTable(
  'questions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    topicId: integer('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'restrict' }),
    domainId: integer('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'restrict' }),
    caseStudyId: integer('case_study_id').references(() => caseStudies.id, {
      onDelete: 'set null',
    }),
    questionText: text('question_text').notNull(),
    questionType: text('question_type').notNull(), // 'single' | 'multiple'
    options: text('options').notNull(), // JSON array
    correctAnswers: text('correct_answers').notNull(), // JSON array of indices
    explanation: text('explanation').notNull(),
    difficulty: text('difficulty').notNull(), // 'easy' | 'medium' | 'hard'
    gcpServices: text('gcp_services'), // JSON array
    isGenerated: integer('is_generated', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('questions_topic_idx').on(table.topicId),
    index('questions_domain_idx').on(table.domainId),
    index('questions_case_study_idx').on(table.caseStudyId),
  ]
);

// Practice exams
export const exams = sqliteTable(
  'exams',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    certificationId: integer('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'restrict' }),
    startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    timeSpentSeconds: integer('time_spent_seconds'),
    totalQuestions: integer('total_questions').notNull().default(50),
    correctAnswers: integer('correct_answers'),
    score: real('score'), // Percentage 0-100
    status: text('status').notNull(), // 'in_progress' | 'completed' | 'abandoned'
  },
  (table) => [
    index('exams_cert_idx').on(table.certificationId),
    index('exams_user_idx').on(table.userId),
  ]
);

// Individual exam responses
export const examResponses = sqliteTable(
  'exam_responses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    examId: integer('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    selectedAnswers: text('selected_answers').notNull(), // JSON array
    isCorrect: integer('is_correct', { mode: 'boolean' }),
    timeSpentSeconds: integer('time_spent_seconds'),
    flagged: integer('flagged', { mode: 'boolean' }).default(false),
    orderIndex: integer('order_index').notNull(),
  },
  (table) => [
    index('responses_exam_idx').on(table.examId),
    index('responses_question_idx').on(table.questionId),
    index('responses_user_idx').on(table.userId),
  ]
);

// Spaced repetition tracking (SM-2 algorithm)
export const spacedRepetition = sqliteTable(
  'spaced_repetition',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    easeFactor: real('ease_factor').notNull().default(2.5),
    interval: integer('interval').notNull().default(1), // Days
    repetitions: integer('repetitions').notNull().default(0),
    nextReviewAt: integer('next_review_at', { mode: 'timestamp' }).notNull(),
    lastReviewedAt: integer('last_reviewed_at', { mode: 'timestamp' }),
  },
  (table) => [
    uniqueIndex('sr_user_question_idx').on(table.userId, table.questionId),
    index('sr_next_review_idx').on(table.nextReviewAt),
    index('sr_user_idx').on(table.userId),
  ]
);

// Performance by domain/topic aggregates
export const performanceStats = sqliteTable(
  'performance_stats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    domainId: integer('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    topicId: integer('topic_id').references(() => topics.id, { onDelete: 'cascade' }),
    totalAttempts: integer('total_attempts').notNull().default(0),
    correctAttempts: integer('correct_attempts').notNull().default(0),
    avgTimeSeconds: real('avg_time_seconds'),
    lastAttemptedAt: integer('last_attempted_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('stats_domain_idx').on(table.domainId),
    index('stats_user_idx').on(table.userId),
  ]
);

// Readiness score snapshots (historical tracking)
export const readinessSnapshots = sqliteTable(
  'readiness_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    certificationId: integer('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    overallScore: real('overall_score').notNull(),
    domainScoresJson: text('domain_scores_json').notNull(), // JSON object of domain scores
    calculatedAt: integer('calculated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    // Composite index for primary query: WHERE user_id = ? AND certification_id = ? ORDER BY calculated_at DESC
    index('readiness_snapshots_user_cert_calc_idx').on(table.userId, table.certificationId, table.calculatedAt),
    // Single-column index for cleanup/maintenance queries by date
    index('readiness_snapshots_calculated_idx').on(table.calculatedAt),
  ]
);

// Study summaries generated by LLM
export const studySummaries = sqliteTable('study_summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  domainId: integer('domain_id').references(() => domains.id, { onDelete: 'cascade' }),
  topicId: integer('topic_id').references(() => topics.id, { onDelete: 'cascade' }),
  content: text('content').notNull(), // Markdown content
  generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
  prompt: text('prompt'),
});

// Study sessions (practice sessions)
export const studySessions = sqliteTable(
  'study_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    certificationId: integer('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'restrict' }),
    sessionType: text('session_type').notNull(), // 'topic_practice' | 'learning_path'
    topicId: integer('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    domainId: integer('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    status: text('status').notNull(), // 'in_progress' | 'completed' | 'abandoned'
    totalQuestions: integer('total_questions').notNull().default(0),
    correctAnswers: integer('correct_answers').default(0),
    timeSpentSeconds: integer('time_spent_seconds').default(0),
    syncedAt: integer('synced_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('sessions_status_idx').on(table.status),
    index('sessions_topic_idx').on(table.topicId),
    index('sessions_cert_idx').on(table.certificationId),
    index('sessions_user_idx').on(table.userId),
  ]
);

// Responses within study sessions
export const studySessionResponses = sqliteTable(
  'study_session_responses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => studySessions.id, { onDelete: 'cascade' }),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    selectedAnswers: text('selected_answers').notNull(), // JSON array
    isCorrect: integer('is_correct', { mode: 'boolean' }),
    timeSpentSeconds: integer('time_spent_seconds'),
    orderIndex: integer('order_index').notNull(),
    addedToSR: integer('added_to_sr', { mode: 'boolean' }).default(false),
  },
  (table) => [
    index('session_responses_idx').on(table.sessionId),
    index('session_responses_user_idx').on(table.userId),
    // Prevent duplicate responses for the same question in a session
    uniqueIndex('session_question_unique_idx').on(table.sessionId, table.questionId),
  ]
);

// Learning path AI-generated summaries (cached)
export const learningPathSummaries = sqliteTable(
  'learning_path_summaries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    certificationId: integer('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    pathItemOrder: integer('path_item_order').notNull(),
    overview: text('overview').notNull(),
    keyTakeaways: text('key_takeaways').notNull(), // JSON array of strings
    importantConcepts: text('important_concepts').notNull(), // JSON array of strings
    examTips: text('exam_tips').notNull(), // JSON array of strings
    relatedTopicIds: text('related_topic_ids').notNull(), // JSON array of numbers
    generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
    isEnhanced: integer('is_enhanced', { mode: 'boolean' }).default(false),
  },
  (table) => [
    uniqueIndex('learning_path_summary_cert_order_idx').on(
      table.certificationId,
      table.pathItemOrder
    ),
    index('learning_path_summary_cert_idx').on(table.certificationId),
  ]
);

// Learning path completion tracking
export const learningPathProgress = sqliteTable(
  'learning_path_progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    certificationId: integer('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    pathItemOrder: integer('path_item_order').notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    notes: text('notes'),
  },
  (table) => [
    uniqueIndex('learning_path_user_cert_order_idx').on(
      table.userId,
      table.certificationId,
      table.pathItemOrder
    ),
    index('learning_path_cert_idx').on(table.certificationId),
    index('learning_path_user_idx').on(table.userId),
  ]
);

// ============ USER XP & LEVELING ============
export const userXp = sqliteTable(
  'user_xp',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    totalXp: integer('total_xp').notNull().default(0),
    currentLevel: integer('current_level').notNull().default(1),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [uniqueIndex('user_xp_user_id_idx').on(table.userId)]
);

// XP History (tracks individual XP awards)
export const xpHistory = sqliteTable(
  'xp_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    source: text('source').notNull(), // XP_AWARDS key or custom source
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('xp_history_user_source_idx').on(table.userId, table.source),
    index('xp_history_user_id_idx').on(table.userId),
    index('xp_history_created_at_idx').on(table.createdAt),
  ]
);

// ============ USER STREAKS ============
export const userStreaks = sqliteTable(
  'user_streaks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    currentStreak: integer('current_streak').notNull().default(0),
    longestStreak: integer('longest_streak').notNull().default(0),
    lastActivityDate: text('last_activity_date'), // YYYY-MM-DD format
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [uniqueIndex('user_streaks_user_id_idx').on(table.userId)]
);

// ============ ACHIEVEMENTS ============
export const achievements = sqliteTable(
  'achievements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    rarity: text('rarity').notNull(), // 'common' | 'rare' | 'epic'
    icon: text('icon').notNull(),
    criteriaType: text('criteria_type').notNull(),
    criteriaJson: text('criteria_json').notNull(), // JSON object with criteria details
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [uniqueIndex('achievements_code_idx').on(table.code)]
);

export const userAchievements = sqliteTable(
  'user_achievements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievementCode: text('achievement_code').notNull(),
    xpAwarded: integer('xp_awarded').notNull(),
    unlockedAt: integer('unlocked_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('user_achievements_user_code_idx').on(table.userId, table.achievementCode),
    index('user_achievements_user_idx').on(table.userId),
  ]
);

// ============ BOOKMARKS & NOTES ============
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(), // 'question' | 'topic' | 'domain'
    targetId: integer('target_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('bookmarks_user_target_idx').on(table.userId, table.targetType, table.targetId),
    index('bookmarks_user_idx').on(table.userId),
  ]
);

export const userNotes = sqliteTable(
  'user_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('user_notes_user_question_idx').on(table.userId, table.questionId),
    index('user_notes_user_idx').on(table.userId),
  ]
);

// Settings (API keys stored encrypted) - global settings for anonymous users
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// User-specific settings (for authenticated users)
export const userSettings = sqliteTable(
  'user_settings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('user_settings_user_key_idx').on(table.userId, table.key),
    index('user_settings_user_idx').on(table.userId),
  ]
);

// Type exports for Drizzle
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CaseStudyRecord = typeof caseStudies.$inferSelect;
export type NewCaseStudy = typeof caseStudies.$inferInsert;
export type Certification = typeof certifications.$inferSelect;
export type NewCertification = typeof certifications.$inferInsert;
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;
export type ExamResponse = typeof examResponses.$inferSelect;
export type NewExamResponse = typeof examResponses.$inferInsert;
export type SpacedRepetition = typeof spacedRepetition.$inferSelect;
export type PerformanceStat = typeof performanceStats.$inferSelect;
export type StudySummary = typeof studySummaries.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type UserSetting = typeof userSettings.$inferSelect;
export type NewUserSetting = typeof userSettings.$inferInsert;
export type StudySession = typeof studySessions.$inferSelect;
export type NewStudySession = typeof studySessions.$inferInsert;
export type StudySessionResponseRecord = typeof studySessionResponses.$inferSelect;
export type NewStudySessionResponse = typeof studySessionResponses.$inferInsert;
export type LearningPathProgressRecord = typeof learningPathProgress.$inferSelect;
export type LearningPathSummaryRecord = typeof learningPathSummaries.$inferSelect;
export type NewLearningPathSummary = typeof learningPathSummaries.$inferInsert;
export type UserStreakRecord = typeof userStreaks.$inferSelect;
export type NewUserStreak = typeof userStreaks.$inferInsert;
export type UserXpRecord = typeof userXp.$inferSelect;
export type NewUserXp = typeof userXp.$inferInsert;
export type XpHistoryRecord = typeof xpHistory.$inferSelect;
export type NewXpHistory = typeof xpHistory.$inferInsert;
export type AchievementRecord = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
export type UserAchievementRecord = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
export type BookmarkRecord = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type UserNoteRecord = typeof userNotes.$inferSelect;
export type NewUserNote = typeof userNotes.$inferInsert;
export type ReadinessSnapshotRecord = typeof readinessSnapshots.$inferSelect;
export type NewReadinessSnapshot = typeof readinessSnapshots.$inferInsert;
