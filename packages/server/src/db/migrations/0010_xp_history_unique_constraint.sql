-- Add unique constraint on (user_id, source) to enforce XP idempotency at DB level
CREATE UNIQUE INDEX IF NOT EXISTS xp_history_user_source_idx ON xp_history(user_id, source);
