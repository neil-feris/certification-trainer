-- Migration: Add bookmarks and user_notes tables
-- Supports bookmarking questions/topics/domains and personal notes on questions

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_target_idx ON bookmarks(user_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS bookmarks_user_idx ON bookmarks(user_id);

CREATE TABLE IF NOT EXISTS user_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS user_notes_user_question_idx ON user_notes(user_id, question_id);
CREATE INDEX IF NOT EXISTS user_notes_user_idx ON user_notes(user_id);
