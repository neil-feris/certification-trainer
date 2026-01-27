-- Migration: Add certificates table
-- Stores completion certificates for passing practice exams with verification hash

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE RESTRICT,
  certificate_hash TEXT NOT NULL UNIQUE,
  score REAL NOT NULL,
  issued_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS certificates_hash_idx ON certificates(certificate_hash);
CREATE INDEX IF NOT EXISTS certificates_exam_idx ON certificates(exam_id);
CREATE INDEX IF NOT EXISTS certificates_user_idx ON certificates(user_id);
CREATE INDEX IF NOT EXISTS certificates_certification_idx ON certificates(certification_id);
