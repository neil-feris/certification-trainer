-- Add content_hash column for secondary deduplication of offline exam submissions
-- This catches duplicates even if offlineExamId is lost (e.g., app restart)
ALTER TABLE exams ADD COLUMN content_hash TEXT;

-- Create index for efficient duplicate lookup
CREATE INDEX IF NOT EXISTS exams_content_hash_idx ON exams(content_hash);
