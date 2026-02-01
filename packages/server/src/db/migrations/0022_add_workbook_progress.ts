import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../../ace-prep.db');
const db = new Database(dbPath);

console.log('Running migration: 0022_add_workbook_progress');

// Check if tables already exist
const tableExists = (name: string) => {
  const result = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
  return !!result;
};

if (!tableExists('workbook_progress')) {
  db.exec(`
    CREATE TABLE workbook_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      first_attempt_correct INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_correct INTEGER,
      mastery_level TEXT NOT NULL DEFAULT 'unattempted',
      first_attempt_at INTEGER,
      last_attempt_at INTEGER
    );

    CREATE UNIQUE INDEX workbook_progress_user_question_idx ON workbook_progress(user_id, question_id);
    CREATE INDEX workbook_progress_user_idx ON workbook_progress(user_id);
    CREATE INDEX workbook_progress_mastery_idx ON workbook_progress(user_id, mastery_level);
  `);
  console.log('Created workbook_progress table');
} else {
  console.log('workbook_progress table already exists, skipping');
}

if (!tableExists('workbook_assessments')) {
  db.exec(`
    CREATE TABLE workbook_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assessment_type TEXT NOT NULL,
      question_count INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      score REAL NOT NULL,
      time_spent_seconds INTEGER,
      completed_at INTEGER NOT NULL
    );

    CREATE INDEX workbook_assessments_user_idx ON workbook_assessments(user_id);
    CREATE INDEX workbook_assessments_type_idx ON workbook_assessments(user_id, assessment_type);
  `);
  console.log('Created workbook_assessments table');
} else {
  console.log('workbook_assessments table already exists, skipping');
}

db.close();
console.log('Migration 0022_add_workbook_progress complete');
