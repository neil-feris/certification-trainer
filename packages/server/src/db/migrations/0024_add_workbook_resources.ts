/**
 * Migration: Add workbook resources table with GCP service learning resources
 * Maps GCP services to official documentation, courses, and skill badges
 *
 * Run with: npx tsx packages/server/src/db/migrations/0024_add_workbook_resources.ts
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

console.log('Running migration: Add workbook resources table...');

// Check if table already exists
const tableExists = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workbook_resources'")
  .get();

if (tableExists) {
  console.log('workbook_resources table already exists. Skipping table creation.');
} else {
  db.exec(`
    CREATE TABLE workbook_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gcp_service TEXT NOT NULL UNIQUE,
      courses TEXT,
      skill_badges TEXT,
      documentation_links TEXT
    );
  `);
  console.log('Created workbook_resources table');
}

// Check if data already exists
const existingData = db.prepare('SELECT COUNT(*) as count FROM workbook_resources').get() as {
  count: number;
};

if (existingData.count > 0) {
  console.log(`Resources already seeded (${existingData.count} found). Skipping seed.`);
  db.close();
  process.exit(0);
}

// GCP Service to Learning Resources mapping
// Based on official Google Cloud ACE certification resources
interface ResourceEntry {
  gcpService: string;
  courses: Array<{ name: string; module?: string }>;
  skillBadges: string[];
  documentationLinks: Array<{ title: string; url: string }>;
}

const GCP_RESOURCES: ResourceEntry[] = [
  {
    gcpService: 'Compute Engine',
    courses: [
      { name: 'Google Cloud Fundamentals: Core Infrastructure', module: 'Module 4' },
      { name: 'Architecting with Google Compute Engine', module: 'Module 2' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 3' },
    ],
    skillBadges: [
      'Create and Manage Cloud Resources',
      'Set Up and Configure a Cloud Environment in Google Cloud',
    ],
    documentationLinks: [
      { title: 'Compute Engine Documentation', url: 'https://cloud.google.com/compute/docs' },
      { title: 'VM Instances', url: 'https://cloud.google.com/compute/docs/instances' },
      {
        title: 'Instance Templates',
        url: 'https://cloud.google.com/compute/docs/instance-templates',
      },
      {
        title: 'Managed Instance Groups',
        url: 'https://cloud.google.com/compute/docs/instance-groups',
      },
    ],
  },
  {
    gcpService: 'IAM',
    courses: [
      { name: 'Google Cloud Fundamentals: Core Infrastructure', module: 'Module 3' },
      { name: 'Architecting with Google Compute Engine', module: 'Module 1' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 1' },
    ],
    skillBadges: [
      'Set Up and Configure a Cloud Environment in Google Cloud',
      'Implement Cloud Security Fundamentals on Google Cloud',
    ],
    documentationLinks: [
      { title: 'IAM Overview', url: 'https://cloud.google.com/iam/docs/overview' },
      {
        title: 'Understanding Roles',
        url: 'https://cloud.google.com/iam/docs/understanding-roles',
      },
      { title: 'Service Accounts', url: 'https://cloud.google.com/iam/docs/service-accounts' },
      {
        title: 'Granting IAM Roles',
        url: 'https://cloud.google.com/iam/docs/granting-changing-revoking-access',
      },
    ],
  },
  {
    gcpService: 'Resource Manager',
    courses: [
      { name: 'Google Cloud Fundamentals: Core Infrastructure', module: 'Module 2' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 1' },
    ],
    skillBadges: ['Set Up and Configure a Cloud Environment in Google Cloud'],
    documentationLinks: [
      {
        title: 'Resource Hierarchy',
        url: 'https://cloud.google.com/resource-manager/docs/cloud-platform-resource-hierarchy',
      },
      {
        title: 'Managing Projects',
        url: 'https://cloud.google.com/resource-manager/docs/creating-managing-projects',
      },
      {
        title: 'Managing Folders',
        url: 'https://cloud.google.com/resource-manager/docs/creating-managing-folders',
      },
    ],
  },
  {
    gcpService: 'Cloud Storage',
    courses: [
      { name: 'Google Cloud Fundamentals: Core Infrastructure', module: 'Module 5' },
      { name: 'Architecting with Google Compute Engine', module: 'Module 5' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 2' },
    ],
    skillBadges: [
      'Create and Manage Cloud Resources',
      'Build Infrastructure with Terraform on Google Cloud',
    ],
    documentationLinks: [
      { title: 'Cloud Storage Documentation', url: 'https://cloud.google.com/storage/docs' },
      { title: 'Storage Classes', url: 'https://cloud.google.com/storage/docs/storage-classes' },
      {
        title: 'Object Lifecycle Management',
        url: 'https://cloud.google.com/storage/docs/lifecycle',
      },
      {
        title: 'Access Control',
        url: 'https://cloud.google.com/storage/docs/access-control',
      },
    ],
  },
  {
    gcpService: 'Cloud Billing',
    courses: [
      { name: 'Google Cloud Fundamentals: Core Infrastructure', module: 'Module 2' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 1' },
    ],
    skillBadges: ['Set Up and Configure a Cloud Environment in Google Cloud'],
    documentationLinks: [
      { title: 'Billing Documentation', url: 'https://cloud.google.com/billing/docs' },
      {
        title: 'Budget Alerts',
        url: 'https://cloud.google.com/billing/docs/how-to/budgets',
      },
      {
        title: 'Billing Access Control',
        url: 'https://cloud.google.com/billing/docs/how-to/billing-access',
      },
    ],
  },
  {
    gcpService: 'Cloud Run',
    courses: [
      { name: 'Developing Applications with Cloud Run on Google Cloud', module: 'Module 1' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 3' },
    ],
    skillBadges: ['Build a Serverless App with Cloud Run', 'Develop Serverless Apps with Firebase'],
    documentationLinks: [
      { title: 'Cloud Run Documentation', url: 'https://cloud.google.com/run/docs' },
      {
        title: 'Deploying Container Images',
        url: 'https://cloud.google.com/run/docs/deploying',
      },
      {
        title: 'Configuring Services',
        url: 'https://cloud.google.com/run/docs/configuring/services',
      },
    ],
  },
  {
    gcpService: 'GKE',
    courses: [
      { name: 'Architecting with Google Kubernetes Engine', module: 'Module 2' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 3' },
    ],
    skillBadges: ['Deploy to Kubernetes in Google Cloud', 'Kubernetes Solutions on Google Cloud'],
    documentationLinks: [
      { title: 'GKE Documentation', url: 'https://cloud.google.com/kubernetes-engine/docs' },
      {
        title: 'GKE Cluster Types',
        url: 'https://cloud.google.com/kubernetes-engine/docs/concepts/types-of-clusters',
      },
      {
        title: 'Workload Identity',
        url: 'https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity',
      },
      {
        title: 'Private Clusters',
        url: 'https://cloud.google.com/kubernetes-engine/docs/concepts/private-cluster-concept',
      },
    ],
  },
  {
    gcpService: 'BigQuery',
    courses: [
      { name: 'Google Cloud Big Data and Machine Learning Fundamentals', module: 'Module 3' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 2' },
    ],
    skillBadges: [
      'Insights from Data with BigQuery',
      'Perform Foundational Data, ML, and AI Tasks in Google Cloud',
    ],
    documentationLinks: [
      { title: 'BigQuery Documentation', url: 'https://cloud.google.com/bigquery/docs' },
      { title: 'Loading Data', url: 'https://cloud.google.com/bigquery/docs/loading-data' },
      {
        title: 'Data Transfer Service',
        url: 'https://cloud.google.com/bigquery/docs/dts-introduction',
      },
    ],
  },
  {
    gcpService: 'Bigtable',
    courses: [
      { name: 'Google Cloud Big Data and Machine Learning Fundamentals', module: 'Module 4' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 2' },
    ],
    skillBadges: ['Perform Foundational Data, ML, and AI Tasks in Google Cloud'],
    documentationLinks: [
      { title: 'Bigtable Documentation', url: 'https://cloud.google.com/bigtable/docs' },
      { title: 'Schema Design', url: 'https://cloud.google.com/bigtable/docs/schema-design' },
      {
        title: 'Time Series Data',
        url: 'https://cloud.google.com/bigtable/docs/schema-design-time-series',
      },
    ],
  },
  {
    gcpService: 'Cloud SQL',
    courses: [
      { name: 'Architecting with Google Compute Engine', module: 'Module 5' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 3' },
    ],
    skillBadges: [
      'Create and Manage Cloud Resources',
      'Build Infrastructure with Terraform on Google Cloud',
    ],
    documentationLinks: [
      { title: 'Cloud SQL Documentation', url: 'https://cloud.google.com/sql/docs' },
      {
        title: 'High Availability Configuration',
        url: 'https://cloud.google.com/sql/docs/mysql/high-availability',
      },
      {
        title: 'Connecting Applications',
        url: 'https://cloud.google.com/sql/docs/mysql/connect-overview',
      },
    ],
  },
  {
    gcpService: 'VPC',
    courses: [
      { name: 'Architecting with Google Compute Engine', module: 'Module 3' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 2' },
    ],
    skillBadges: [
      'Set Up and Configure a Cloud Environment in Google Cloud',
      'Build and Secure Networks in Google Cloud',
    ],
    documentationLinks: [
      { title: 'VPC Documentation', url: 'https://cloud.google.com/vpc/docs' },
      { title: 'VPC Network Overview', url: 'https://cloud.google.com/vpc/docs/vpc' },
      { title: 'Subnets', url: 'https://cloud.google.com/vpc/docs/subnets' },
      { title: 'Firewall Rules', url: 'https://cloud.google.com/vpc/docs/firewalls' },
    ],
  },
  {
    gcpService: 'Cloud Load Balancing',
    courses: [
      { name: 'Architecting with Google Compute Engine', module: 'Module 4' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 2' },
    ],
    skillBadges: [
      'Build and Secure Networks in Google Cloud',
      'Set Up and Configure a Cloud Environment in Google Cloud',
    ],
    documentationLinks: [
      {
        title: 'Load Balancing Documentation',
        url: 'https://cloud.google.com/load-balancing/docs',
      },
      {
        title: 'Load Balancer Types',
        url: 'https://cloud.google.com/load-balancing/docs/load-balancing-overview',
      },
      {
        title: 'Application Load Balancers',
        url: 'https://cloud.google.com/load-balancing/docs/https',
      },
    ],
  },
  {
    gcpService: 'Cloud Monitoring',
    courses: [
      { name: 'Architecting with Google Compute Engine', module: 'Module 6' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 4' },
    ],
    skillBadges: ['Monitor and Log with Google Cloud Observability'],
    documentationLinks: [
      { title: 'Cloud Monitoring Documentation', url: 'https://cloud.google.com/monitoring/docs' },
      {
        title: 'Alerting Policies',
        url: 'https://cloud.google.com/monitoring/alerts',
      },
      { title: 'Metrics', url: 'https://cloud.google.com/monitoring/api/metrics_gcp' },
    ],
  },
  {
    gcpService: 'Terraform',
    courses: [
      { name: 'Architecting with Google Compute Engine', module: 'Module 2' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 3' },
    ],
    skillBadges: ['Build Infrastructure with Terraform on Google Cloud'],
    documentationLinks: [
      { title: 'Terraform on Google Cloud', url: 'https://cloud.google.com/docs/terraform' },
      {
        title: 'Getting Started',
        url: 'https://cloud.google.com/docs/terraform/get-started-with-terraform',
      },
      {
        title: 'Best Practices',
        url: 'https://cloud.google.com/docs/terraform/best-practices-for-terraform',
      },
    ],
  },
  {
    gcpService: 'Pub/Sub',
    courses: [
      { name: 'Google Cloud Big Data and Machine Learning Fundamentals', module: 'Module 2' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 3' },
    ],
    skillBadges: ['Perform Foundational Data, ML, and AI Tasks in Google Cloud'],
    documentationLinks: [
      { title: 'Pub/Sub Documentation', url: 'https://cloud.google.com/pubsub/docs' },
      { title: 'Publishing Messages', url: 'https://cloud.google.com/pubsub/docs/publisher' },
      { title: 'Subscriptions', url: 'https://cloud.google.com/pubsub/docs/subscriber' },
    ],
  },
  {
    gcpService: 'Cloud Run functions',
    courses: [
      { name: 'Developing Applications with Cloud Run on Google Cloud', module: 'Module 2' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 3' },
    ],
    skillBadges: ['Build a Serverless App with Cloud Run'],
    documentationLinks: [
      {
        title: 'Cloud Run functions Documentation',
        url: 'https://cloud.google.com/functions/docs',
      },
      { title: 'Event Triggers', url: 'https://cloud.google.com/functions/docs/calling' },
      { title: 'Writing Functions', url: 'https://cloud.google.com/functions/docs/writing' },
    ],
  },
  {
    gcpService: 'Cloud Spanner',
    courses: [
      { name: 'Google Cloud Big Data and Machine Learning Fundamentals', module: 'Module 4' },
      { name: 'Preparing for Your Associate Cloud Engineer Journey', module: 'Module 2' },
    ],
    skillBadges: ['Perform Foundational Data, ML, and AI Tasks in Google Cloud'],
    documentationLinks: [
      { title: 'Cloud Spanner Documentation', url: 'https://cloud.google.com/spanner/docs' },
      { title: 'Schema Design', url: 'https://cloud.google.com/spanner/docs/schema-design' },
      { title: 'Best Practices', url: 'https://cloud.google.com/spanner/docs/best-practice-list' },
    ],
  },
];

// Insert resources
const insertResource = db.prepare(`
  INSERT INTO workbook_resources (gcp_service, courses, skill_badges, documentation_links)
  VALUES (?, ?, ?, ?)
`);

db.exec('BEGIN TRANSACTION');
try {
  let insertedCount = 0;
  for (const resource of GCP_RESOURCES) {
    insertResource.run(
      resource.gcpService,
      JSON.stringify(resource.courses),
      JSON.stringify(resource.skillBadges),
      JSON.stringify(resource.documentationLinks)
    );
    insertedCount++;
  }

  db.exec('COMMIT');
  console.log(`Successfully inserted ${insertedCount} GCP service resources`);
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Migration failed:', err);
  db.close();
  process.exit(1);
}

db.close();
console.log('Migration complete!');
