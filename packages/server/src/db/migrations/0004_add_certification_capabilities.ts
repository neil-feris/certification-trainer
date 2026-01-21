/**
 * Migration: Add capabilities column to certifications table
 * This adds feature flags for certifications (e.g., hasCaseStudies).
 * Safe to run multiple times - checks for existing column before adding.
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

console.log('Running migration: Add Certification Capabilities...');

// Check if capabilities column already exists
const columns = db.prepare("PRAGMA table_info('certifications')").all() as Array<{ name: string }>;
const hasCapabilities = columns.some((col) => col.name === 'capabilities');

if (hasCapabilities) {
  console.log('capabilities column already exists. Skipping.');
} else {
  // Add capabilities column with default value
  db.exec(`
    ALTER TABLE certifications ADD COLUMN capabilities TEXT DEFAULT '{"hasCaseStudies":false}';
  `);
  console.log('Added capabilities column to certifications table.');

  // Update PCA to have case studies enabled
  db.exec(`
    UPDATE certifications SET capabilities = '{"hasCaseStudies":true}' WHERE code = 'PCA';
  `);
  console.log('Set hasCaseStudies=true for PCA certification.');
}

console.log('Migration complete!');
db.close();
