-- Migration: Add readiness_snapshots table
-- Stores historical readiness score snapshots for trend visualization

CREATE TABLE IF NOT EXISTS readiness_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  overall_score REAL NOT NULL,
  domain_scores_json TEXT NOT NULL,
  calculated_at INTEGER NOT NULL
);

-- Composite index for primary query pattern: WHERE user_id = ? AND certification_id = ? ORDER BY calculated_at DESC
CREATE INDEX IF NOT EXISTS readiness_snapshots_user_cert_calc_idx
  ON readiness_snapshots(user_id, certification_id, calculated_at DESC);
-- Single-column index for cleanup/maintenance queries by date
CREATE INDEX IF NOT EXISTS readiness_snapshots_calculated_idx ON readiness_snapshots(calculated_at);
