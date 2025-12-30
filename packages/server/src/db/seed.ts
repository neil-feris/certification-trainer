import { db, sqlite } from './index.js';
import { certifications, domains, topics, questions } from './schema.js';
import { eq } from 'drizzle-orm';

// ACE Certification Domain Data (default certification)
const ACE_DOMAINS = [
  {
    code: 'SETUP_CLOUD_ENV',
    name: 'Setting Up a Cloud Solution Environment',
    weight: 0.175,
    orderIndex: 1,
    description: 'Create and manage GCP projects, manage billing, install Cloud SDK',
    topics: [
      { code: 'PROJECTS_ACCOUNTS', name: 'Setting up cloud projects and accounts', description: 'Creating projects, enabling APIs, managing project hierarchy' },
      { code: 'BILLING', name: 'Managing billing configuration', description: 'Billing accounts, budgets, alerts, cost management' },
      { code: 'CLOUD_SDK', name: 'Installing and configuring Cloud SDK', description: 'gcloud CLI setup, configuration, and usage' },
    ]
  },
  {
    code: 'PLAN_CONFIG',
    name: 'Planning and Configuring a Cloud Solution',
    weight: 0.175,
    orderIndex: 2,
    description: 'Plan compute, storage, and network resources for cloud solutions',
    topics: [
      { code: 'PRODUCT_PLANNING', name: 'Planning and estimating GCP product use', description: 'Pricing calculator, resource estimation' },
      { code: 'COMPUTE_PLANNING', name: 'Planning and configuring compute resources', description: 'VM sizing, machine types, preemptible VMs' },
      { code: 'STORAGE_PLANNING', name: 'Planning and configuring data storage options', description: 'Storage classes, database selection, data lifecycle' },
      { code: 'NETWORK_PLANNING', name: 'Planning and configuring network resources', description: 'VPC design, subnets, firewall rules' },
    ]
  },
  {
    code: 'DEPLOY_IMPLEMENT',
    name: 'Deploying and Implementing a Cloud Solution',
    weight: 0.25,
    orderIndex: 3,
    description: 'Deploy compute, storage, networking, and marketplace solutions',
    topics: [
      { code: 'COMPUTE_ENGINE', name: 'Deploying Compute Engine resources', description: 'VMs, instance templates, managed instance groups' },
      { code: 'GKE', name: 'Deploying GKE resources', description: 'Kubernetes clusters, deployments, services' },
      { code: 'SERVERLESS', name: 'Deploying Cloud Run and Cloud Functions', description: 'Serverless containers and functions' },
      { code: 'DATA_SOLUTIONS', name: 'Deploying data solutions', description: 'Cloud SQL, BigQuery, Cloud Storage, Firestore' },
      { code: 'NETWORKING', name: 'Deploying networking resources', description: 'Load balancers, VPNs, Cloud CDN' },
      { code: 'MARKETPLACE', name: 'Deploying via Cloud Marketplace', description: 'Third-party solutions from Marketplace' },
      { code: 'IAC', name: 'Implementing resources via IaC', description: 'Terraform, Deployment Manager' },
    ]
  },
  {
    code: 'OPERATIONS',
    name: 'Ensuring Successful Operation of a Cloud Solution',
    weight: 0.20,
    orderIndex: 4,
    description: 'Manage and monitor compute, storage, and networking resources',
    topics: [
      { code: 'COMPUTE_MGMT', name: 'Managing Compute Engine resources', description: 'VM lifecycle, snapshots, images' },
      { code: 'GKE_MGMT', name: 'Managing GKE resources', description: 'Cluster operations, node pools, upgrades' },
      { code: 'CLOUDRUN_MGMT', name: 'Managing Cloud Run resources', description: 'Revisions, traffic splitting, scaling' },
      { code: 'STORAGE_MGMT', name: 'Managing storage and database solutions', description: 'Backups, replication, maintenance' },
      { code: 'NETWORK_MGMT', name: 'Managing networking resources', description: 'Route management, firewall updates' },
      { code: 'MONITORING', name: 'Monitoring and logging', description: 'Cloud Monitoring, Cloud Logging, alerts' },
    ]
  },
  {
    code: 'ACCESS_SECURITY',
    name: 'Configuring Access and Security',
    weight: 0.20,
    orderIndex: 5,
    description: 'Manage IAM, service accounts, and security policies',
    topics: [
      { code: 'IAM', name: 'Managing IAM', description: 'Roles, policies, organization hierarchy' },
      { code: 'SERVICE_ACCOUNTS', name: 'Managing service accounts', description: 'Creation, keys, impersonation' },
      { code: 'AUDIT_LOGS', name: 'Viewing audit logs', description: 'Admin Activity, Data Access, System Event logs' },
    ]
  },
];

