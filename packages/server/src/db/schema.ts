import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  ]
);

// Practice exams
export const exams = sqliteTable(
  'exams',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
  (table) => [index('exams_cert_idx').on(table.certificationId)]
);

// Individual exam responses
export const examResponses = sqliteTable(
  'exam_responses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
  ]
);

// Spaced repetition tracking (SM-2 algorithm)
export const spacedRepetition = sqliteTable(
  'spaced_repetition',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
    uniqueIndex('sr_question_idx').on(table.questionId),
    index('sr_next_review_idx').on(table.nextReviewAt),
  ]
);

// Performance by domain/topic aggregates
export const performanceStats = sqliteTable(
  'performance_stats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    domainId: integer('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    topicId: integer('topic_id').references(() => topics.id, { onDelete: 'cascade' }),
    totalAttempts: integer('total_attempts').notNull().default(0),
    correctAttempts: integer('correct_attempts').notNull().default(0),
    avgTimeSeconds: real('avg_time_seconds'),
    lastAttemptedAt: integer('last_attempted_at', { mode: 'timestamp' }),
  },
  (table) => [index('stats_domain_idx').on(table.domainId)]
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
  ]
);

// Responses within study sessions
export const studySessionResponses = sqliteTable(
  'study_session_responses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
    // Prevent duplicate responses for the same question in a session
    uniqueIndex('session_question_unique_idx').on(table.sessionId, table.questionId),
  ]
);

// Learning path completion tracking
export const learningPathProgress = sqliteTable(
  'learning_path_progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    certificationId: integer('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    pathItemOrder: integer('path_item_order').notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    notes: text('notes'),
  },
  (table) => [
    uniqueIndex('learning_path_cert_order_idx').on(table.certificationId, table.pathItemOrder),
    index('learning_path_cert_idx').on(table.certificationId),
  ]
);

// Settings (API keys stored encrypted)
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Type exports for Drizzle
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
export type StudySession = typeof studySessions.$inferSelect;
export type NewStudySession = typeof studySessions.$inferInsert;
export type StudySessionResponseRecord = typeof studySessionResponses.$inferSelect;
export type NewStudySessionResponse = typeof studySessionResponses.$inferInsert;
export type LearningPathProgressRecord = typeof learningPathProgress.$inferSelect;
