-- Migration: Add qotd_selections and qotd_responses tables
-- Supports Question of the Day feature with daily question selection and user completion tracking

CREATE TABLE IF NOT EXISTS qotd_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE RESTRICT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  date_served TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS qotd_selections_cert_date_idx ON qotd_selections(certification_id, date_served);
CREATE INDEX IF NOT EXISTS qotd_selections_date_idx ON qotd_selections(date_served);

CREATE TABLE IF NOT EXISTS qotd_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qotd_selection_id INTEGER NOT NULL REFERENCES qotd_selections(id) ON DELETE CASCADE,
  selected_answers TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  completed_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS qotd_responses_user_selection_idx ON qotd_responses(user_id, qotd_selection_id);
CREATE INDEX IF NOT EXISTS qotd_responses_user_idx ON qotd_responses(user_id);
