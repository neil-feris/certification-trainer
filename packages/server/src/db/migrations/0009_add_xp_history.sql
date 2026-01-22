-- XP History table for tracking individual XP awards
CREATE TABLE IF NOT EXISTS xp_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS xp_history_user_id_idx ON xp_history(user_id);
CREATE INDEX IF NOT EXISTS xp_history_created_at_idx ON xp_history(created_at);
