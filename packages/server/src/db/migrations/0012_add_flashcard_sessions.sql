-- Migration: Add flashcard_sessions and flashcard_session_ratings tables
-- Supports flashcard study mode with spaced repetition rating integration

CREATE TABLE IF NOT EXISTS flashcard_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certification_id INTEGER REFERENCES certifications(id) ON DELETE RESTRICT,
  domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  bookmarked_only INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  total_cards INTEGER NOT NULL,
  cards_reviewed INTEGER NOT NULL DEFAULT 0,
  question_ids TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  time_spent_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS flashcard_sessions_user_idx ON flashcard_sessions(user_id);
CREATE INDEX IF NOT EXISTS flashcard_sessions_status_idx ON flashcard_sessions(status);
CREATE INDEX IF NOT EXISTS flashcard_sessions_cert_idx ON flashcard_sessions(certification_id);

CREATE TABLE IF NOT EXISTS flashcard_session_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES flashcard_sessions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  rating TEXT NOT NULL,
  rated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS flashcard_ratings_session_idx ON flashcard_session_ratings(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS flashcard_ratings_session_question_idx ON flashcard_session_ratings(session_id, question_id);
