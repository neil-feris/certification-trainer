-- Migration: Add composite index for readiness query pattern
-- Optimizes: WHERE user_id = ? AND domain_id IN (...)

CREATE INDEX IF NOT EXISTS stats_user_domain_idx
  ON performance_stats(user_id, domain_id);
