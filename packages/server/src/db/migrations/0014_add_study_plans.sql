-- Migration: Add study_plans, study_plan_days, and study_plan_tasks tables
-- Supports personalized day-by-day study schedules based on exam date and readiness

CREATE TABLE IF NOT EXISTS study_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE RESTRICT,
  target_exam_date TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS study_plans_user_status_idx ON study_plans(user_id, status);
CREATE INDEX IF NOT EXISTS study_plans_cert_idx ON study_plans(certification_id);
CREATE INDEX IF NOT EXISTS study_plans_user_cert_idx ON study_plans(user_id, certification_id);

CREATE TABLE IF NOT EXISTS study_plan_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_plan_id INTEGER NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  is_complete INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS study_plan_days_plan_idx ON study_plan_days(study_plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS study_plan_days_plan_date_idx ON study_plan_days(study_plan_id, date);

CREATE TABLE IF NOT EXISTS study_plan_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_plan_day_id INTEGER NOT NULL REFERENCES study_plan_days(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  target_id INTEGER,
  estimated_minutes INTEGER NOT NULL,
  completed_at INTEGER,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS study_plan_tasks_day_idx ON study_plan_tasks(study_plan_day_id);
