-- Migration: Add learning path summaries table for caching AI-generated content
-- This table stores generated summaries to avoid repeated LLM calls

CREATE TABLE IF NOT EXISTS learning_path_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  path_item_order INTEGER NOT NULL,
  overview TEXT NOT NULL,
  key_takeaways TEXT NOT NULL,
  important_concepts TEXT NOT NULL,
  exam_tips TEXT NOT NULL,
  related_topic_ids TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  is_enhanced INTEGER DEFAULT 0
);

-- Unique index to ensure one summary per learning path item per certification
CREATE UNIQUE INDEX IF NOT EXISTS learning_path_summary_cert_order_idx ON learning_path_summaries(certification_id, path_item_order);

-- Index for efficient certification-scoped queries
CREATE INDEX IF NOT EXISTS learning_path_summary_cert_idx ON learning_path_summaries(certification_id);
