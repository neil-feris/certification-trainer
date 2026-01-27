-- Add question feedback tables and columns
-- Migration: add-question-feedback

-- Add aggregate columns to questions table
ALTER TABLE questions ADD COLUMN thumbs_up_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN thumbs_down_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN is_flagged INTEGER NOT NULL DEFAULT 0;

-- Create question_feedback table
CREATE TABLE IF NOT EXISTS question_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  rating TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS question_feedback_user_question_idx ON question_feedback(user_id, question_id);
CREATE INDEX IF NOT EXISTS question_feedback_question_idx ON question_feedback(question_id);

-- Create question_reports table
CREATE TABLE IF NOT EXISTS question_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS question_reports_user_question_idx ON question_reports(user_id, question_id);
CREATE INDEX IF NOT EXISTS question_reports_question_idx ON question_reports(question_id);
CREATE INDEX IF NOT EXISTS question_reports_status_idx ON question_reports(status);
