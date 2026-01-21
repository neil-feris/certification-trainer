/**
 * Startup Migrations
 *
 * Runs essential schema migrations on server startup.
 * All migrations are idempotent (safe to run multiple times).
 * Tracks applied migrations in a `_migrations` table.
 */
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve data directory - works in both dev and production
const isProduction = process.env.NODE_ENV === 'production';
const dataDir = isProduction
  ? join(__dirname, '../../../../data')
  : join(__dirname, '../../../../data');

const dbPath = join(dataDir, 'ace-prep.db');

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

/**
 * All migrations in order. Each migration must be idempotent.
 */
const migrations: Migration[] = [
  {
    version: 1,
    name: 'add_case_studies_table',
    up: (db) => {
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='case_studies'")
        .get();

      if (!tableExists) {
        db.exec(`
          CREATE TABLE case_studies (
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

        db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS case_studies_cert_code_idx ON case_studies(certification_id, code);
          CREATE INDEX IF NOT EXISTS case_studies_cert_idx ON case_studies(certification_id);
        `);

        console.log('  [migration] Created case_studies table');
      }
    },
  },
  {
    version: 2,
    name: 'add_case_study_id_to_questions',
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info('questions')").all() as Array<{
        name: string;
      }>;
      const hasCaseStudyId = columns.some((col) => col.name === 'case_study_id');

      if (!hasCaseStudyId) {
        db.exec(`
          ALTER TABLE questions ADD COLUMN case_study_id INTEGER REFERENCES case_studies(id) ON DELETE SET NULL
        `);
        db.exec(`
          CREATE INDEX IF NOT EXISTS questions_case_study_idx ON questions(case_study_id)
        `);
        console.log('  [migration] Added case_study_id column to questions');
      }
    },
  },
  {
    version: 3,
    name: 'add_capabilities_to_certifications',
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info('certifications')").all() as Array<{
        name: string;
      }>;
      const hasCapabilities = columns.some((col) => col.name === 'capabilities');

      if (!hasCapabilities) {
        db.exec(`
          ALTER TABLE certifications ADD COLUMN capabilities TEXT DEFAULT '{"hasCaseStudies":false}'
        `);
        console.log('  [migration] Added capabilities column to certifications');
      }

      // Always ensure PCA has case studies enabled
      const result = db
        .prepare("UPDATE certifications SET capabilities = ? WHERE code = 'PCA'")
        .run('{"hasCaseStudies":true}');

      if (result.changes > 0) {
        console.log('  [migration] Updated PCA capabilities');
      }
    },
  },
];

/**
 * Ensures the migrations tracking table exists
 */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _startup_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);
}

/**
 * Gets list of already applied migration versions
 */
function getAppliedMigrations(db: Database.Database): Set<number> {
  const rows = db.prepare('SELECT version FROM _startup_migrations').all() as Array<{
    version: number;
  }>;
  return new Set(rows.map((r) => r.version));
}

/**
 * Records a migration as applied
 */
function recordMigration(db: Database.Database, migration: Migration): void {
  db.prepare('INSERT INTO _startup_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
    migration.version,
    migration.name,
    Date.now()
  );
}

/**
 * Runs all pending migrations
 * Called automatically on server startup
 * @returns Number of migrations applied
 */
export function runStartupMigrations(): number {
  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    console.log('[migrations] Created data directory');
  }

  if (!existsSync(dbPath)) {
    console.log('[migrations] Database not found, skipping (will be created by setup)');
    return 0;
  }

  const db = new Database(dbPath);
  let applied = 0;

  try {
    // Ensure migrations table exists
    ensureMigrationsTable(db);

    // Get already applied migrations
    const appliedMigrations = getAppliedMigrations(db);

    // Run pending migrations in order
    for (const migration of migrations) {
      if (appliedMigrations.has(migration.version)) {
        continue;
      }

      console.log(`[migrations] Running: ${migration.name}`);

      // Run migration in a transaction
      db.transaction(() => {
        migration.up(db);
        recordMigration(db, migration);
      })();

      applied++;
    }

    if (applied > 0) {
      console.log(`[migrations] Applied ${applied} migration(s)`);
    }

    return applied;
  } catch (error) {
    console.error('[migrations] Error running migrations:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Allow running directly: npx tsx packages/server/src/db/startupMigrations.ts
const isDirectRun =
  process.argv[1]?.endsWith('startupMigrations.ts') ||
  process.argv[1]?.endsWith('startupMigrations.js');

if (isDirectRun) {
  console.log('[migrations] Running startup migrations directly...');
  const count = runStartupMigrations();
  console.log(`[migrations] Complete. Applied ${count} migration(s).`);
}
