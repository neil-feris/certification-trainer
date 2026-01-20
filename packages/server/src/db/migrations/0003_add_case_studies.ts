/**
 * Migration: Add Case Studies table and case_study_id to questions
 * This migration adds case study support without affecting existing data.
 * Safe to run multiple times - checks for existing tables/columns before creating.
 */
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../../../../data');
const dbPath = join(dataDir, 'ace-prep.db');

if (!existsSync(dbPath)) {
  console.error('Database not found at:', dbPath);
  console.error('Run npm run db:setup first to create the database.');
  process.exit(1);
}

const db = new Database(dbPath);

console.log('Running migration: Add Case Studies...');

// Check if case_studies table already exists
const tableExists = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='case_studies'")
  .get();

if (tableExists) {
  console.log('case_studies table already exists. Skipping table creation.');
} else {
  // Create case_studies table
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_studies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE RESTRICT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      company_overview TEXT NOT NULL,
      solution_concept TEXT NOT NULL,
      existing_technical_environment TEXT NOT NULL,
      business_requirements TEXT NOT NULL,
      technical_requirements TEXT NOT NULL,
      executive_statement TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Create indexes
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS case_studies_cert_code_idx ON case_studies(certification_id, code);
    CREATE INDEX IF NOT EXISTS case_studies_cert_idx ON case_studies(certification_id);
  `);

  console.log('Created case_studies table with indexes.');
}

// Check if case_study_id column exists in questions table
const questionColumns = db.prepare("PRAGMA table_info('questions')").all() as Array<{
  name: string;
}>;
const hasCaseStudyId = questionColumns.some((col) => col.name === 'case_study_id');

if (hasCaseStudyId) {
  console.log('questions.case_study_id column already exists. Skipping column addition.');
} else {
  // Add case_study_id column to questions table (nullable for backward compatibility)
  db.exec(`
    ALTER TABLE questions ADD COLUMN case_study_id INTEGER REFERENCES case_studies(id) ON DELETE SET NULL;
  `);

  // Create index for the new column
  db.exec(`
    CREATE INDEX IF NOT EXISTS questions_case_study_idx ON questions(case_study_id);
  `);

  console.log('Added case_study_id column to questions table with index.');
}

console.log('Migration complete!');

db.close();
