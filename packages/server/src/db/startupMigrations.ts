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
  {
    version: 4,
    name: 'seed_pca_case_studies',
    up: (db) => {
      // Get PCA certification ID
      const pcaCert = db.prepare("SELECT id FROM certifications WHERE code = 'PCA'").get() as
        | { id: number }
        | undefined;

      if (!pcaCert) {
        console.log('  [migration] PCA certification not found, skipping case study seed');
        return;
      }

      // Check if case studies already exist
      const existingCount = db
        .prepare('SELECT COUNT(*) as count FROM case_studies WHERE certification_id = ?')
        .get(pcaCert.id) as { count: number };

      if (existingCount.count > 0) {
        console.log(`  [migration] Case studies already seeded (${existingCount.count} found)`);
        return;
      }

      // PCA Case Studies data
      const caseStudies = [
        {
          code: 'CYMBAL_RETAIL',
          name: 'Cymbal Retail',
          companyOverview:
            'Cymbal is an online retailer experiencing significant growth. The retailer specializes in a large assortment of products spanning several retail sub-verticals, which makes managing their extensive product catalog a constant challenge.',
          solutionConcept:
            'Cymbal wants to modernize its operations and enhance the customer experience in three core areas: Catalog and Content Enrichment, Conversational Commerce with Product Discovery, and Technical Stack Modernization.',
          existingTechnicalEnvironment:
            'A mix of on-premises and cloud-based systems. Various databases including MySQL, SQL Server, Redis, MongoDB. Kubernetes clusters, legacy SFTP integrations, custom web application, IVR system, and open source monitoring tools.',
          businessRequirements: JSON.stringify([
            'Automate Product Catalog Enrichment',
            'Improve Product Discoverability',
            'Increase Customer Engagement',
            'Drive Sales Conversion',
            'Reduce costs',
          ]),
          technicalRequirements: JSON.stringify([
            'Attribute Generation from supplier data',
            'Image Generation and Enhancement',
            'Automate Product Discovery with natural language',
            'Scalability and Performance',
            'Human-in-the-Loop Review UI',
            'Data Security and Compliance',
          ]),
          executiveStatement:
            'By implementing Google Cloud Generative AI solutions, Cymbal can transform its online retail operations to improve efficiency, enhance customer experience, and drive revenue growth.',
          orderIndex: 1,
        },
        {
          code: 'EHR_HEALTHCARE',
          name: 'EHR Healthcare',
          companyOverview:
            'EHR Healthcare is a leading provider of electronic health record software to the medical industry, providing software as a service to multi-national medical offices, hospitals, and insurance providers.',
          solutionConcept:
            'Due to rapid changes in the healthcare industry, EHR Healthcare needs to scale their environment, adapt disaster recovery, and roll out continuous deployment capabilities. Google Cloud has been chosen to replace their colocation facilities.',
          existingTechnicalEnvironment:
            'Software hosted in multiple colocation facilities. Customer-facing apps are containerized on Kubernetes. Data in MySQL, MS SQL Server, Redis, MongoDB. Legacy file and API integrations on-premises. Microsoft Active Directory for users.',
          businessRequirements: JSON.stringify([
            'On-board new insurance providers quickly',
            'Provide minimum 99.9% availability',
            'Centralized visibility on system performance',
            'Increase healthcare trend insights',
            'Reduce latency to all customers',
            'Maintain regulatory compliance',
            'Decrease infrastructure costs',
          ]),
          technicalRequirements: JSON.stringify([
            'Maintain legacy interfaces to insurance providers',
            'Consistent container-based application management',
            'Secure high-performance connection to Google Cloud',
            'Consistent logging, monitoring, and alerting',
            'Manage multiple container environments',
            'Dynamic scaling and provisioning',
          ]),
          executiveStatement:
            'We want to use Google Cloud to leverage a scalable, resilient platform that can span multiple environments seamlessly and provide a consistent and stable user experience that positions us for future growth.',
          orderIndex: 2,
        },
        {
          code: 'ALTOSTRAT_MEDIA',
          name: 'Altostrat Media',
          companyOverview:
            'Altostrat is a prominent player in the media industry, with an extensive collection of audio and video content comprising podcasts, interviews, news broadcasts, and documentaries.',
          solutionConcept:
            'Altostrat seeks to modernize content management and user engagement using Google Cloud generative AI, empowering customers with personalized recommendations, natural language interactions, and seamless self-service support.',
          existingTechnicalEnvironment:
            'GKE for scalability, Cloud Storage for media library, BigQuery for analytics, Cloud Run for serverless tasks. Some legacy on-premises systems for content ingestion. Google Identity and third-party auth providers.',
          businessRequirements: JSON.stringify([
            'Accelerate operational workflows',
            'Simplify infrastructure management',
            'Optimize cloud storage costs',
            'Enable natural language interaction',
            'Auto-generate content summaries',
            'Extract rich metadata from media',
            'Detect inappropriate content',
            'Analyze media for trends and insights',
          ]),
          technicalRequirements: JSON.stringify([
            'Modernize CI/CD for containerized deployments',
            'Secure hybrid cloud connectivity',
            'Scalable kubernetes environments',
            'Optimize storage costs',
            'AI-powered harmful content detection',
            'Auditable AI systems',
            'LLMs for personalized experiences',
            'Advanced chatbots with NLU',
          ]),
          executiveStatement:
            'We are embracing AI to revolutionize our content strategy, creating an unparalleled user experience with intelligent tools for content discovery, personalized recommendations, and seamless interaction.',
          orderIndex: 3,
        },
        {
          code: 'KNIGHTMOTIVES_AUTO',
          name: 'KnightMotives Automotive',
          companyOverview:
            'KnightMotives is a car manufacturer specializing in autonomous, self-driving vehicles including BEVs, hybrids, and ICE vehicles. They want to modernize the consumer experience across all vehicles within five years.',
          solutionConcept:
            'KnightMotives wants to shift from manufacturing cars to creating a complete "automotive experience" with consistent experience across models, AI-powered features, data monetization, and better tools for mechanics and salespeople.',
          existingTechnicalEnvironment:
            'Largely on-premises IT with some cloud. Outdated mainframe for supply chain, outdated ERP. Fragmented vehicle codebases with significant technical debt. Network connectivity challenges to plants and in rural areas.',
          businessRequirements: JSON.stringify([
            'Foster personalized driver relationships',
            'Create better build-to-order model',
            'Monetize corporate data',
            'Security is paramount due to past breaches',
            'EU data protection compliance',
            'Invest in autonomous driving capabilities',
            'Employee upskilling and talent attraction',
          ]),
          technicalRequirements: JSON.stringify([
            'Modernize in-vehicle experience with AI',
            'Network upgrades for data traffic',
            'Hybrid cloud strategy',
            'Autonomous vehicle development infrastructure',
            'Robust data management platform',
            'Comprehensive security framework',
            'Improved online build-to-order system',
          ]),
          executiveStatement:
            'KnightMotives is committed to enhancing safety and saving lives by leveraging data to create compelling digital experiences. Our AI consistently outperforms national safety statistics.',
          orderIndex: 4,
        },
      ];

      const insertStmt = db.prepare(`
        INSERT INTO case_studies (
          certification_id, code, name, company_overview, solution_concept,
          existing_technical_environment, business_requirements, technical_requirements,
          executive_statement, order_index, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = Date.now();
      for (const cs of caseStudies) {
        insertStmt.run(
          pcaCert.id,
          cs.code,
          cs.name,
          cs.companyOverview,
          cs.solutionConcept,
          cs.existingTechnicalEnvironment,
          cs.businessRequirements,
          cs.technicalRequirements,
          cs.executiveStatement,
          cs.orderIndex,
          now
        );
      }

      console.log(`  [migration] Seeded ${caseStudies.length} PCA case studies`);
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
