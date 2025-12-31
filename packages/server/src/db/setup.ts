/**
 * Database setup script - creates tables and seeds initial data
 * Handles both fresh installations and upgrades from older schemas
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../../../data');

// Ensure data directory exists
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'ace-prep.db');
const isNewDatabase = !existsSync(dbPath);
const db = new Database(dbPath);

console.log('Setting up database at:', dbPath);

// Enable WAL mode
db.pragma('journal_mode = WAL');

// Check if this is an existing database that needs migration
const needsMigration =
  !isNewDatabase &&
  (() => {
    try {
      // Check if certifications table exists
      const tableCheck = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='certifications'")
        .get();
      return !tableCheck;
    } catch {
      return false;
    }
  })();

if (needsMigration) {
  console.log(
    'Existing database detected. Running migration to add multi-certification support...'
  );
  const migrationPath = join(__dirname, 'migrations/0001_add_certifications.sql');
  const migrationSql = readFileSync(migrationPath, 'utf-8');

  // Run migration in a transaction for safety
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
      } catch (err: any) {
        // Ignore "duplicate column" errors for idempotent migration
        if (!err.message.includes('duplicate column')) {
          throw err;
        }
      }
    }
    db.exec('COMMIT');
    console.log('Migration completed successfully!');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Migration failed:', err);
    db.close();
    process.exit(1);
  }

  db.close();
  process.exit(0);
}

// Run init migration SQL for fresh databases
const migrationPath = join(__dirname, 'migrations/0000_init.sql');
const migrationSql = readFileSync(migrationPath, 'utf-8');
db.exec(migrationSql);
console.log('Tables created');

// Check if already seeded
const certCount = db.prepare('SELECT COUNT(*) as count FROM certifications').get() as {
  count: number;
};
if (certCount.count > 0) {
  console.log('Database already seeded. Skipping seed data.');
  db.close();
  process.exit(0);
}

// Seed ACE certification first
const insertCertification = db.prepare(`
  INSERT INTO certifications (code, name, short_name, description, provider, exam_duration_minutes, total_questions, passing_score_percent, is_active, created_at)
  VALUES (@code, @name, @shortName, @description, @provider, @examDurationMinutes, @totalQuestions, @passingScorePercent, @isActive, @createdAt)
`);

const aceCertResult = insertCertification.run({
  code: 'ACE',
  name: 'Associate Cloud Engineer',
  shortName: 'ACE',
  description:
    'An Associate Cloud Engineer deploys and secures applications and infrastructure, monitors operations, and manages enterprise solutions.',
  provider: 'gcp',
  examDurationMinutes: 120,
  totalQuestions: 50,
  passingScorePercent: 70,
  isActive: 1,
  createdAt: Date.now(),
});
const aceCertId = aceCertResult.lastInsertRowid;
console.log('Inserted ACE certification');

// Seed domains for ACE
const ACE_DOMAINS = [
  {
    code: 'SETUP_CLOUD_ENV',
    name: 'Setting Up a Cloud Solution Environment',
    weight: 0.175,
    orderIndex: 1,
    description: 'Create and manage GCP projects, manage billing, install Cloud SDK',
  },
  {
    code: 'PLAN_CONFIG',
    name: 'Planning and Configuring a Cloud Solution',
    weight: 0.175,
    orderIndex: 2,
    description: 'Plan compute, storage, and network resources for cloud solutions',
  },
  {
    code: 'DEPLOY_IMPLEMENT',
    name: 'Deploying and Implementing a Cloud Solution',
    weight: 0.25,
    orderIndex: 3,
    description: 'Deploy compute, storage, networking, and marketplace solutions',
  },
  {
    code: 'OPERATIONS',
    name: 'Ensuring Successful Operation of a Cloud Solution',
    weight: 0.2,
    orderIndex: 4,
    description: 'Manage and monitor compute, storage, and networking resources',
  },
  {
    code: 'ACCESS_SECURITY',
    name: 'Configuring Access and Security',
    weight: 0.2,
    orderIndex: 5,
    description: 'Manage IAM, service accounts, and security policies',
  },
];

const insertDomain = db.prepare(`
  INSERT INTO domains (certification_id, code, name, weight, description, order_index)
  VALUES (@certificationId, @code, @name, @weight, @description, @orderIndex)
`);

const insertTopic = db.prepare(`
  INSERT INTO topics (domain_id, code, name, description)
  VALUES (@domainId, @code, @name, @description)
`);

const TOPICS: Record<string, { code: string; name: string; description: string }[]> = {
  SETUP_CLOUD_ENV: [
    {
      code: 'PROJECTS_ACCOUNTS',
      name: 'Setting up cloud projects and accounts',
      description: 'Creating projects, enabling APIs, managing project hierarchy',
    },
    {
      code: 'BILLING',
      name: 'Managing billing configuration',
      description: 'Billing accounts, budgets, alerts, cost management',
    },
    {
      code: 'CLOUD_SDK',
      name: 'Installing and configuring Cloud SDK',
      description: 'gcloud CLI setup, configuration, and usage',
    },
  ],
  PLAN_CONFIG: [
    {
      code: 'PRODUCT_PLANNING',
      name: 'Planning and estimating GCP product use',
      description: 'Pricing calculator, resource estimation',
    },
    {
      code: 'COMPUTE_PLANNING',
      name: 'Planning and configuring compute resources',
      description: 'VM sizing, machine types, preemptible VMs',
    },
    {
      code: 'STORAGE_PLANNING',
      name: 'Planning and configuring data storage options',
      description: 'Storage classes, database selection, data lifecycle',
    },
    {
      code: 'NETWORK_PLANNING',
      name: 'Planning and configuring network resources',
      description: 'VPC design, subnets, firewall rules',
    },
  ],
  DEPLOY_IMPLEMENT: [
    {
      code: 'COMPUTE_ENGINE',
      name: 'Deploying Compute Engine resources',
      description: 'VMs, instance templates, managed instance groups',
    },
    {
      code: 'GKE',
      name: 'Deploying GKE resources',
      description: 'Kubernetes clusters, deployments, services',
    },
    {
      code: 'SERVERLESS',
      name: 'Deploying Cloud Run and Cloud Functions',
      description: 'Serverless containers and functions',
    },
    {
      code: 'DATA_SOLUTIONS',
      name: 'Deploying data solutions',
      description: 'Cloud SQL, BigQuery, Cloud Storage, Firestore',
    },
    {
      code: 'NETWORKING',
      name: 'Deploying networking resources',
      description: 'Load balancers, VPNs, Cloud CDN',
    },
    {
      code: 'MARKETPLACE',
      name: 'Deploying via Cloud Marketplace',
      description: 'Third-party solutions from Marketplace',
    },
    {
      code: 'IAC',
      name: 'Implementing resources via IaC',
      description: 'Terraform, Deployment Manager',
    },
  ],
  OPERATIONS: [
    {
      code: 'COMPUTE_MGMT',
      name: 'Managing Compute Engine resources',
      description: 'VM lifecycle, snapshots, images',
    },
    {
      code: 'GKE_MGMT',
      name: 'Managing GKE resources',
      description: 'Cluster operations, node pools, upgrades',
    },
    {
      code: 'CLOUDRUN_MGMT',
      name: 'Managing Cloud Run resources',
      description: 'Revisions, traffic splitting, scaling',
    },
    {
      code: 'STORAGE_MGMT',
      name: 'Managing storage and database solutions',
      description: 'Backups, replication, maintenance',
    },
    {
      code: 'NETWORK_MGMT',
      name: 'Managing networking resources',
      description: 'Route management, firewall updates',
    },
    {
      code: 'MONITORING',
      name: 'Monitoring and logging',
      description: 'Cloud Monitoring, Cloud Logging, alerts',
    },
  ],
  ACCESS_SECURITY: [
    { code: 'IAM', name: 'Managing IAM', description: 'Roles, policies, organization hierarchy' },
    {
      code: 'SERVICE_ACCOUNTS',
      name: 'Managing service accounts',
      description: 'Creation, keys, impersonation',
    },
    {
      code: 'AUDIT_LOGS',
      name: 'Viewing audit logs',
      description: 'Admin Activity, Data Access, System Event logs',
    },
  ],
};

// Insert domains and topics
for (const domain of ACE_DOMAINS) {
  const result = insertDomain.run({ certificationId: aceCertId, ...domain });
  const domainId = result.lastInsertRowid;
  console.log(`Inserted domain: ${domain.name}`);

  const topics = TOPICS[domain.code] || [];
  for (const topic of topics) {
    insertTopic.run({ domainId, ...topic });
  }
}

// Seed sample questions
const insertQuestion = db.prepare(`
  INSERT INTO questions (domain_id, topic_id, question_text, question_type, options, correct_answers, explanation, difficulty, gcp_services, is_generated, created_at)
  VALUES (@domainId, @topicId, @questionText, @questionType, @options, @correctAnswers, @explanation, @difficulty, @gcpServices, @isGenerated, @createdAt)
`);

const getDomainByCode = db.prepare('SELECT id FROM domains WHERE code = ?');
const getTopicByCode = db.prepare('SELECT id FROM topics WHERE code = ?');

const SAMPLE_QUESTIONS = [
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'PROJECTS_ACCOUNTS',
    questionText:
      'Your organization needs to create a new project for a development team. The project should automatically inherit IAM policies from the parent folder. What is the correct approach?',
    questionType: 'single',
    options: [
      'A. Create the project at the organization level and manually copy IAM policies',
      'B. Create the project inside the appropriate folder in the resource hierarchy',
      'C. Create the project and use gcloud to sync IAM policies from the parent',
      'D. Projects cannot inherit IAM policies; they must be configured individually',
    ],
    correctAnswers: [1],
    explanation:
      'IAM policies are inherited down the resource hierarchy in GCP. When you create a project inside a folder, it automatically inherits the IAM policies from that folder (and any parent folders up to the organization).',
    difficulty: 'medium',
    gcpServices: ['Resource Manager', 'IAM'],
  },
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'BILLING',
    questionText:
      'You need to set up budget alerts for a project that should notify stakeholders when spending reaches 50%, 75%, and 100% of the budget. Which service should you use?',
    questionType: 'single',
    options: [
      'A. Cloud Monitoring with custom metrics',
      'B. Cloud Billing Budgets and Alerts',
      'C. BigQuery billing export with scheduled queries',
      'D. Cloud Functions triggered by Pub/Sub billing events',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Billing Budgets and Alerts is the native GCP service for setting spending thresholds and notifications.',
    difficulty: 'easy',
    gcpServices: ['Cloud Billing'],
  },
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'COMPUTE_PLANNING',
    questionText:
      'A batch processing workload runs for 2-3 hours daily and can be interrupted without data loss. Which VM configuration would be most cost-effective?',
    questionType: 'single',
    options: [
      'A. Standard VMs with sustained use discounts',
      'B. Preemptible VMs or Spot VMs',
      'C. Committed use VMs with 1-year commitment',
      'D. Sole-tenant nodes for dedicated hardware',
    ],
    correctAnswers: [1],
    explanation:
      'Preemptible VMs (now called Spot VMs) offer up to 91% discount compared to regular VMs. They are ideal for fault-tolerant, batch workloads.',
    difficulty: 'medium',
    gcpServices: ['Compute Engine'],
  },
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'GKE',
    questionText:
      'You need to deploy a containerized application to GKE that requires access to Cloud SQL. What is the recommended way to provide database credentials to the pods?',
    questionType: 'single',
    options: [
      'A. Store credentials in environment variables in the Deployment YAML',
      'B. Use Workload Identity with a Kubernetes service account mapped to a GCP service account',
      'C. Create a ConfigMap with the database password',
      'D. Mount the credentials from a local file in the container image',
    ],
    correctAnswers: [1],
    explanation:
      'Workload Identity is the recommended way to access GCP services from GKE. It provides secure, keyless authentication.',
    difficulty: 'medium',
    gcpServices: ['GKE', 'Cloud SQL', 'Workload Identity'],
  },
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'SERVERLESS',
    questionText:
      'You want to deploy a containerized web application that automatically scales based on HTTP traffic and scales to zero when idle. Which service should you use?',
    questionType: 'single',
    options: [
      'A. Compute Engine with managed instance groups',
      'B. Google Kubernetes Engine with Horizontal Pod Autoscaler',
      'C. Cloud Run',
      'D. App Engine Flexible Environment',
    ],
    correctAnswers: [2],
    explanation:
      'Cloud Run is a fully managed serverless platform for containerized applications. It automatically scales to zero when idle.',
    difficulty: 'easy',
    gcpServices: ['Cloud Run'],
  },
  {
    domainCode: 'OPERATIONS',
    topicCode: 'MONITORING',
    questionText:
      'Your application logs are stored in Cloud Logging. You need to create a metric that counts the number of 500 errors and alert when it exceeds a threshold. What steps should you take? (Choose two)',
    questionType: 'multiple',
    options: [
      'A. Create a logs-based metric with a filter for 500 errors',
      'B. Export logs to BigQuery and create a scheduled query',
      'C. Create an alerting policy based on the logs-based metric',
      'D. Use Cloud Trace to identify error patterns',
      'E. Create a Cloud Function to parse logs and send alerts',
    ],
    correctAnswers: [0, 2],
    explanation:
      'Create a logs-based metric in Cloud Logging with a filter for 500 errors, then create an alerting policy in Cloud Monitoring.',
    difficulty: 'medium',
    gcpServices: ['Cloud Logging', 'Cloud Monitoring'],
  },
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'IAM',
    questionText:
      'A developer needs to deploy Cloud Functions but should not be able to create or modify IAM policies. Which predefined role should you assign?',
    questionType: 'single',
    options: [
      'A. roles/owner',
      'B. roles/cloudfunctions.developer',
      'C. roles/cloudfunctions.admin',
      'D. roles/editor',
    ],
    correctAnswers: [1],
    explanation:
      'The roles/cloudfunctions.developer role grants permissions to create and manage Cloud Functions without IAM modification rights.',
    difficulty: 'medium',
    gcpServices: ['Cloud Functions', 'IAM'],
  },
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'SERVICE_ACCOUNTS',
    questionText:
      'You need to allow a Compute Engine VM to read objects from a Cloud Storage bucket without using service account keys. What should you do?',
    questionType: 'single',
    options: [
      'A. Attach a service account to the VM with the Storage Object Viewer role',
      'B. Create a service account key and store it on the VM',
      'C. Use signed URLs for all storage access',
      'D. Grant the default compute service account the Storage Admin role',
    ],
    correctAnswers: [0],
    explanation:
      'Attach a service account to the VM with only the required permissions. The VM receives credentials automatically via the metadata service.',
    difficulty: 'easy',
    gcpServices: ['Compute Engine', 'Cloud Storage', 'IAM'],
  },
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'STORAGE_PLANNING',
    questionText:
      'Your application requires a globally distributed, strongly consistent database for user session data with low-latency reads and writes. Which database service should you choose?',
    questionType: 'single',
    options: [
      'A. Cloud SQL with read replicas',
      'B. Cloud Spanner',
      'C. Firestore in Datastore mode',
      'D. Cloud Bigtable',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Spanner is the only GCP database that provides global distribution with strong consistency and low-latency.',
    difficulty: 'medium',
    gcpServices: ['Cloud Spanner'],
  },
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'DATA_SOLUTIONS',
    questionText:
      'You need to import 500GB of CSV data into BigQuery daily. The data arrives in Cloud Storage. What is the most efficient method?',
    questionType: 'single',
    options: [
      'A. Use the BigQuery web UI to manually upload files',
      'B. Create an external table pointing to Cloud Storage',
      'C. Use a BigQuery load job with wildcard source URIs',
      'D. Stream the data using the BigQuery Streaming API',
    ],
    correctAnswers: [2],
    explanation:
      'BigQuery load jobs are the most efficient for large batch loads from Cloud Storage. They are free and support wildcard URIs.',
    difficulty: 'medium',
    gcpServices: ['BigQuery', 'Cloud Storage'],
  },
];

const now = Date.now();

for (const q of SAMPLE_QUESTIONS) {
  const domain = getDomainByCode.get(q.domainCode) as { id: number } | undefined;
  const topic = getTopicByCode.get(q.topicCode) as { id: number } | undefined;

  if (domain && topic) {
    insertQuestion.run({
      domainId: domain.id,
      topicId: topic.id,
      questionText: q.questionText,
      questionType: q.questionType,
      options: JSON.stringify(q.options),
      correctAnswers: JSON.stringify(q.correctAnswers),
      explanation: q.explanation,
      difficulty: q.difficulty,
      gcpServices: JSON.stringify(q.gcpServices),
      isGenerated: 0,
      createdAt: now,
    });
  }
}

console.log(`Inserted ${SAMPLE_QUESTIONS.length} sample questions`);
console.log('Database setup complete!');

db.close();
