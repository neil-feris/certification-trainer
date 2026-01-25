-- Add offlineExamId column for offline exam duplicate prevention
ALTER TABLE exams ADD COLUMN offline_exam_id TEXT;

-- Create index for efficient duplicate detection
CREATE INDEX IF NOT EXISTS exams_offline_id_idx ON exams(offline_exam_id);
