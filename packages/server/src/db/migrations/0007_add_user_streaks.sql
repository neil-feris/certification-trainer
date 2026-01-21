-- Migration: Add user_streaks table for daily streak tracking
-- Tracks consecutive days of study activity per user

CREATE TABLE IF NOT EXISTS user_streaks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date TEXT,  -- YYYY-MM-DD format for timezone-safe date comparison
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS user_streaks_user_id_idx ON user_streaks(user_id);
