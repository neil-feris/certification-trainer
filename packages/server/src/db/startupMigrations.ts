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
  {
    version: 5,
    name: 'add_achievement_tables',
    up: (db) => {
      // Create achievements table
      const achievementsExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='achievements'")
        .get();

      if (!achievementsExists) {
        db.exec(`
          CREATE TABLE achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            rarity TEXT NOT NULL,
            icon TEXT NOT NULL,
            criteria_type TEXT NOT NULL,
            criteria_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `);
        db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS achievements_code_idx ON achievements(code)
        `);
        console.log('  [migration] Created achievements table');
      }

      // Create user_achievements table
      const userAchievementsExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_achievements'")
        .get();

      if (!userAchievementsExists) {
        db.exec(`
          CREATE TABLE user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            achievement_code TEXT NOT NULL,
            xp_awarded INTEGER NOT NULL,
            unlocked_at INTEGER NOT NULL
          )
        `);
        db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS user_achievements_user_code_idx ON user_achievements(user_id, achievement_code);
          CREATE INDEX IF NOT EXISTS user_achievements_user_idx ON user_achievements(user_id);
        `);
        console.log('  [migration] Created user_achievements table');
      }
    },
  },
  {
    version: 6,
    name: 'seed_achievement_definitions',
    up: (db) => {
      const achievementDefinitions = [
        {
          code: 'first-steps',
          name: 'First Steps',
          description: 'Complete your first exam or study session',
          rarity: 'common',
          icon: '👣',
          criteriaType: 'first_activity',
          criteriaJson: JSON.stringify({ type: 'first_activity', activity: 'any' }),
        },
        {
          code: 'perfect-score',
          name: 'Perfect Score',
          description: 'Score 100% on any exam',
          rarity: 'rare',
          icon: '💯',
          criteriaType: 'perfect_score',
          criteriaJson: JSON.stringify({ type: 'perfect_score', scorePercent: 100 }),
        },
        {
          code: 'consistent-7',
          name: 'Week Warrior',
          description: 'Maintain a 7-day study streak',
          rarity: 'common',
          icon: '🔥',
          criteriaType: 'streak',
          criteriaJson: JSON.stringify({ type: 'streak', days: 7 }),
        },
        {
          code: 'dedicated-30',
          name: 'Dedicated Learner',
          description: 'Maintain a 30-day study streak',
          rarity: 'rare',
          icon: '📅',
          criteriaType: 'streak',
          criteriaJson: JSON.stringify({ type: 'streak', days: 30 }),
        },
        {
          code: 'century-streak',
          name: 'Century Streak',
          description: 'Maintain a 100-day study streak',
          rarity: 'epic',
          icon: '🏆',
          criteriaType: 'streak',
          criteriaJson: JSON.stringify({ type: 'streak', days: 100 }),
        },
        {
          code: 'domain-expert',
          name: 'Domain Expert',
          description: 'Achieve 90%+ accuracy in any domain with 5+ attempts',
          rarity: 'rare',
          icon: '🎓',
          criteriaType: 'domain_mastery',
          criteriaJson: JSON.stringify({
            type: 'domain_mastery',
            accuracyPercent: 90,
            minAttempts: 5,
          }),
        },
        {
          code: 'speed-demon',
          name: 'Speed Demon',
          description: 'Complete a drill with 100% accuracy in under 60 seconds',
          rarity: 'epic',
          icon: '⚡',
          criteriaType: 'speed',
          criteriaJson: JSON.stringify({ type: 'speed', maxSeconds: 60, minAccuracy: 100 }),
        },
        {
          code: 'night-owl',
          name: 'Night Owl',
          description: 'Complete a study session between midnight and 5 AM',
          rarity: 'common',
          icon: '🦉',
          criteriaType: 'time_of_day',
          criteriaJson: JSON.stringify({ type: 'time_of_day', startHour: 0, endHour: 5 }),
        },
        {
          code: 'early-bird',
          name: 'Early Bird',
          description: 'Complete a study session between 5 AM and 7 AM',
          rarity: 'common',
          icon: '🐦',
          criteriaType: 'time_of_day',
          criteriaJson: JSON.stringify({ type: 'time_of_day', startHour: 5, endHour: 7 }),
        },
        {
          code: 'completionist',
          name: 'Completionist',
          description: 'Complete 100% of a learning path',
          rarity: 'epic',
          icon: '✅',
          criteriaType: 'path_completion',
          criteriaJson: JSON.stringify({ type: 'path_completion', percentComplete: 100 }),
        },
        {
          code: 'reviewer-100',
          name: 'Review Master',
          description: 'Review 100 spaced repetition cards',
          rarity: 'rare',
          icon: '🔄',
          criteriaType: 'cumulative_count',
          criteriaJson: JSON.stringify({
            type: 'cumulative_count',
            activity: 'sr_review',
            count: 100,
          }),
        },
        {
          code: 'exam-veteran',
          name: 'Exam Veteran',
          description: 'Complete 10 exams',
          rarity: 'rare',
          icon: '🎖️',
          criteriaType: 'cumulative_count',
          criteriaJson: JSON.stringify({
            type: 'cumulative_count',
            activity: 'exam_complete',
            count: 10,
          }),
        },
      ];

      const upsertStmt = db.prepare(`
        INSERT INTO achievements (code, name, description, rarity, icon, criteria_type, criteria_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          rarity = excluded.rarity,
          icon = excluded.icon,
          criteria_type = excluded.criteria_type,
          criteria_json = excluded.criteria_json
      `);

      const now = Date.now();
      let inserted = 0;
      for (const a of achievementDefinitions) {
        upsertStmt.run(
          a.code,
          a.name,
          a.description,
          a.rarity,
          a.icon,
          a.criteriaType,
          a.criteriaJson,
          now
        );
        inserted++;
      }

      console.log(`  [migration] Seeded ${inserted} achievement definitions`);
    },
  },
  {
    version: 7,
    name: 'add_bookmarks_notes_tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS bookmarks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_type TEXT NOT NULL,
          target_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_target_idx ON bookmarks(user_id, target_type, target_id);
        CREATE INDEX IF NOT EXISTS bookmarks_user_idx ON bookmarks(user_id);

        CREATE TABLE IF NOT EXISTS user_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS user_notes_user_question_idx ON user_notes(user_id, question_id);
        CREATE INDEX IF NOT EXISTS user_notes_user_idx ON user_notes(user_id);
      `);
      console.log('  [migration] Created bookmarks and user_notes tables');
    },
  },
  {
    version: 8,
    name: 'add_exam_shares_table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS exam_shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
          share_hash TEXT NOT NULL UNIQUE,
          view_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS exam_shares_hash_idx ON exam_shares(share_hash);
        CREATE INDEX IF NOT EXISTS exam_shares_exam_idx ON exam_shares(exam_id);
      `);
      console.log('  [migration] Created exam_shares table');
    },
  },
  {
    version: 9,
    name: 'add_source_column_to_questions',
    up: (db) => {
      // Add 'source' column to questions table (for workbook questions)
      const columns = db.prepare("PRAGMA table_info('questions')").all() as Array<{
        name: string;
      }>;
      const hasSource = columns.some((col) => col.name === 'source');

      if (!hasSource) {
        db.exec(`ALTER TABLE questions ADD COLUMN source TEXT DEFAULT 'generated'`);
        console.log('  [migration] Added source column to questions');
      }
    },
  },
  {
    version: 10,
    name: 'add_workbook_progress_tables',
    up: (db) => {
      // Create workbook_progress table
      const progressExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workbook_progress'")
        .get();

      if (!progressExists) {
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
        console.log('  [migration] Created workbook_progress table');
      }

      // Create workbook_assessments table
      const assessmentsExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='workbook_assessments'"
        )
        .get();

      if (!assessmentsExists) {
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
        console.log('  [migration] Created workbook_assessments table');
      }
    },
  },
  {
    version: 11,
    name: 'add_workbook_resources_table',
    up: (db) => {
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workbook_resources'")
        .get();

      if (!tableExists) {
        db.exec(`
          CREATE TABLE workbook_resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gcp_service TEXT NOT NULL UNIQUE,
            courses TEXT,
            skill_badges TEXT,
            documentation_links TEXT
          );
        `);
        console.log('  [migration] Created workbook_resources table');
      }
    },
  },
  {
    version: 12,
    name: 'seed_workbook_resources',
    up: (db) => {
      // Check if data already exists
      const existingData = db.prepare('SELECT COUNT(*) as count FROM workbook_resources').get() as {
        count: number;
      };

      if (existingData.count > 0) {
        console.log('  [migration] Workbook resources already seeded, skipping');
        return;
      }

      // GCP Service to Learning Resources mapping (subset of key services)
      const resources = [
        {
          gcpService: 'Compute Engine',
          courses: JSON.stringify([
            { name: 'Google Cloud Fundamentals: Core Infrastructure', module: 'Module 4' },
            { name: 'Architecting with Google Compute Engine', module: 'Module 2' },
          ]),
          skillBadges: JSON.stringify([
            'Create and Manage Cloud Resources',
            'Set Up and Configure a Cloud Environment in Google Cloud',
          ]),
          documentationLinks: JSON.stringify([
            { title: 'Compute Engine Documentation', url: 'https://cloud.google.com/compute/docs' },
            { title: 'VM Instances', url: 'https://cloud.google.com/compute/docs/instances' },
          ]),
        },
        {
          gcpService: 'IAM',
          courses: JSON.stringify([
            { name: 'Google Cloud Fundamentals: Core Infrastructure', module: 'Module 3' },
          ]),
          skillBadges: JSON.stringify([
            'Set Up and Configure a Cloud Environment in Google Cloud',
            'Implement Cloud Security Fundamentals on Google Cloud',
          ]),
          documentationLinks: JSON.stringify([
            { title: 'IAM Overview', url: 'https://cloud.google.com/iam/docs/overview' },
            {
              title: 'Understanding Roles',
              url: 'https://cloud.google.com/iam/docs/understanding-roles',
            },
          ]),
        },
        {
          gcpService: 'Cloud Storage',
          courses: JSON.stringify([
            { name: 'Google Cloud Fundamentals: Core Infrastructure', module: 'Module 5' },
          ]),
          skillBadges: JSON.stringify(['Create and Manage Cloud Resources']),
          documentationLinks: JSON.stringify([
            { title: 'Cloud Storage Documentation', url: 'https://cloud.google.com/storage/docs' },
            {
              title: 'Storage Classes',
              url: 'https://cloud.google.com/storage/docs/storage-classes',
            },
          ]),
        },
        {
          gcpService: 'Cloud Run',
          courses: JSON.stringify([
            { name: 'Developing Applications with Cloud Run on Google Cloud', module: 'Module 1' },
          ]),
          skillBadges: JSON.stringify(['Build a Serverless App with Cloud Run']),
          documentationLinks: JSON.stringify([
            { title: 'Cloud Run Documentation', url: 'https://cloud.google.com/run/docs' },
          ]),
        },
        {
          gcpService: 'GKE',
          courses: JSON.stringify([
            { name: 'Architecting with Google Kubernetes Engine', module: 'Module 2' },
          ]),
          skillBadges: JSON.stringify(['Deploy to Kubernetes in Google Cloud']),
          documentationLinks: JSON.stringify([
            { title: 'GKE Documentation', url: 'https://cloud.google.com/kubernetes-engine/docs' },
          ]),
        },
        {
          gcpService: 'BigQuery',
          courses: JSON.stringify([
            { name: 'Google Cloud Big Data and Machine Learning Fundamentals', module: 'Module 3' },
          ]),
          skillBadges: JSON.stringify(['Insights from Data with BigQuery']),
          documentationLinks: JSON.stringify([
            { title: 'BigQuery Documentation', url: 'https://cloud.google.com/bigquery/docs' },
          ]),
        },
        {
          gcpService: 'VPC',
          courses: JSON.stringify([
            { name: 'Architecting with Google Compute Engine', module: 'Module 3' },
          ]),
          skillBadges: JSON.stringify(['Build and Secure Networks in Google Cloud']),
          documentationLinks: JSON.stringify([
            { title: 'VPC Documentation', url: 'https://cloud.google.com/vpc/docs' },
          ]),
        },
        {
          gcpService: 'Cloud Monitoring',
          courses: JSON.stringify([
            { name: 'Architecting with Google Compute Engine', module: 'Module 6' },
          ]),
          skillBadges: JSON.stringify(['Monitor and Log with Google Cloud Observability']),
          documentationLinks: JSON.stringify([
            {
              title: 'Cloud Monitoring Documentation',
              url: 'https://cloud.google.com/monitoring/docs',
            },
          ]),
        },
      ];

      const insertStmt = db.prepare(`
        INSERT INTO workbook_resources (gcp_service, courses, skill_badges, documentation_links)
        VALUES (?, ?, ?, ?)
      `);

      for (const r of resources) {
        insertStmt.run(r.gcpService, r.courses, r.skillBadges, r.documentationLinks);
      }

      console.log(`  [migration] Seeded ${resources.length} workbook resources`);
    },
  },
  {
    version: 13,
    name: 'add_question_encounters_and_difficulty_calibration',
    up: (db) => {
      // Create question_encounters table
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='question_encounters'")
        .get();

      if (!tableExists) {
        db.exec(`
          CREATE TABLE question_encounters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            encounter_count INTEGER NOT NULL DEFAULT 1,
            last_seen_at INTEGER NOT NULL
          );

          CREATE UNIQUE INDEX question_encounters_user_question_idx ON question_encounters(user_id, question_id);
          CREATE INDEX question_encounters_user_idx ON question_encounters(user_id);
          CREATE INDEX question_encounters_last_seen_idx ON question_encounters(user_id, last_seen_at);
        `);
        console.log('  [migration] Created question_encounters table');
      }

      // Add difficulty calibration columns to questions table
      const columns = db.prepare("PRAGMA table_info('questions')").all() as Array<{
        name: string;
      }>;

      if (!columns.some((col) => col.name === 'empirical_difficulty')) {
        db.exec(`ALTER TABLE questions ADD COLUMN empirical_difficulty TEXT`);
        console.log('  [migration] Added empirical_difficulty column to questions');
      }

      if (!columns.some((col) => col.name === 'attempt_count')) {
        db.exec(`ALTER TABLE questions ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0`);
        console.log('  [migration] Added attempt_count column to questions');
      }

      if (!columns.some((col) => col.name === 'correct_count')) {
        db.exec(`ALTER TABLE questions ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0`);
        console.log('  [migration] Added correct_count column to questions');
      }
    },
  },
  {
    version: 14,
    name: 'create_service_categories_tables',
    up: (db) => {
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='service_categories'")
        .get();

      if (!tableExists) {
        db.exec(`
          CREATE TABLE service_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
            category_name TEXT NOT NULL,
            category_id TEXT NOT NULL,
            display_order INTEGER NOT NULL DEFAULT 0,
            UNIQUE(certification_id, category_id)
          );
          CREATE INDEX IF NOT EXISTS service_categories_cert_idx ON service_categories(certification_id);
        `);
        console.log('  [migration] Created service_categories table');
      }

      const itemsTableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='service_category_items'"
        )
        .get();

      if (!itemsTableExists) {
        db.exec(`
          CREATE TABLE service_category_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
            service_name TEXT NOT NULL,
            UNIQUE(category_id, service_name)
          );
          CREATE INDEX IF NOT EXISTS service_category_items_cat_idx ON service_category_items(category_id);
        `);
        console.log('  [migration] Created service_category_items table');
      }
    },
  },
  {
    version: 15,
    name: 'seed_gcp_service_categories',
    up: (db) => {
      const aceCert = db.prepare("SELECT id FROM certifications WHERE code = 'ACE'").get() as
        | { id: number }
        | undefined;

      if (!aceCert) {
        console.log(
          '  [migration] ACE certification not found, skipping GCP service category seed'
        );
        return;
      }

      const existing = db
        .prepare('SELECT COUNT(*) as count FROM service_categories WHERE certification_id = ?')
        .get(aceCert.id) as { count: number };

      if (existing.count > 0) {
        console.log('  [migration] GCP service categories already seeded');
        return;
      }

      const categories = [
        {
          id: 'compute',
          name: 'Compute',
          order: 1,
          services: [
            'Compute Engine',
            'App Engine',
            'Cloud Functions',
            'Cloud Run',
            'GKE',
            'Anthos',
          ],
        },
        {
          id: 'storage',
          name: 'Storage & Databases',
          order: 2,
          services: [
            'Cloud Storage',
            'Cloud SQL',
            'Cloud Spanner',
            'Firestore',
            'Bigtable',
            'Memorystore',
            'Persistent Disk',
          ],
        },
        {
          id: 'networking',
          name: 'Networking',
          order: 3,
          services: [
            'VPC',
            'Cloud Load Balancing',
            'Cloud CDN',
            'Cloud DNS',
            'Cloud Interconnect',
            'Cloud VPN',
            'Cloud NAT',
            'Cloud Armor',
          ],
        },
        {
          id: 'analytics',
          name: 'Data & Analytics',
          order: 4,
          services: [
            'BigQuery',
            'Dataflow',
            'Dataproc',
            'Pub/Sub',
            'Cloud Composer',
            'Data Catalog',
          ],
        },
        {
          id: 'ai-ml',
          name: 'AI & Machine Learning',
          order: 5,
          services: [
            'Vertex AI',
            'AutoML',
            'Cloud Vision',
            'Cloud Natural Language',
            'Cloud Translation',
          ],
        },
        {
          id: 'security',
          name: 'Security & Identity',
          order: 6,
          services: [
            'Cloud IAM',
            'Cloud KMS',
            'Secret Manager',
            'Cloud Audit Logs',
            'Binary Authorization',
            'VPC Service Controls',
          ],
        },
        {
          id: 'operations',
          name: 'Operations',
          order: 7,
          services: [
            'Cloud Monitoring',
            'Cloud Logging',
            'Error Reporting',
            'Cloud Trace',
            'Cloud Profiler',
            'Cloud Debugger',
          ],
        },
      ];

      const insertCategory = db.prepare(
        'INSERT INTO service_categories (certification_id, category_id, category_name, display_order) VALUES (?, ?, ?, ?)'
      );
      const insertItem = db.prepare(
        'INSERT INTO service_category_items (category_id, service_name) VALUES (?, ?)'
      );

      for (const cat of categories) {
        const result = insertCategory.run(aceCert.id, cat.id, cat.name, cat.order);
        const catDbId = result.lastInsertRowid;
        for (const svc of cat.services) {
          insertItem.run(catDbId, svc);
        }
      }

      console.log(`  [migration] Seeded ${categories.length} GCP service categories for ACE`);
    },
  },
  {
    version: 16,
    name: 'seed_pca_service_categories',
    up: (db) => {
      const pcaCert = db.prepare("SELECT id FROM certifications WHERE code = 'PCA'").get() as
        | { id: number }
        | undefined;

      if (!pcaCert) {
        console.log('  [migration] PCA certification not found, skipping');
        return;
      }

      const existing = db
        .prepare('SELECT COUNT(*) as count FROM service_categories WHERE certification_id = ?')
        .get(pcaCert.id) as { count: number };

      if (existing.count > 0) {
        console.log('  [migration] PCA service categories already seeded');
        return;
      }

      const categories = [
        {
          id: 'compute',
          name: 'Compute',
          order: 1,
          services: [
            'Compute Engine',
            'App Engine',
            'Cloud Functions',
            'Cloud Run',
            'GKE',
            'Anthos',
          ],
        },
        {
          id: 'storage',
          name: 'Storage & Databases',
          order: 2,
          services: [
            'Cloud Storage',
            'Cloud SQL',
            'Cloud Spanner',
            'Firestore',
            'Bigtable',
            'Memorystore',
            'Persistent Disk',
          ],
        },
        {
          id: 'networking',
          name: 'Networking',
          order: 3,
          services: [
            'VPC',
            'Cloud Load Balancing',
            'Cloud CDN',
            'Cloud DNS',
            'Cloud Interconnect',
            'Cloud VPN',
            'Cloud NAT',
            'Cloud Armor',
          ],
        },
        {
          id: 'analytics',
          name: 'Data & Analytics',
          order: 4,
          services: [
            'BigQuery',
            'Dataflow',
            'Dataproc',
            'Pub/Sub',
            'Cloud Composer',
            'Data Catalog',
          ],
        },
        {
          id: 'ai-ml',
          name: 'AI & Machine Learning',
          order: 5,
          services: [
            'Vertex AI',
            'AutoML',
            'Cloud Vision',
            'Cloud Natural Language',
            'Cloud Translation',
          ],
        },
        {
          id: 'security',
          name: 'Security & Identity',
          order: 6,
          services: [
            'Cloud IAM',
            'Cloud KMS',
            'Secret Manager',
            'Cloud Audit Logs',
            'Binary Authorization',
            'VPC Service Controls',
          ],
        },
        {
          id: 'operations',
          name: 'Operations',
          order: 7,
          services: [
            'Cloud Monitoring',
            'Cloud Logging',
            'Error Reporting',
            'Cloud Trace',
            'Cloud Profiler',
            'Cloud Debugger',
          ],
        },
      ];

      const insertCategory = db.prepare(
        'INSERT INTO service_categories (certification_id, category_id, category_name, display_order) VALUES (?, ?, ?, ?)'
      );
      const insertItem = db.prepare(
        'INSERT INTO service_category_items (category_id, service_name) VALUES (?, ?)'
      );

      for (const cat of categories) {
        const result = insertCategory.run(pcaCert.id, cat.id, cat.name, cat.order);
        const catDbId = result.lastInsertRowid;
        for (const svc of cat.services) {
          insertItem.run(catDbId, svc);
        }
      }

      console.log(`  [migration] Seeded ${categories.length} GCP service categories for PCA`);
    },
  },
  {
    version: 17,
    name: 'create_learning_path_items_table',
    up: (db) => {
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='learning_path_items'")
        .get();

      if (!tableExists) {
        db.exec(`
          CREATE TABLE learning_path_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
            item_order INTEGER NOT NULL,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            url TEXT,
            description TEXT,
            topics TEXT,
            why_it_matters TEXT,
            duration_estimate TEXT,
            UNIQUE(certification_id, item_order)
          );
          CREATE INDEX IF NOT EXISTS learning_path_items_cert_idx ON learning_path_items(certification_id);
        `);
        console.log('  [migration] Created learning_path_items table');
      }
    },
  },
  {
    version: 18,
    name: 'seed_ace_learning_path_items',
    up: (db) => {
      const aceCert = db.prepare("SELECT id FROM certifications WHERE code = 'ACE'").get() as
        | { id: number }
        | undefined;

      if (!aceCert) {
        console.log('  [migration] ACE certification not found, skipping learning path seed');
        return;
      }

      const existing = db
        .prepare('SELECT COUNT(*) as count FROM learning_path_items WHERE certification_id = ?')
        .get(aceCert.id) as { count: number };

      if (existing.count > 0) {
        console.log('  [migration] ACE learning path items already seeded');
        return;
      }

      const items = [
        {
          order: 1,
          title: 'A Tour of Google Cloud Hands-on Labs',
          type: 'course',
          description: 'Introduction to Google Cloud through hands-on labs',
          topics: JSON.stringify(['Cloud Console', 'Cloud Shell', 'GCP basics']),
          whyItMatters: 'Builds foundational familiarity with the GCP console and lab environment',
        },
        {
          order: 2,
          title: 'Google Cloud Fundamentals: Core Infrastructure',
          type: 'course',
          description: 'Core GCP infrastructure services and concepts',
          topics: JSON.stringify([
            'Compute Engine',
            'Cloud Storage',
            'VPC',
            'IAM',
            'Cloud Monitoring',
          ]),
          whyItMatters: 'Covers the core services tested heavily on the ACE exam',
        },
        {
          order: 3,
          title: 'Getting Started with Google Kubernetes Engine',
          type: 'course',
          description: 'GKE deployment and management basics',
          topics: JSON.stringify(['GKE', 'Kubernetes', 'Containers', 'kubectl']),
          whyItMatters: 'GKE questions appear frequently on the ACE exam',
        },
        {
          order: 4,
          title: 'Cloud IAM and Security Fundamentals',
          type: 'course',
          description: 'Identity, access management, and security on GCP',
          topics: JSON.stringify(['IAM', 'Service Accounts', 'Cloud KMS', 'Audit Logs']),
          whyItMatters: 'IAM is a critical exam domain covering resource access control',
        },
        {
          order: 5,
          title: 'Networking in Google Cloud',
          type: 'course',
          description: 'VPC, load balancing, DNS, and hybrid connectivity',
          topics: JSON.stringify([
            'VPC',
            'Subnets',
            'Firewall Rules',
            'Cloud Load Balancing',
            'Cloud DNS',
            'Cloud VPN',
          ]),
          whyItMatters: 'Networking underpins almost every architectural question on the exam',
        },
        {
          order: 6,
          title: 'Reliable Google Cloud Infrastructure',
          type: 'course',
          description: 'Design and process for reliable cloud solutions',
          topics: JSON.stringify([
            'High Availability',
            'Disaster Recovery',
            'Monitoring',
            'Incident Response',
          ]),
          whyItMatters: 'Tests your ability to design resilient, production-ready architectures',
        },
        {
          order: 7,
          title: 'Cloud Load Balancing Skill Badge',
          type: 'skill_badge',
          description: 'Hands-on lab: configure HTTP(S) and TCP load balancing',
          topics: JSON.stringify(['Cloud Load Balancing', 'Instance Groups', 'Health Checks']),
          whyItMatters: 'Practical experience with load balancers frequently tested on the exam',
        },
        {
          order: 8,
          title: 'Automating Infrastructure on GCP with Terraform',
          type: 'course',
          description: 'Infrastructure as Code with Terraform on GCP',
          topics: JSON.stringify([
            'Terraform',
            'Cloud Deployment Manager',
            'Infrastructure as Code',
          ]),
          whyItMatters: 'IaC is increasingly important for the ACE exam',
        },
        {
          order: 9,
          title: 'Logging, Monitoring and Observability in GCP',
          type: 'course',
          description: 'Cloud Operations suite for monitoring and debugging',
          topics: JSON.stringify([
            'Cloud Monitoring',
            'Cloud Logging',
            'Error Reporting',
            'Cloud Trace',
          ]),
          whyItMatters: 'Operations questions form a significant portion of the exam',
        },
        {
          order: 10,
          title: 'App Engine and Cloud Functions Skill Badge',
          type: 'skill_badge',
          description: 'Hands-on: deploy serverless applications',
          topics: JSON.stringify(['App Engine', 'Cloud Functions', 'Cloud Run']),
          whyItMatters: 'Serverless compute is a key topic on the ACE exam',
        },
        {
          order: 11,
          title: 'Data and Storage Services',
          type: 'course',
          description: 'Cloud SQL, Spanner, Firestore, BigQuery, and more',
          topics: JSON.stringify([
            'Cloud SQL',
            'Cloud Spanner',
            'Firestore',
            'BigQuery',
            'Bigtable',
          ]),
          whyItMatters: 'Choosing the right database service is a common exam scenario',
        },
        {
          order: 12,
          title: 'Cloud Pub/Sub and Dataflow',
          type: 'course',
          description: 'Messaging and stream processing on GCP',
          topics: JSON.stringify(['Pub/Sub', 'Dataflow', 'Event-driven Architecture']),
          whyItMatters: 'Messaging patterns appear in integration-focused exam questions',
        },
        {
          order: 13,
          title: 'Preparing for the ACE Certification',
          type: 'course',
          description: 'Exam strategies, review, and practice',
          topics: JSON.stringify(['Exam Tips', 'Review', 'Practice Questions']),
          whyItMatters: 'Final review and exam-taking strategies before the real exam',
        },
        {
          order: 14,
          title: 'ACE Certification Exam',
          type: 'exam',
          description: 'Take the Associate Cloud Engineer certification exam',
          topics: JSON.stringify(['All Domains']),
          whyItMatters: 'The certification exam itself',
        },
      ];

      const insert = db.prepare(
        'INSERT INTO learning_path_items (certification_id, item_order, title, type, description, topics, why_it_matters) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );

      for (const item of items) {
        insert.run(
          aceCert.id,
          item.order,
          item.title,
          item.type,
          item.description,
          item.topics,
          item.whyItMatters
        );
      }

      console.log(`  [migration] Seeded ${items.length} learning path items for ACE`);
    },
  },
  {
    version: 19,
    name: 'rename_gcp_services_to_cloud_services',
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info('questions')").all() as Array<{ name: string }>;
      const hasGcpServices = columns.some((col) => col.name === 'gcp_services');
      const hasCloudServices = columns.some((col) => col.name === 'cloud_services');

      if (hasGcpServices && !hasCloudServices) {
        db.exec('ALTER TABLE questions RENAME COLUMN gcp_services TO cloud_services');
        console.log('  [migration] Renamed questions.gcp_services → cloud_services');
      }
    },
  },
  {
    version: 20,
    name: 'update_workbook_resources_provider_agnostic',
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info('workbook_resources')").all() as Array<{
        name: string;
      }>;

      // Rename gcp_service → cloud_service
      const hasGcpService = columns.some((col) => col.name === 'gcp_service');
      const hasCloudService = columns.some((col) => col.name === 'cloud_service');
      if (hasGcpService && !hasCloudService) {
        db.exec('ALTER TABLE workbook_resources RENAME COLUMN gcp_service TO cloud_service');
        console.log('  [migration] Renamed workbook_resources.gcp_service → cloud_service');
      }

      // Add certification_id column
      const hasCertId = columns.some((col) => col.name === 'certification_id');
      if (!hasCertId) {
        db.exec(
          'ALTER TABLE workbook_resources ADD COLUMN certification_id INTEGER REFERENCES certifications(id)'
        );
        const aceCert = db.prepare("SELECT id FROM certifications WHERE code = 'ACE'").get() as
          | { id: number }
          | undefined;
        if (aceCert) {
          db.prepare(
            'UPDATE workbook_resources SET certification_id = ? WHERE certification_id IS NULL'
          ).run(aceCert.id);
        }
        console.log('  [migration] Added certification_id to workbook_resources');
      }
    },
  },
  {
    version: 21,
    name: 'add_certification_id_to_spaced_repetition',
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info('spaced_repetition')").all() as Array<{
        name: string;
      }>;
      const hasCertId = columns.some((col) => col.name === 'certification_id');

      if (!hasCertId) {
        db.exec(
          'ALTER TABLE spaced_repetition ADD COLUMN certification_id INTEGER REFERENCES certifications(id)'
        );
        db.exec(`
          UPDATE spaced_repetition
          SET certification_id = (
            SELECT d.certification_id FROM questions q
            JOIN domains d ON q.domain_id = d.id
            WHERE q.id = spaced_repetition.question_id
          )
          WHERE certification_id IS NULL
        `);
        db.exec('CREATE INDEX IF NOT EXISTS sr_cert_idx ON spaced_repetition(certification_id)');
        console.log('  [migration] Added certification_id to spaced_repetition with backfill');
      }
    },
  },
  {
    version: 22,
    name: 'seed_aws_saa_certification',
    up: (db) => {
      const existing = db.prepare("SELECT id FROM certifications WHERE code = 'AWS-SAA'").get();
      if (existing) {
        console.log('  [migration] AWS-SAA certification already exists');
        return;
      }

      const certResult = db
        .prepare(
          `
        INSERT INTO certifications (code, name, short_name, description, provider, exam_duration_minutes, total_questions, passing_score_percent, is_active, capabilities, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          'AWS-SAA',
          'AWS Solutions Architect Associate',
          'SAA',
          'Design and deploy scalable, highly available, and fault-tolerant systems on AWS',
          'aws',
          130,
          65,
          72,
          1,
          JSON.stringify({ hasCaseStudies: false, hasWorkbook: false, hasMasteryMap: true }),
          Date.now()
        );

      const certId = certResult.lastInsertRowid;

      const domains = [
        {
          code: 'SECURE_ARCH',
          name: 'Design Secure Architectures',
          weight: 0.3,
          order: 1,
          description: 'Design secure access, application tiers, and data security controls',
          topics: [
            {
              code: 'IAM',
              name: 'IAM Policies and Roles',
              description:
                'IAM users, groups, roles, policies, federation, and cross-account access',
            },
            {
              code: 'VPC_SEC',
              name: 'VPC Security',
              description:
                'Security groups, NACLs, VPC endpoints, PrivateLink, and network isolation',
            },
            {
              code: 'ENCRYPTION',
              name: 'Encryption and Key Management',
              description: 'KMS, CloudHSM, ACM, S3 encryption, EBS encryption, and data protection',
            },
            {
              code: 'ORG_SCP',
              name: 'AWS Organizations and SCPs',
              description:
                'Multi-account strategy, Service Control Policies, and organizational units',
            },
            {
              code: 'EDGE_SEC',
              name: 'Edge Security',
              description: 'WAF, Shield, Shield Advanced, and DDoS mitigation strategies',
            },
            {
              code: 'IDENTITY',
              name: 'Identity Federation',
              description: 'Cognito, SSO, SAML, and identity provider integration',
            },
          ],
        },
        {
          code: 'RESILIENT_ARCH',
          name: 'Design Resilient Architectures',
          weight: 0.26,
          order: 2,
          description: 'Design multi-tier, highly available, and fault-tolerant architectures',
          topics: [
            {
              code: 'HA_DESIGN',
              name: 'High Availability Design',
              description: 'Multi-AZ and multi-region patterns, failover strategies',
            },
            {
              code: 'SCALING',
              name: 'Auto Scaling and Load Balancing',
              description: 'Auto Scaling groups, ALB, NLB, GWLB, target groups, and health checks',
            },
            {
              code: 'DNS_ROUTING',
              name: 'DNS and Routing Policies',
              description: 'Route 53 routing policies, health checks, and DNS failover',
            },
            {
              code: 'DR',
              name: 'Disaster Recovery',
              description:
                'Backup/restore, pilot light, warm standby, and multi-site DR strategies',
            },
            {
              code: 'DECOUPLE',
              name: 'Decoupling and Messaging',
              description: 'SQS, SNS, EventBridge, and event-driven architecture patterns',
            },
            {
              code: 'WORKFLOWS',
              name: 'Workflow Orchestration',
              description: 'Step Functions, SWF, and distributed system coordination',
            },
          ],
        },
        {
          code: 'PERF_ARCH',
          name: 'Design High-Performing Architectures',
          weight: 0.24,
          order: 3,
          description: 'Select performant storage, compute, database, and networking solutions',
          topics: [
            {
              code: 'COMPUTE',
              name: 'Compute Selection',
              description: 'EC2 instance types, placement groups, ENI, and compute optimization',
            },
            {
              code: 'STORAGE',
              name: 'Storage Solutions',
              description:
                'S3, EBS (gp3, io2, st1), EFS, FSx, and storage performance optimization',
            },
            {
              code: 'DATABASE',
              name: 'Database Solutions',
              description: 'RDS, Aurora, DynamoDB, ElastiCache, Redshift, and database selection',
            },
            {
              code: 'CACHING',
              name: 'Caching and Content Delivery',
              description: 'CloudFront, ElastiCache, DAX, and caching strategies',
            },
            {
              code: 'SERVERLESS',
              name: 'Serverless Architecture',
              description: 'Lambda, API Gateway, Fargate, and serverless design patterns',
            },
            {
              code: 'DATA_ANALYTICS',
              name: 'Data Analytics',
              description: 'Kinesis, Redshift, Athena, and analytics pipeline design',
            },
          ],
        },
        {
          code: 'COST_ARCH',
          name: 'Design Cost-Optimized Architectures',
          weight: 0.2,
          order: 4,
          description: 'Design cost-effective storage, compute, and database solutions',
          topics: [
            {
              code: 'PRICING',
              name: 'Pricing Models',
              description:
                'Reserved Instances, Savings Plans, Spot Instances, and pricing optimization',
            },
            {
              code: 'STORAGE_TIERS',
              name: 'Storage Cost Optimization',
              description: 'S3 storage classes, lifecycle policies, and data transfer costs',
            },
            {
              code: 'RIGHTSIZING',
              name: 'Right-Sizing and Monitoring',
              description:
                'Cost Explorer, Trusted Advisor, Compute Optimizer, and resource optimization',
            },
            {
              code: 'TRANSFER',
              name: 'Data Transfer Optimization',
              description:
                'VPC endpoints, Direct Connect pricing, and cross-region transfer strategies',
            },
            {
              code: 'SERVERLESS_COST',
              name: 'Serverless Cost Patterns',
              description: 'Lambda pricing, API Gateway caching, and pay-per-use optimization',
            },
            {
              code: 'TAGGING',
              name: 'Cost Allocation and Governance',
              description: 'Tagging strategies, AWS Budgets, and cost allocation reports',
            },
          ],
        },
      ];

      const insertDomain = db.prepare(
        'INSERT INTO domains (certification_id, code, name, weight, description, order_index) VALUES (?, ?, ?, ?, ?, ?)'
      );
      const insertTopic = db.prepare(
        'INSERT INTO topics (domain_id, code, name, description) VALUES (?, ?, ?, ?)'
      );

      for (const domain of domains) {
        const domainResult = insertDomain.run(
          certId,
          domain.code,
          domain.name,
          domain.weight,
          domain.description,
          domain.order
        );
        const domainId = domainResult.lastInsertRowid;
        for (const topic of domain.topics) {
          insertTopic.run(domainId, topic.code, topic.name, topic.description);
        }
      }

      console.log(
        `  [migration] Seeded AWS-SAA certification with ${domains.length} domains and ${domains.reduce((sum, d) => sum + d.topics.length, 0)} topics`
      );
    },
  },
  {
    version: 23,
    name: 'seed_aws_service_categories',
    up: (db) => {
      const awsCert = db.prepare("SELECT id FROM certifications WHERE code = 'AWS-SAA'").get() as
        | { id: number }
        | undefined;

      if (!awsCert) {
        console.log('  [migration] AWS-SAA certification not found, skipping');
        return;
      }

      const existing = db
        .prepare('SELECT COUNT(*) as count FROM service_categories WHERE certification_id = ?')
        .get(awsCert.id) as { count: number };

      if (existing.count > 0) {
        console.log('  [migration] AWS service categories already seeded');
        return;
      }

      const categories = [
        {
          id: 'compute',
          name: 'Compute',
          order: 1,
          services: ['EC2', 'Lambda', 'ECS', 'EKS', 'Fargate', 'Elastic Beanstalk', 'Batch'],
        },
        {
          id: 'storage',
          name: 'Storage',
          order: 2,
          services: ['S3', 'EBS', 'EFS', 'FSx', 'Storage Gateway', 'Snow Family'],
        },
        {
          id: 'database',
          name: 'Database',
          order: 3,
          services: [
            'RDS',
            'Aurora',
            'DynamoDB',
            'ElastiCache',
            'Redshift',
            'Neptune',
            'DocumentDB',
          ],
        },
        {
          id: 'networking',
          name: 'Networking & Content Delivery',
          order: 4,
          services: [
            'VPC',
            'ELB (ALB/NLB/GWLB)',
            'CloudFront',
            'Route 53',
            'Direct Connect',
            'Transit Gateway',
            'API Gateway',
            'Global Accelerator',
          ],
        },
        {
          id: 'security',
          name: 'Security, Identity & Compliance',
          order: 5,
          services: [
            'IAM',
            'KMS',
            'CloudHSM',
            'WAF',
            'Shield',
            'Cognito',
            'Organizations',
            'GuardDuty',
            'Inspector',
            'Macie',
          ],
        },
        {
          id: 'management',
          name: 'Management & Governance',
          order: 6,
          services: [
            'CloudWatch',
            'CloudTrail',
            'Config',
            'Systems Manager',
            'CloudFormation',
            'Trusted Advisor',
            'Service Catalog',
          ],
        },
        {
          id: 'integration',
          name: 'Application Integration',
          order: 7,
          services: ['SQS', 'SNS', 'EventBridge', 'Step Functions', 'Kinesis', 'AppFlow'],
        },
      ];

      const insertCat = db.prepare(
        'INSERT INTO service_categories (certification_id, category_id, category_name, display_order) VALUES (?, ?, ?, ?)'
      );
      const insertItem = db.prepare(
        'INSERT INTO service_category_items (category_id, service_name) VALUES (?, ?)'
      );

      for (const cat of categories) {
        const result = insertCat.run(awsCert.id, cat.id, cat.name, cat.order);
        const catDbId = result.lastInsertRowid;
        for (const svc of cat.services) {
          insertItem.run(catDbId, svc);
        }
      }

      console.log(`  [migration] Seeded ${categories.length} AWS service categories`);
    },
  },
  {
    version: 24,
    name: 'seed_aws_saa_learning_path',
    up: (db) => {
      const awsCert = db.prepare("SELECT id FROM certifications WHERE code = 'AWS-SAA'").get() as
        | { id: number }
        | undefined;

      if (!awsCert) {
        console.log('  [migration] AWS-SAA certification not found, skipping');
        return;
      }

      const existing = db
        .prepare('SELECT COUNT(*) as count FROM learning_path_items WHERE certification_id = ?')
        .get(awsCert.id) as { count: number };

      if (existing.count > 0) {
        console.log('  [migration] AWS SAA learning path already seeded');
        return;
      }

      const items = [
        {
          order: 1,
          title: 'AWS Cloud Practitioner Essentials',
          type: 'course',
          description: 'Foundational AWS cloud concepts and services',
          topics: JSON.stringify(['AWS Global Infrastructure', 'Core Services', 'Pricing']),
          whyItMatters: 'Builds baseline AWS knowledge required for SAA topics',
        },
        {
          order: 2,
          title: 'Architecting on AWS',
          type: 'course',
          description: 'Core architectural patterns and best practices',
          topics: JSON.stringify(['EC2', 'VPC', 'S3', 'IAM', 'RDS']),
          whyItMatters: 'Covers the foundational services tested on SAA-C03',
        },
        {
          order: 3,
          title: 'AWS Well-Architected Framework',
          type: 'reading',
          description: 'Six pillars of well-architected applications',
          topics: JSON.stringify([
            'Operational Excellence',
            'Security',
            'Reliability',
            'Performance',
            'Cost Optimization',
            'Sustainability',
          ]),
          whyItMatters: 'Well-Architected Framework principles underpin most SAA questions',
        },
        {
          order: 4,
          title: 'AWS Security Fundamentals',
          type: 'course',
          description: 'IAM, encryption, VPC security, and compliance',
          topics: JSON.stringify(['IAM', 'KMS', 'Security Groups', 'NACLs', 'CloudTrail']),
          whyItMatters: 'Security is the highest-weighted domain at 30%',
        },
        {
          order: 5,
          title: 'VPC and Networking Deep Dive',
          type: 'course',
          description: 'VPC design, subnets, routing, and hybrid connectivity',
          topics: JSON.stringify([
            'VPC',
            'Subnets',
            'Route Tables',
            'NAT Gateway',
            'Direct Connect',
            'Transit Gateway',
          ]),
          whyItMatters: 'Networking is critical for both security and resilience domains',
        },
        {
          order: 6,
          title: 'Amazon EC2 and Auto Scaling',
          type: 'course',
          description: 'Instance types, placement, scaling policies, and ELB',
          topics: JSON.stringify(['EC2', 'Auto Scaling', 'ALB', 'NLB', 'Launch Templates']),
          whyItMatters: 'EC2 and scaling appear in resilience and performance domains',
        },
        {
          order: 7,
          title: 'AWS Storage Services Deep Dive',
          type: 'course',
          description: 'S3, EBS, EFS, and storage class selection',
          topics: JSON.stringify([
            'S3',
            'EBS',
            'EFS',
            'FSx',
            'Storage Gateway',
            'Lifecycle Policies',
          ]),
          whyItMatters: 'Storage selection and optimization are heavily tested',
        },
        {
          order: 8,
          title: 'AWS Database Services',
          type: 'course',
          description: 'RDS, Aurora, DynamoDB, and database migration',
          topics: JSON.stringify(['RDS', 'Aurora', 'DynamoDB', 'ElastiCache', 'DMS']),
          whyItMatters: 'Choosing the right database service is a common exam scenario',
        },
        {
          order: 9,
          title: 'Serverless on AWS',
          type: 'course',
          description: 'Lambda, API Gateway, Step Functions, and event-driven design',
          topics: JSON.stringify(['Lambda', 'API Gateway', 'Step Functions', 'EventBridge', 'SQS']),
          whyItMatters: 'Serverless patterns appear across performance and cost domains',
        },
        {
          order: 10,
          title: 'AWS Cost Optimization',
          type: 'course',
          description: 'Pricing models, Reserved Instances, Savings Plans, and cost tools',
          topics: JSON.stringify([
            'Reserved Instances',
            'Savings Plans',
            'Spot Instances',
            'Cost Explorer',
            'Budgets',
          ]),
          whyItMatters: 'Cost optimization is 20% of the exam',
        },
        {
          order: 11,
          title: 'Disaster Recovery on AWS',
          type: 'reading',
          description: 'DR strategies from backup/restore to multi-site active-active',
          topics: JSON.stringify(['Backup/Restore', 'Pilot Light', 'Warm Standby', 'Multi-Site']),
          whyItMatters: 'DR strategy selection is a key topic in resilient architecture',
        },
        {
          order: 12,
          title: 'AWS Monitoring and Observability',
          type: 'course',
          description: 'CloudWatch, CloudTrail, Config, and operational tooling',
          topics: JSON.stringify(['CloudWatch', 'CloudTrail', 'Config', 'Systems Manager']),
          whyItMatters: 'Monitoring supports security, resilience, and performance domains',
        },
        {
          order: 13,
          title: 'SAA-C03 Exam Preparation',
          type: 'course',
          description: 'Practice exams, review, and exam strategies',
          topics: JSON.stringify(['Exam Tips', 'Review', 'Practice Questions']),
          whyItMatters: 'Final review and exam-taking strategies',
        },
        {
          order: 14,
          title: 'AWS Solutions Architect Associate Exam',
          type: 'exam',
          description: 'Take the SAA-C03 certification exam',
          topics: JSON.stringify(['All Domains']),
          whyItMatters: 'The certification exam itself',
        },
      ];

      const insert = db.prepare(
        'INSERT INTO learning_path_items (certification_id, item_order, title, type, description, topics, why_it_matters) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );

      for (const item of items) {
        insert.run(
          awsCert.id,
          item.order,
          item.title,
          item.type,
          item.description,
          item.topics,
          item.whyItMatters
        );
      }

      console.log(`  [migration] Seeded ${items.length} learning path items for AWS-SAA`);
    },
  },
  {
    version: 25,
    name: 'update_certification_capabilities',
    up: (db) => {
      db.prepare("UPDATE certifications SET capabilities = ? WHERE code = 'ACE'").run(
        JSON.stringify({ hasCaseStudies: false, hasWorkbook: true, hasMasteryMap: true })
      );

      db.prepare("UPDATE certifications SET capabilities = ? WHERE code = 'PCA'").run(
        JSON.stringify({ hasCaseStudies: true, hasWorkbook: false, hasMasteryMap: true })
      );

      db.prepare("UPDATE certifications SET capabilities = ? WHERE code = 'AWS-SAA'").run(
        JSON.stringify({ hasCaseStudies: false, hasWorkbook: false, hasMasteryMap: true })
      );

      console.log('  [migration] Updated certification capabilities for ACE, PCA, AWS-SAA');
    },
  },
  {
    version: 26,
    name: 'fix_workbook_resources_unique_constraint',
    up: (db) => {
      // The original table had UNIQUE on gcp_service (now cloud_service).
      // For multi-cert support, uniqueness should be (certification_id, cloud_service).
      // SQLite requires table rebuild to change inline constraints.
      const hasOldTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workbook_resources'")
        .get();
      if (!hasOldTable) return;

      db.exec(`
        CREATE TABLE workbook_resources_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cloud_service TEXT NOT NULL,
          courses TEXT DEFAULT '[]',
          skill_badges TEXT DEFAULT '[]',
          documentation_links TEXT DEFAULT '[]',
          certification_id INTEGER REFERENCES certifications(id),
          UNIQUE(certification_id, cloud_service)
        );
        INSERT INTO workbook_resources_new (id, cloud_service, courses, skill_badges, documentation_links, certification_id)
          SELECT id, cloud_service, courses, skill_badges, documentation_links, certification_id
          FROM workbook_resources;
        DROP TABLE workbook_resources;
        ALTER TABLE workbook_resources_new RENAME TO workbook_resources;
      `);
      console.log(
        '  [migration] Rebuilt workbook_resources with composite UNIQUE(certification_id, cloud_service)'
      );
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
