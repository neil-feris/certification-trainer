/**
 * Database migration runner
 * Executes SQL migration files in order, tracking applied migrations in _migrations table
 */
import Database from 'better-sqlite3';
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../../../data');

// Ensure data directory exists
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'ace-prep.db');
const db = new Database(dbPath);

// Enable WAL mode
db.pragma('journal_mode = WAL');

const migrationsDir = join(__dirname, 'migrations');

// Create migrations tracking table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )
`);

// Get list of already applied migrations
const appliedMigrations = new Set(
  (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((row) => row.name)
);

// Get all SQL migration files, sorted by filename prefix
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort((a, b) => {
    const numA = parseInt(a.split('_')[0], 10);
    const numB = parseInt(b.split('_')[0], 10);
    return numA - numB;
  });

console.log(`Found ${migrationFiles.length} migration files`);

let appliedCount = 0;
let skippedCount = 0;

for (const file of migrationFiles) {
  if (appliedMigrations.has(file)) {
    skippedCount++;
    continue;
  }

  console.log(`Applying migration: ${file}`);

  const migrationPath = join(migrationsDir, file);
  const migrationSql = readFileSync(migrationPath, 'utf-8');

  // Run migration in a transaction
  db.exec('BEGIN TRANSACTION');
  try {
    // Split by semicolon, strip comments, filter empty statements
    const statements = migrationSql
      .split(';')
      .map((s) => {
        // Remove SQL comments (lines starting with --)
        return s
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
      })
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch (err: unknown) {
        const error = err as Error;
        // Ignore common idempotent errors
        if (
          error.message.includes('duplicate column') ||
          error.message.includes('already exists')
        ) {
          console.log(`  (skipped: ${error.message})`);
          continue;
        }
        throw err;
      }
    }

    // Record migration as applied
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);

    db.exec('COMMIT');
    console.log(`  Applied successfully`);
    appliedCount++;
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(`Failed to apply migration ${file}:`, err);
    db.close();
    process.exit(1);
  }
}

console.log('');
console.log(`Migrations complete: ${appliedCount} applied, ${skippedCount} already up-to-date`);

db.close();
