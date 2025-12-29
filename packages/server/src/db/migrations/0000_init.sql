-- Certification Trainer Database Schema
-- Supports multiple Google Cloud certifications (ACE, PCA, PDE, etc.)

-- Certifications table (parent table for all certification-specific data)
CREATE TABLE IF NOT EXISTS certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  description TEXT,
  provider TEXT NOT NULL DEFAULT 'gcp',
  exam_duration_minutes INTEGER NOT NULL DEFAULT 120,
  total_questions INTEGER NOT NULL DEFAULT 50,
  passing_score_percent INTEGER DEFAULT 70,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  weight REAL NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS domains_cert_code_idx ON domains(certification_id, code);
CREATE INDEX IF NOT EXISTS domains_cert_idx ON domains(certification_id);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL REFERENCES domains(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT
);
CREATE INDEX IF NOT EXISTS topics_domain_idx ON topics(domain_id);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  domain_id INTEGER NOT NULL REFERENCES domains(id),
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_answers TEXT NOT NULL,
  explanation TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  gcp_services TEXT,
  is_generated INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_topic_idx ON questions(topic_id);
CREATE INDEX IF NOT EXISTS questions_domain_idx ON questions(domain_id);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  time_spent_seconds INTEGER,
  total_questions INTEGER NOT NULL DEFAULT 50,
  correct_answers INTEGER,
  score REAL,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS exams_cert_idx ON exams(certification_id);

CREATE TABLE IF NOT EXISTS exam_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  selected_answers TEXT NOT NULL,
  is_correct INTEGER,
  time_spent_seconds INTEGER,
  flagged INTEGER DEFAULT 0,
  order_index INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS responses_exam_idx ON exam_responses(exam_id);

CREATE TABLE IF NOT EXISTS spaced_repetition (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval INTEGER NOT NULL DEFAULT 1,
  repetitions INTEGER NOT NULL DEFAULT 0,
  next_review_at INTEGER NOT NULL,
  last_reviewed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS sr_question_idx ON spaced_repetition(question_id);
CREATE INDEX IF NOT EXISTS sr_next_review_idx ON spaced_repetition(next_review_at);

CREATE TABLE IF NOT EXISTS performance_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL REFERENCES domains(id),
  topic_id INTEGER REFERENCES topics(id),
  total_attempts INTEGER NOT NULL DEFAULT 0,
  correct_attempts INTEGER NOT NULL DEFAULT 0,
  avg_time_seconds REAL,
  last_attempted_at INTEGER
);
CREATE INDEX IF NOT EXISTS stats_domain_idx ON performance_stats(domain_id);

CREATE TABLE IF NOT EXISTS study_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER REFERENCES domains(id),
  topic_id INTEGER REFERENCES topics(id),
  content TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  prompt TEXT
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id),
  session_type TEXT NOT NULL,
  topic_id INTEGER REFERENCES topics(id),
  domain_id INTEGER REFERENCES domains(id),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL,
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  synced_at INTEGER
);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON study_sessions(status);
CREATE INDEX IF NOT EXISTS sessions_topic_idx ON study_sessions(topic_id);
CREATE INDEX IF NOT EXISTS sessions_cert_idx ON study_sessions(certification_id);

CREATE TABLE IF NOT EXISTS study_session_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES study_sessions(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  selected_answers TEXT NOT NULL,
  is_correct INTEGER,
  time_spent_seconds INTEGER,
  order_index INTEGER NOT NULL,
  added_to_sr INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS session_responses_idx ON study_session_responses(session_id);

CREATE TABLE IF NOT EXISTS learning_path_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id),
  path_item_order INTEGER NOT NULL,
  completed_at INTEGER,
  notes TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS learning_path_cert_order_idx ON learning_path_progress(certification_id, path_item_order);
CREATE INDEX IF NOT EXISTS learning_path_cert_idx ON learning_path_progress(certification_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
