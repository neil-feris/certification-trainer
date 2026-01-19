-- Migration: Add userId foreign keys to user-data tables
-- This migration adds nullable userId columns to support multi-user authentication
-- Existing data retains null userId (will be migrated on first login)

-- Add userId to exams table
ALTER TABLE exams ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS exams_user_idx ON exams(user_id);

-- Add userId to exam_responses table
ALTER TABLE exam_responses ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS responses_user_idx ON exam_responses(user_id);

-- Add userId to study_sessions table
ALTER TABLE study_sessions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS sessions_user_idx ON study_sessions(user_id);

-- Add userId to study_session_responses table
ALTER TABLE study_session_responses ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS session_responses_user_idx ON study_session_responses(user_id);

-- Add userId to spaced_repetition table
ALTER TABLE spaced_repetition ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
-- Drop old unique index and create new one that includes userId
DROP INDEX IF EXISTS sr_question_idx;
CREATE UNIQUE INDEX IF NOT EXISTS sr_user_question_idx ON spaced_repetition(user_id, question_id);
CREATE INDEX IF NOT EXISTS sr_user_idx ON spaced_repetition(user_id);

-- Add userId to performance_stats table
ALTER TABLE performance_stats ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS stats_user_idx ON performance_stats(user_id);

-- Add userId to learning_path_progress table
ALTER TABLE learning_path_progress ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
-- Drop old unique index and create new one that includes userId
DROP INDEX IF EXISTS learning_path_cert_order_idx;
CREATE UNIQUE INDEX IF NOT EXISTS learning_path_user_cert_order_idx ON learning_path_progress(user_id, certification_id, path_item_order);
CREATE INDEX IF NOT EXISTS learning_path_user_idx ON learning_path_progress(user_id);

-- Create user_settings table for per-user configuration
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_key_idx ON user_settings(user_id, key);
CREATE INDEX IF NOT EXISTS user_settings_user_idx ON user_settings(user_id);
