-- Migration: Add multi-certification support
-- This migration upgrades existing databases to support multiple certifications

-- Step 1: Create certifications table if not exists
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

-- Step 2: Insert default ACE certification if none exist
INSERT OR IGNORE INTO certifications (code, name, short_name, description, provider, exam_duration_minutes, total_questions, passing_score_percent, is_active, created_at)
SELECT 'ACE', 'Associate Cloud Engineer', 'ACE',
       'An Associate Cloud Engineer deploys and secures applications and infrastructure, monitors operations, and manages enterprise solutions.',
       'gcp', 120, 50, 70, 1, strftime('%s', 'now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM certifications LIMIT 1);

-- Step 3: Add certification_id columns (nullable first for existing data)
-- Domains table
ALTER TABLE domains ADD COLUMN certification_id INTEGER REFERENCES certifications(id);

-- Exams table
ALTER TABLE exams ADD COLUMN certification_id INTEGER REFERENCES certifications(id);

-- Study sessions table
ALTER TABLE study_sessions ADD COLUMN certification_id INTEGER REFERENCES certifications(id);

-- Learning path progress table
ALTER TABLE learning_path_progress ADD COLUMN certification_id INTEGER REFERENCES certifications(id);

-- Step 4: Backfill existing data with ACE certification ID
UPDATE domains SET certification_id = (SELECT id FROM certifications WHERE code = 'ACE' LIMIT 1) WHERE certification_id IS NULL;
UPDATE exams SET certification_id = (SELECT id FROM certifications WHERE code = 'ACE' LIMIT 1) WHERE certification_id IS NULL;
UPDATE study_sessions SET certification_id = (SELECT id FROM certifications WHERE code = 'ACE' LIMIT 1) WHERE certification_id IS NULL;
UPDATE learning_path_progress SET certification_id = (SELECT id FROM certifications WHERE code = 'ACE' LIMIT 1) WHERE certification_id IS NULL;

-- Step 5: Drop old unique constraint on domains.code and learning_path_progress.path_item_order
-- Note: SQLite doesn't support DROP CONSTRAINT, so we recreate with new constraints via indexes

-- Step 6: Create new indexes for certification-scoped queries
CREATE UNIQUE INDEX IF NOT EXISTS domains_cert_code_idx ON domains(certification_id, code);
CREATE INDEX IF NOT EXISTS domains_cert_idx ON domains(certification_id);
CREATE INDEX IF NOT EXISTS exams_cert_idx ON exams(certification_id);
CREATE INDEX IF NOT EXISTS sessions_cert_idx ON study_sessions(certification_id);
CREATE UNIQUE INDEX IF NOT EXISTS learning_path_cert_order_idx ON learning_path_progress(certification_id, path_item_order);
CREATE INDEX IF NOT EXISTS learning_path_cert_idx ON learning_path_progress(certification_id);
