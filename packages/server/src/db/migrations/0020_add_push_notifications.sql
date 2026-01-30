-- Push Subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_idx ON push_subscriptions(user_id, endpoint);

-- Notification Preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  streak_reminders INTEGER NOT NULL DEFAULT 1,
  review_reminders INTEGER NOT NULL DEFAULT 1,
  qotd_reminders INTEGER NOT NULL DEFAULT 1,
  preferred_time TEXT NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  last_notified_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_idx ON notification_preferences(user_id);