// Sample questions for initial seeding
const SAMPLE_QUESTIONS = [
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'PROJECTS_ACCOUNTS',
    questionText: 'Your organization needs to create a new project for a development team. The project should automatically inherit IAM policies from the parent folder. What is the correct approach?',
    questionType: 'single' as const,
    options: [
      'A. Create the project at the organization level and manually copy IAM policies',
      'B. Create the project inside the appropriate folder in the resource hierarchy',
      'C. Create the project and use gcloud to sync IAM policies from the parent',
      'D. Projects cannot inherit IAM policies; they must be configured individually',
    ],
    correctAnswers: [1],
    explanation: 'IAM policies are inherited down the resource hierarchy in GCP. When you create a project inside a folder, it automatically inherits the IAM policies from that folder (and any parent folders up to the organization). This is the recommended approach for managing access at scale.',
    difficulty: 'medium' as const,
    gcpServices: ['Resource Manager', 'IAM'],
  },
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'BILLING',
    questionText: 'You need to set up budget alerts for a project that should notify stakeholders when spending reaches 50%, 75%, and 100% of the budget. Which service should you use?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Monitoring with custom metrics',
      'B. Cloud Billing Budgets and Alerts',
      'C. BigQuery billing export with scheduled queries',
      'D. Cloud Functions triggered by Pub/Sub billing events',
    ],
    correctAnswers: [1],
    explanation: 'Cloud Billing Budgets and Alerts is the native GCP service for setting spending thresholds and notifications. You can configure multiple threshold percentages and notification channels (email, Pub/Sub) directly in the Cloud Console or via API.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Billing'],
  },
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'COMPUTE_PLANNING',
    questionText: 'A batch processing workload runs for 2-3 hours daily and can be interrupted without data loss. Which VM configuration would be most cost-effective?',
    questionType: 'single' as const,
    options: [
      'A. Standard VMs with sustained use discounts',
      'B. Preemptible VMs or Spot VMs',
      'C. Committed use VMs with 1-year commitment',
      'D. Sole-tenant nodes for dedicated hardware',
    ],
    correctAnswers: [1],
    explanation: 'Preemptible VMs (now called Spot VMs) offer up to 91% discount compared to regular VMs. They are ideal for fault-tolerant, batch workloads that can handle interruption. Since the workload only runs 2-3 hours daily and can be interrupted, Spot VMs provide the best cost optimization.',
    difficulty: 'medium' as const,
    gcpServices: ['Compute Engine'],
  },
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'GKE',
    questionText: 'You need to deploy a containerized application to GKE that requires access to Cloud SQL. What is the recommended way to provide database credentials to the pods?',
    questionType: 'single' as const,
    options: [
      'A. Store credentials in environment variables in the Deployment YAML',
      'B. Use Workload Identity with a Kubernetes service account mapped to a GCP service account',
      'C. Create a ConfigMap with the database password',
      'D. Mount the credentials from a local file in the container image',
    ],
    correctAnswers: [1],
    explanation: 'Workload Identity is the recommended way to access GCP services from GKE. It allows Kubernetes service accounts to act as GCP service accounts, providing secure, keyless authentication. This eliminates the need to manage and rotate service account keys.',
    difficulty: 'medium' as const,
    gcpServices: ['GKE', 'Cloud SQL', 'Workload Identity'],
  },
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'SERVERLESS',
    questionText: 'You want to deploy a containerized web application that automatically scales based on HTTP traffic and scales to zero when idle. Which service should you use?',
    questionType: 'single' as const,
    options: [
      'A. Compute Engine with managed instance groups',
      'B. Google Kubernetes Engine with Horizontal Pod Autoscaler',
      'C. Cloud Run',
      'D. App Engine Flexible Environment',
    ],
    correctAnswers: [2],
    explanation: 'Cloud Run is a fully managed serverless platform for containerized applications. It automatically scales based on incoming requests and scales to zero when there is no traffic, meaning you only pay for actual usage. This makes it ideal for variable traffic workloads.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Run'],
  },
  {
    domainCode: 'OPERATIONS',
    topicCode: 'MONITORING',
    questionText: 'Your application logs are stored in Cloud Logging. You need to create a metric that counts the number of 500 errors in your application logs and alert when it exceeds a threshold. What steps should you take? (Choose two)',
    questionType: 'multiple' as const,
    options: [
      'A. Create a logs-based metric with a filter for 500 errors',
      'B. Export logs to BigQuery and create a scheduled query',
      'C. Create an alerting policy based on the logs-based metric',
      'D. Use Cloud Trace to identify error patterns',
      'E. Create a Cloud Function to parse logs and send alerts',
    ],
    correctAnswers: [0, 2],
    explanation: 'The correct approach is to: 1) Create a logs-based metric in Cloud Logging with a filter that matches 500 errors, and 2) Create an alerting policy in Cloud Monitoring that triggers when the metric exceeds your threshold. This is the native, recommended way to alert on log patterns.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Logging', 'Cloud Monitoring'],
  },
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'IAM',
    questionText: 'A developer needs to deploy Cloud Functions but should not be able to create or modify IAM policies. Which predefined role should you assign?',
    questionType: 'single' as const,
    options: [
      'A. roles/owner',
      'B. roles/cloudfunctions.developer',
      'C. roles/cloudfunctions.admin',
      'D. roles/editor',
    ],
    correctAnswers: [1],
    explanation: 'The roles/cloudfunctions.developer role grants permissions to create, update, and delete Cloud Functions without the ability to modify IAM policies. The admin role includes IAM permissions, and owner/editor are overly permissive. Following the principle of least privilege, developer is the correct choice.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Functions', 'IAM'],
  },
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'SERVICE_ACCOUNTS',
    questionText: 'You need to allow a Compute Engine VM to read objects from a Cloud Storage bucket without using service account keys. What should you do?',
    questionType: 'single' as const,
    options: [
      'A. Attach a service account to the VM with the Storage Object Viewer role',
      'B. Create a service account key and store it on the VM',
      'C. Use signed URLs for all storage access',
      'D. Grant the default compute service account the Storage Admin role',
    ],
    correctAnswers: [0],
    explanation: 'The recommended approach is to attach a service account to the VM with only the required permissions (Storage Object Viewer for read access). The VM will automatically receive credentials through the metadata service, eliminating the need for key files. This is more secure and easier to manage.',
    difficulty: 'easy' as const,
    gcpServices: ['Compute Engine', 'Cloud Storage', 'IAM'],
  },
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'STORAGE_PLANNING',
    questionText: 'Your application requires a globally distributed, strongly consistent database for user session data with low-latency reads and writes. Which database service should you choose?',
    questionType: 'single' as const,
    options: [
      'A. Cloud SQL with read replicas',
      'B. Cloud Spanner',
      'C. Firestore in Datastore mode',
      'D. Cloud Bigtable',
    ],
    correctAnswers: [1],
    explanation: 'Cloud Spanner is the only GCP database that provides global distribution with strong consistency and low-latency reads/writes. Cloud SQL is regional, Firestore provides eventual consistency for multi-region, and Bigtable is optimized for analytical workloads, not transactional data like sessions.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Spanner'],
  },
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'DATA_SOLUTIONS',
    questionText: 'You need to import 500GB of CSV data into BigQuery daily. The data arrives in Cloud Storage. What is the most efficient method?',
    questionType: 'single' as const,
    options: [
      'A. Use the BigQuery web UI to manually upload files',
      'B. Create an external table pointing to Cloud Storage',
      'C. Use a BigQuery load job with wildcard source URIs',
      'D. Stream the data using the BigQuery Streaming API',
    ],
    correctAnswers: [2],
    explanation: 'For large batch loads from Cloud Storage, BigQuery load jobs are the most efficient option. They support wildcard URIs to load multiple files, are free (no charge for loading data), and can handle large volumes efficiently. External tables have query performance overhead, and streaming has costs and quotas.',
    difficulty: 'medium' as const,
    gcpServices: ['BigQuery', 'Cloud Storage'],
  },
];

async function seed() {
  console.log('Seeding database...');

  // Check if certifications already exist
  const existingCerts = await db.select().from(certifications);
  if (existingCerts.length > 0) {
    console.log('Database already seeded. Skipping...');
    sqlite.close();
    return;
  }

  // Insert ACE certification first
  const [aceCert] = await db.insert(certifications).values({
    code: 'ACE',
    name: 'Associate Cloud Engineer',
    shortName: 'ACE',
    description: 'An Associate Cloud Engineer deploys and secures applications and infrastructure, monitors operations, and manages enterprise solutions.',
    provider: 'gcp',
    examDurationMinutes: 120,
    totalQuestions: 50,
    passingScorePercent: 70,
    isActive: true,
    createdAt: new Date(),
  }).returning();
  console.log(`Inserted certification: ${aceCert.name}`);

  // Insert domains for ACE
  for (const domainData of ACE_DOMAINS) {
    const { topics: topicList, ...domainFields } = domainData;

    const [insertedDomain] = await db.insert(domains).values({
      certificationId: aceCert.id,
      ...domainFields,
    }).returning();
    console.log(`Inserted domain: ${insertedDomain.name}`);

    // Insert topics for this domain
    for (const topic of topicList) {
      await db.insert(topics).values({
        domainId: insertedDomain.id,
        ...topic,
      });
    }
  }

  // Insert sample questions
  for (const q of SAMPLE_QUESTIONS) {
    const [domain] = await db.select().from(domains).where(eq(domains.code, q.domainCode));
    const [topic] = await db.select().from(topics).where(eq(topics.code, q.topicCode));

    if (domain && topic) {
      await db.insert(questions).values({
        domainId: domain.id,
        topicId: topic.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: JSON.stringify(q.options),
        correctAnswers: JSON.stringify(q.correctAnswers),
        explanation: q.explanation,
        difficulty: q.difficulty,
        gcpServices: JSON.stringify(q.gcpServices),
        isGenerated: false,
        createdAt: new Date(),
      });
    }
  }

  console.log(`Inserted ${SAMPLE_QUESTIONS.length} sample questions`);
  console.log('Seeding completed!');

  sqlite.close();
}

seed().catch(console.error);
