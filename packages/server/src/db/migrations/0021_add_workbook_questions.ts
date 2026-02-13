/**
 * Migration: Add ACE Workbook diagnostic questions
 * 41 questions from "Preparing for Your Associate Cloud Engineer Journey" workbook v2.0.8
 *
 * Run with: npx tsx packages/server/src/db/migrations/0021_add_workbook_questions.ts
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

console.log('Running migration: Add ACE Workbook diagnostic questions...');

// First, ensure the 'source' column exists on questions table
try {
  db.exec("ALTER TABLE questions ADD COLUMN source TEXT DEFAULT 'generated'");
  console.log('Added source column to questions table');
} catch (err: unknown) {
  const error = err as Error;
  if (!error.message.includes('duplicate column')) {
    throw err;
  }
  console.log('Source column already exists');
}

// Check if workbook questions already exist
const existingWorkbook = db
  .prepare("SELECT COUNT(*) as count FROM questions WHERE source = 'workbook'")
  .get() as { count: number };

if (existingWorkbook.count > 0) {
  console.log(
    `Workbook questions already exist (${existingWorkbook.count} found). Skipping migration.`
  );
  db.close();
  process.exit(0);
}

// Get ACE certification ID
const aceCert = db.prepare("SELECT id FROM certifications WHERE code = 'ACE'").get() as
  | { id: number }
  | undefined;

if (!aceCert) {
  console.error('ACE certification not found. Run db:setup first.');
  db.close();
  process.exit(1);
}

// Helper to get domain and topic IDs
const getDomainByCode = db.prepare(
  'SELECT id FROM domains WHERE code = ? AND certification_id = ?'
);
const getTopicByCode = db.prepare('SELECT id FROM topics WHERE code = ? AND domain_id = ?');

function getIds(domainCode: string, topicCode: string): { domainId: number; topicId: number } {
  const domain = getDomainByCode.get(domainCode, aceCert!.id) as { id: number } | undefined;
  if (!domain) throw new Error(`Domain not found: ${domainCode}`);

  const topic = getTopicByCode.get(topicCode, domain.id) as { id: number } | undefined;
  if (!topic) throw new Error(`Topic not found: ${topicCode} in domain ${domainCode}`);

  return { domainId: domain.id, topicId: topic.id };
}

// Prepare insert statement
const insertQuestion = db.prepare(`
  INSERT INTO questions (domain_id, topic_id, question_text, question_type, options, correct_answers, explanation, difficulty, cloud_services, is_generated, source, created_at)
  VALUES (@domainId, @topicId, @questionText, @questionType, @options, @correctAnswers, @explanation, @difficulty, @cloudServices, @isGenerated, @source, @createdAt)
`);

interface WorkbookQuestion {
  domainCode: string;
  topicCode: string;
  questionText: string;
  questionType: 'single' | 'multiple';
  options: string[];
  correctAnswers: number[];
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  cloudServices: string[];
}

const WORKBOOK_QUESTIONS: WorkbookQuestion[] = [
  // ============ SECTION 1: Setting up a cloud solution environment ============

  // 1.1.01
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'PROJECTS_ACCOUNTS',
    questionText:
      'Stella is a new member of a team in your company who has been put in charge of monitoring VM instances in the organization. Stella will need the required permissions to perform this role. How should you grant her those permissions?',
    questionType: 'single',
    options: [
      'A. Assign Stella a roles/compute.viewer role.',
      'B. Assign Stella compute.instances.get permissions on all of the projects she needs to monitor.',
      'C. Add Stella to a Google Group in your organization. Bind that group to roles/compute.viewer.',
      'D. Assign the "viewer" policy to Stella.',
    ],
    correctAnswers: [2],
    explanation:
      'Using Google Groups for IAM management is a best practice. It allows centralized permission management and makes it easier to add/remove users. Binding the group to roles/compute.viewer gives all members the necessary read-only access to Compute Engine resources.',
    difficulty: 'medium',
    cloudServices: ['Compute Engine', 'IAM'],
  },

  // 1.1.02
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'PROJECTS_ACCOUNTS',
    questionText: 'How are resource hierarchies organized in Google Cloud?',
    questionType: 'single',
    options: [
      'A. Organization, Project, Resource, Folder.',
      'B. Organization, Folder, Project, Resource.',
      'C. Project, Organization, Folder, Resource.',
      'D. Resource, Folder, Organization, Project.',
    ],
    correctAnswers: [1],
    explanation:
      'The Google Cloud resource hierarchy is: Organization (top) → Folders (optional, for grouping) → Projects → Resources. This hierarchy enables inheritance of IAM policies from parent to child.',
    difficulty: 'easy',
    cloudServices: ['Resource Manager'],
  },

  // 1.1.03
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'PROJECTS_ACCOUNTS',
    questionText: 'What Google Cloud project attributes can be changed?',
    questionType: 'single',
    options: [
      'A. The Project ID.',
      'B. The Project Name.',
      'C. The Project Number.',
      'D. The Project Category.',
    ],
    correctAnswers: [1],
    explanation:
      'Only the Project Name can be changed after creation. The Project ID is chosen at creation time and is immutable. The Project Number is automatically assigned by Google Cloud and cannot be changed. There is no "Project Category" attribute.',
    difficulty: 'easy',
    cloudServices: ['Resource Manager'],
  },

  // 1.1.04
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'PROJECTS_ACCOUNTS',
    questionText:
      'Jane will manage objects in Cloud Storage for the Cymbal Superstore. She needs to have access to the proper permissions for every project across the organization. What should you do?',
    questionType: 'single',
    options: [
      'A. Assign Jane the roles/storage.objectCreator on every project.',
      'B. Assign Jane the roles/viewer on each project and the roles/storage.objectCreator for each bucket.',
      'C. Assign Jane the roles/editor at the organizational level.',
      'D. Add Jane to a group that has the roles/storage.objectAdmin role assigned at the organizational level.',
    ],
    correctAnswers: [3],
    explanation:
      'Using a Google Group with roles/storage.objectAdmin at the organization level follows best practices: group-based access management and applying permissions at the appropriate hierarchy level. This gives Jane full object management capabilities across all projects while maintaining least privilege (not full editor access).',
    difficulty: 'medium',
    cloudServices: ['Cloud Storage', 'IAM'],
  },

  // 1.1.05
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'PROJECTS_ACCOUNTS',
    questionText:
      "You need to add new groups of employees in Cymbal Superstore's production environment. You need to consider Google's recommendation of using least privilege. What should you do?",
    questionType: 'single',
    options: [
      'A. Grant the most restrictive basic role to most services, grant predefined or custom roles as necessary.',
      'B. Grant predefined and custom roles that provide necessary permissions and grant basic roles only where needed.',
      'C. Grant the least restrictive basic roles to most services and grant predefined and custom roles only when necessary.',
      'D. Grant custom roles to individual users and implement basic roles at the resource level.',
    ],
    correctAnswers: [1],
    explanation:
      "Google recommends using predefined roles or custom roles instead of basic roles (Owner, Editor, Viewer) because they provide more granular permissions. Basic roles should only be used when predefined roles don't meet requirements. This follows the principle of least privilege.",
    difficulty: 'medium',
    cloudServices: ['IAM'],
  },

  // 1.1.06
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'PROJECTS_ACCOUNTS',
    questionText:
      'The Operations Department at Cymbal Superstore wants to provide managers access to information about VM usage without allowing them to make changes that would affect the state. You assign them the Compute Engine Viewer role. Which two permissions will they receive?',
    questionType: 'multiple',
    options: [
      'A. compute.images.list',
      'B. compute.images.get',
      'C. compute.images.create',
      'D. compute.images.setIAM',
      'E. compute.images.update',
    ],
    correctAnswers: [0, 1],
    explanation:
      'The Compute Engine Viewer role (roles/compute.viewer) grants read-only access. This includes list and get permissions for viewing resources but not create, update, delete, or setIAM permissions which would modify state.',
    difficulty: 'medium',
    cloudServices: ['Compute Engine', 'IAM'],
  },

  // 1.2.07
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'BILLING',
    questionText: 'How are billing accounts applied to projects in Google Cloud? (Pick two.)',
    questionType: 'multiple',
    options: [
      'A. Set up Cloud Billing to pay for usage costs in Google Cloud projects and Google Workspace accounts.',
      'B. A project and its resources can be tied to more than one billing account.',
      'C. A billing account can be linked to one or more projects.',
      'D. A project and its resources can only be tied to one billing account.',
      "E. If your project only uses free resources you don't need a link to an active billing account.",
    ],
    correctAnswers: [2, 3],
    explanation:
      'A billing account can be linked to multiple projects (one-to-many relationship), but each project can only be linked to one billing account at a time. Even for free-tier resources, a billing account must be linked to enable APIs and services.',
    difficulty: 'medium',
    cloudServices: ['Cloud Billing'],
  },

  // 1.2.08
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'BILLING',
    questionText:
      "Fiona is the billing administrator for the project associated with Cymbal Superstore's eCommerce application. Jeffrey, the marketing department lead, wants to receive emails related to budget alerts. Jeffrey should have access to no additional billing information. What should you do?",
    questionType: 'single',
    options: [
      'A. Change the budget alert default threshold rules to include Jeffrey as a recipient.',
      'B. Use Cloud Monitoring notification channels to send Jeffrey an email alert.',
      'C. Add Jeffrey and Fiona to the budget scope custom email delivery dialog.',
      'D. Send alerts to a Pub/Sub topic that Jeffrey is subscribed to.',
    ],
    correctAnswers: [2],
    explanation:
      'The budget scope custom email delivery allows adding email recipients for budget alerts without granting them any IAM roles or access to billing information. This is the simplest way to notify someone of budget alerts without giving them billing permissions.',
    difficulty: 'medium',
    cloudServices: ['Cloud Billing'],
  },

  // ============ SECTION 2: Planning and configuring a cloud solution ============

  // 2.1.01
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'COMPUTE_PLANNING',
    questionText:
      'Cymbal Superstore decides to migrate their supply chain application to Google Cloud. You need to configure specific operating system dependencies. What should you do?',
    questionType: 'single',
    options: [
      'A. Implement an application using containers on Cloud Run.',
      'B. Implement an application using code on App Engine.',
      'C. Implement an application using containers on Google Kubernetes Engine.',
      'D. Implement an application using virtual machines on Compute Engine.',
    ],
    correctAnswers: [3],
    explanation:
      'When you need to configure specific operating system dependencies, Compute Engine VMs provide the most control. You can choose the OS, install custom packages, and configure system-level settings. Containers and serverless platforms abstract away the OS layer.',
    difficulty: 'easy',
    cloudServices: ['Compute Engine'],
  },

  // 2.1.02
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'COMPUTE_PLANNING',
    questionText:
      'Cymbal Superstore decides to pilot a cloud application for their point of sale system in their flagship store. You want to focus on code and develop your solution quickly, and you want your code to be portable. How do you proceed?',
    questionType: 'single',
    options: [
      'A. SSH into a Compute Engine VM and execute your code.',
      'B. Package your code to a container image and post it to Cloud Run.',
      'C. Implement a deployment manifest and run kubectl apply on it in Google Kubernetes Engine.',
      'D. Code your solution in Cloud Run functions.',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Run allows you to deploy containerized applications quickly without managing infrastructure. Containers are portable across any environment that supports containers. This combines rapid development with portability.',
    difficulty: 'medium',
    cloudServices: ['Cloud Run'],
  },

  // 2.1.03
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'COMPUTE_PLANNING',
    questionText:
      'An application running on a highly-customized version of Ubuntu needs to be migrated to Google Cloud. You need to do this in the least amount of time with minimal code changes. How should you proceed?',
    questionType: 'single',
    options: [
      'A. Create Compute Engine Virtual Machines and migrate the app to that infrastructure.',
      'B. Deploy the existing application to App Engine.',
      'C. Deploy your application in a container image to Cloud Run.',
      'D. Implement a Kubernetes cluster and create pods to enable your app.',
    ],
    correctAnswers: [0],
    explanation:
      'For a highly-customized OS with minimal changes and time, a lift-and-shift to Compute Engine VMs is the fastest approach. You can use the same OS configuration and make minimal modifications. Containerizing or using PaaS would require more significant changes.',
    difficulty: 'easy',
    cloudServices: ['Compute Engine'],
  },

  // 2.1.04
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'COMPUTE_PLANNING',
    questionText:
      "You want to deploy a microservices application. You need full control of how you manage containers, reliability, and autoscaling, but don't want or need to manage the control plane. Which compute option should you use?",
    questionType: 'single',
    options: ['A. Cloud Run', 'B. App Engine', 'C. Google Kubernetes Engine', 'D. Compute Engine'],
    correctAnswers: [2],
    explanation:
      'GKE provides full control over container management, reliability configurations, and autoscaling policies while Google manages the Kubernetes control plane. Cloud Run abstracts away more control, App Engine is for code not containers, and Compute Engine requires managing everything.',
    difficulty: 'medium',
    cloudServices: ['GKE'],
  },

  // 2.2.05
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'STORAGE_PLANNING',
    questionText:
      'Cymbal Superstore needs to analyze whether they met quarterly sales projections. Analysts assigned to run this query are familiar with SQL. What data solution should they implement?',
    questionType: 'single',
    options: ['A. BigQuery', 'B. Cloud SQL', 'C. Spanner', 'D. Firestore'],
    correctAnswers: [0],
    explanation:
      "BigQuery is Google Cloud's enterprise data warehouse designed for analytics. It uses standard SQL, handles large datasets efficiently, and is optimized for analytical queries like aggregations and reporting. Cloud SQL and Spanner are for transactional workloads.",
    difficulty: 'easy',
    cloudServices: ['BigQuery'],
  },

  // 2.2.06
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'STORAGE_PLANNING',
    questionText:
      "Cymbal Superstore's supply chain application frequently analyzes large amounts of data to inform business processes and operational dashboards. What storage class would make sense for this use case?",
    questionType: 'single',
    options: ['A. Archive', 'B. Coldline', 'C. Nearline', 'D. Standard'],
    correctAnswers: [3],
    explanation:
      'Standard storage class is designed for frequently accessed ("hot") data. Since the application frequently analyzes the data for dashboards and business processes, Standard provides the lowest latency and no retrieval fees. Archive, Coldline, and Nearline have minimum storage durations and retrieval costs.',
    difficulty: 'easy',
    cloudServices: ['Cloud Storage'],
  },

  // 2.2.07
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'STORAGE_PLANNING',
    questionText:
      'Cymbal Superstore has a need to populate visual dashboards with historical time-based data. This is an analytical use-case. Which two storage solutions could they use?',
    questionType: 'multiple',
    options: ['A. BigQuery', 'B. Cloud Storage', 'C. Firestore', 'D. Cloud SQL', 'E. Bigtable'],
    correctAnswers: [0, 4],
    explanation:
      'BigQuery is designed for analytics and supports time-based partitioning for historical data. Bigtable excels at time-series data with high throughput and low latency for analytics. Cloud Storage is for objects, Firestore for documents, and Cloud SQL for transactional workloads.',
    difficulty: 'medium',
    cloudServices: ['BigQuery', 'Bigtable'],
  },

  // 2.3.08
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'NETWORK_PLANNING',
    questionText:
      'Cymbal Superstore is piloting an update to its ecommerce app for the flagship store in Minneapolis, Minnesota. The app is implemented as a three-tier web service with traffic originating from the local area and resources dedicated for it in us-central1. You need to configure a secure, low-cost network load-balancing architecture for it. How do you proceed?',
    questionType: 'single',
    options: [
      'A. Implement a premium tier global external Application Load Balancer connected to the web tier as the frontend, and a regional internal Application Load Balancer between the web tier and backend.',
      'B. Implement a global external proxy Network Load Balancer connected to the web tier as the frontend, and a premium tier passthrough Network Load Balancer between the web tier and the backend.',
      'C. Configure a standard tier regional external Application Load Balancer connected to the web tier as a frontend and a regional internal Application Load Balancer between the web tier and the backend.',
      'D. Configure a regional internal proxy Network Load Balancer connected to the web tier as the frontend and a standard tier internal proxy Network Load Balancer between the web tier and the backend.',
    ],
    correctAnswers: [2],
    explanation:
      'For a regional pilot with local traffic and low-cost requirements: Standard tier is cheaper than Premium tier. Regional load balancers are appropriate since traffic is local. External Application LB for the frontend (HTTP/HTTPS from users) and internal Application LB between tiers (secure internal traffic).',
    difficulty: 'hard',
    cloudServices: ['Cloud Load Balancing'],
  },

  // 2.3.09
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'NETWORK_PLANNING',
    questionText: 'What Google Cloud load balancing option runs at Layer 7 of the TCP stack?',
    questionType: 'single',
    options: [
      'A. Global Application Load Balancer',
      'B. Global proxy Network Load Balancer',
      'C. Regional passthrough Network Load Balancer',
      'D. Regional internal proxy Network Load Balancer',
    ],
    correctAnswers: [0],
    explanation:
      'Application Load Balancers operate at Layer 7 (HTTP/HTTPS application layer) and can make routing decisions based on URL paths, headers, and other application-level data. Network Load Balancers operate at Layer 4 (TCP/UDP transport layer).',
    difficulty: 'easy',
    cloudServices: ['Cloud Load Balancing'],
  },

  // ============ SECTION 3: Deploying and implementing a cloud solution ============

  // 3.1.01
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'COMPUTE_ENGINE',
    questionText:
      "Cymbal Superstore's sales department has a medium-sized MySQL database. This database includes user-defined functions and is used internally by the marketing department at Cymbal Superstore HQ. The sales department asks you to migrate the database to Google Cloud in the most timely and economical way. What should you do?",
    questionType: 'single',
    options: [
      'A. Find a MySQL machine image in Cloud Marketplace and configure it to meet your needs.',
      'B. Implement a database instance using Cloud SQL, back up your local data, and restore it to the new instance.',
      'C. Configure a Compute Engine VM with an N2 machine type, install MySQL, and restore your data to the new instance.',
      'D. Use gcloud to implement a Compute Engine instance with an E2-standard-8 machine type, install, and configure MySQL.',
    ],
    correctAnswers: [2],
    explanation:
      'User-defined functions (UDFs) are not fully supported in Cloud SQL for MySQL. For a database with UDFs, you need to run MySQL on a Compute Engine VM where you have full control. N2 machines provide good price-performance for database workloads.',
    difficulty: 'hard',
    cloudServices: ['Compute Engine', 'Cloud SQL'],
  },

  // 3.1.02
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'COMPUTE_ENGINE',
    questionText:
      "The backend of Cymbal Superstore's e-commerce system consists of managed instance groups. You need to update the operating system of the instances in an automated way using minimal resources. What should you do?",
    questionType: 'single',
    options: [
      'A. Create a new instance template. Click Update VMs. Set the update type to Opportunistic. Click Start.',
      'B. Create a new instance template, then click Update VMs. Set the update type to PROACTIVE. Click Start.',
      'C. Create a new instance template. Click Update VMs. Set max surge to 5. Click Start.',
      'D. Abandon each of the instances in the managed instance group. Delete the instance template, replace it with a new one, and recreate the instances in the managed group.',
    ],
    correctAnswers: [0],
    explanation:
      'Opportunistic updates apply the new template when instances are recreated due to other events (scaling, health check failures, manual recreation). This uses minimal additional resources compared to PROACTIVE updates which create new instances immediately. Max surge would use more resources.',
    difficulty: 'medium',
    cloudServices: ['Compute Engine'],
  },

  // 3.2.03
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'GKE',
    questionText:
      'The development team for the supply chain project is ready to start building their new cloud app using a small Kubernetes cluster for the pilot. The cluster should only be available to team members and does not need to be highly available. The developers also need the ability to change the cluster architecture as they deploy new capabilities. How would you implement this?',
    questionType: 'single',
    options: [
      'A. Implement an autopilot cluster in us-central1-a with a default pool and an Ubuntu image.',
      'B. Implement a private standard zonal cluster in us-central1-a with a default pool and an Ubuntu image.',
      'C. Implement a private standard regional cluster in us-central1 with a default pool and container-optimized image type.',
      'D. Implement an autopilot cluster in us-central1 with an Ubuntu image type.',
    ],
    correctAnswers: [1],
    explanation:
      'Private cluster ensures only team members can access it. Standard mode (vs Autopilot) gives developers control to change cluster architecture. Zonal is fine since HA is not required. Ubuntu image allows customization if needed.',
    difficulty: 'medium',
    cloudServices: ['GKE'],
  },

  // 3.3.04
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'SERVERLESS',
    questionText:
      'You need to quickly deploy a containerized web application on Google Cloud. You know the services you want to be exposed. You do not want to manage infrastructure. You only want to pay when requests are being handled and need support for custom packages. What technology meets these needs?',
    questionType: 'single',
    options: [
      'A. App Engine flexible environment',
      'B. App Engine standard environment',
      'C. Cloud Run',
      'D. Cloud Run functions',
    ],
    correctAnswers: [2],
    explanation:
      "Cloud Run is the best fit: it runs containers (supporting custom packages), is fully managed (no infrastructure), and scales to zero (pay only when handling requests). App Engine Flexible uses containers but doesn't scale to zero. Cloud Run functions are for event-driven code, not containerized apps.",
    difficulty: 'easy',
    cloudServices: ['Cloud Run'],
  },

  // 3.3.05
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'SERVERLESS',
    questionText:
      'You need to analyze and act on files being added to a Cloud Storage bucket. Your programming team is proficient in Python. The analysis you need to do takes at most 5 minutes. You implement a Cloud Run function to accomplish your processing and specify a trigger resource pointing to your bucket. How should you configure the --trigger-event parameter using gcloud?',
    questionType: 'single',
    options: [
      'A. --trigger-event google.storage.object.finalize',
      'B. --trigger-event google.storage.object.create',
      'C. --trigger-event google.storage.object.change',
      'D. --trigger-event google.storage.object.add',
    ],
    correctAnswers: [0],
    explanation:
      'google.storage.object.finalize is triggered when an object creation/overwrite is finalized (upload complete). This is the correct event for processing newly added files. The other options are not valid Cloud Storage trigger events.',
    difficulty: 'medium',
    cloudServices: ['Cloud Run functions', 'Cloud Storage'],
  },

  // 3.4.06
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'DATA_SOLUTIONS',
    questionText:
      'You require a Cloud Storage bucket serving users in New York City and San Francisco. Users in London will not use this bucket. You do not plan on using ACLs. What CLI command do you use?',
    questionType: 'single',
    options: [
      'A. Run a gcloud storage objects command and specify --remove-acl-grant.',
      'B. Run a gsutil mb command specifying a multi-regional location and an option to turn ACL evaluation off.',
      'C. Run a gcloud storage buckets create command, but do not specify --location.',
      'D. Run a gcloud storage buckets create command specifying --placement us-east1, europe-west2',
    ],
    correctAnswers: [1],
    explanation:
      'gsutil mb can create a multi-regional bucket (US multi-region covers both coasts) with uniform bucket-level access (which disables ACLs). The --uniform-bucket-level-access flag turns off ACL evaluation. Option D references Europe which is not needed.',
    difficulty: 'medium',
    cloudServices: ['Cloud Storage'],
  },

  // 3.4.07
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'DATA_SOLUTIONS',
    questionText:
      'Cymbal Superstore asks you to implement Cloud SQL as a database backend to their supply chain application. You want to configure automatic failover in case of a zone outage. You decide to use the gcloud sql instances create command set to accomplish this. Which gcloud command line argument is required to configure the stated failover capability as you create the required instances?',
    questionType: 'single',
    options: [
      'A. --availability-type',
      'B. --replica-type',
      'C. --secondary-zone',
      'D. --control_plane-instance-name',
    ],
    correctAnswers: [0],
    explanation:
      '--availability-type=REGIONAL enables high availability with automatic failover. This creates a primary instance and a standby replica in a different zone. When the primary fails, Cloud SQL automatically fails over to the standby.',
    difficulty: 'medium',
    cloudServices: ['Cloud SQL'],
  },

  // 3.4.08
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'DATA_SOLUTIONS',
    questionText:
      "Cymbal Superstore's marketing department needs to load some slowly changing data into BigQuery. The data arrives hourly in a Cloud Storage bucket. You want to minimize cost and implement this in the fewest steps. What should you do?",
    questionType: 'single',
    options: [
      'A. Implement a bq load command in a command line script and schedule it with cron.',
      'B. Read the data from your bucket by using the BigQuery streaming API in a program.',
      'C. Create a Cloud Run function to push data to BigQuery through a Dataflow pipeline.',
      'D. Use the BigQuery Data Transfer Service to schedule a transfer between your bucket and BigQuery.',
    ],
    correctAnswers: [3],
    explanation:
      'BigQuery Data Transfer Service provides scheduled, managed transfers from Cloud Storage to BigQuery with no code required. This is the simplest (fewest steps) and most cost-effective solution. Streaming API has costs, and Dataflow adds complexity.',
    difficulty: 'easy',
    cloudServices: ['BigQuery', 'Cloud Storage'],
  },

  // 3.5.09
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'NETWORKING',
    questionText:
      'Which Virtual Private Cloud (VPC) network type allows you to fully control IP ranges and the definition of regional subnets?',
    questionType: 'single',
    options: [
      'A. Default Project network',
      'B. Auto mode network',
      'C. Custom mode network',
      'D. An auto mode network converted to a custom network',
    ],
    correctAnswers: [2],
    explanation:
      'Custom mode VPC networks give you complete control over subnet creation and IP ranges. You define each subnet manually. Auto mode creates subnets automatically with predefined IP ranges. Converting auto to custom is one-way and still has the original auto-created subnets.',
    difficulty: 'easy',
    cloudServices: ['VPC'],
  },

  // 3.6.10
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'IAC',
    questionText: 'What action does the terraform apply command perform?',
    questionType: 'single',
    options: [
      'A. Downloads the latest version of the terraform provider.',
      'B. Verifies syntax of terraform config file.',
      'C. Shows a preview of resources that will be created.',
      'D. Sets up resources requested in the terraform config file.',
    ],
    correctAnswers: [3],
    explanation:
      'terraform apply creates, updates, or destroys infrastructure resources to match the configuration. terraform init downloads providers, terraform validate checks syntax, and terraform plan shows a preview. Apply actually makes the changes.',
    difficulty: 'easy',
    cloudServices: ['Terraform'],
  },

  // ============ SECTION 4: Ensuring successful operation of a cloud solution ============

  // 4.1.01
  {
    domainCode: 'OPERATIONS',
    topicCode: 'COMPUTE_MGMT',
    questionText:
      'You want to view a description of your available snapshots using the command line interface (CLI). What gcloud command should you use?',
    questionType: 'single',
    options: [
      'A. gcloud compute snapshots list',
      'B. gcloud snapshots list',
      'C. gcloud compute snapshots get',
      'D. gcloud compute list snapshots',
    ],
    correctAnswers: [0],
    explanation:
      'The correct command is gcloud compute snapshots list. Snapshots are part of the compute service, so the command structure is gcloud compute snapshots list. The list subcommand shows all available snapshots.',
    difficulty: 'easy',
    cloudServices: ['Compute Engine'],
  },

  // 4.1.02
  {
    domainCode: 'OPERATIONS',
    topicCode: 'COMPUTE_MGMT',
    questionText:
      'You have a scheduled snapshot you are trying to delete, but the operation returns an error. What should you do to resolve this problem?',
    questionType: 'single',
    options: [
      'A. Delete the downstream incremental snapshots before deleting the main reference.',
      'B. Delete the object the snapshot was created from.',
      'C. Detach the snapshot schedule before deleting it.',
      'D. Restore the snapshot to a persistent disk before deleting it.',
    ],
    correctAnswers: [2],
    explanation:
      'A snapshot schedule that is attached to a disk cannot be deleted. You must first detach the schedule from the disk(s) using it, then you can delete the snapshot schedule.',
    difficulty: 'medium',
    cloudServices: ['Compute Engine'],
  },

  // 4.2.03
  {
    domainCode: 'OPERATIONS',
    topicCode: 'GKE_MGMT',
    questionText:
      "Cymbal Superstore's GKE cluster requires an internal Application Load Balancer. You are creating the configuration files required for this resource. What is the proper setting for this scenario?",
    questionType: 'single',
    options: [
      'A. Annotate your ingress object with an ingress.class of "gce."',
      'B. Configure your service object with a type: LoadBalancer.',
      'C. Annotate your service object with a "neg" reference.',
      'D. Implement custom static routes in your VPC.',
    ],
    correctAnswers: [0],
    explanation:
      'For an internal Application Load Balancer in GKE, you use an Ingress resource with the kubernetes.io/ingress.class: "gce-internal" annotation (or gce for external). This creates an internal HTTP(S) load balancer.',
    difficulty: 'medium',
    cloudServices: ['GKE', 'Cloud Load Balancing'],
  },

  // 4.2.04
  {
    domainCode: 'OPERATIONS',
    topicCode: 'GKE_MGMT',
    questionText:
      'What Kubernetes object provides access to logic running in your cluster via endpoints that you define?',
    questionType: 'single',
    options: ['A. Pod templates', 'B. Pods', 'C. Services', 'D. Deployments'],
    correctAnswers: [2],
    explanation:
      'Services in Kubernetes provide a stable endpoint (IP and DNS name) to access a set of pods. Services define how to access the pods and provide load balancing. Pods run the workload, Deployments manage pod lifecycle, and Pod templates define pod specifications.',
    difficulty: 'easy',
    cloudServices: ['GKE'],
  },

  // 4.2.05
  {
    domainCode: 'OPERATIONS',
    topicCode: 'GKE_MGMT',
    questionText: 'What is the declarative way to initialize and update Kubernetes objects?',
    questionType: 'single',
    options: ['A. kubectl apply', 'B. kubectl create', 'C. kubectl replace', 'D. kubectl run'],
    correctAnswers: [0],
    explanation:
      'kubectl apply is the declarative approach - you declare the desired state in YAML files and apply them. Kubernetes determines what changes to make. kubectl create is imperative (creates new objects), kubectl replace is imperative (full replacement), kubectl run is imperative (runs containers).',
    difficulty: 'easy',
    cloudServices: ['GKE'],
  },

  // 4.3.06
  {
    domainCode: 'OPERATIONS',
    topicCode: 'CLOUDRUN_MGMT',
    questionText:
      'You have a Cloud Run service with a database backend. You want to limit the number of connections to your database. What should you do?',
    questionType: 'single',
    options: [
      'A. Set Min instances.',
      'B. Set Max instances.',
      'C. Set CPU Utilization.',
      'D. Set Concurrency settings.',
    ],
    correctAnswers: [3],
    explanation:
      'Concurrency settings control how many requests each container instance handles simultaneously. Lower concurrency means each instance handles fewer requests, which typically means fewer database connections per instance. Combined with max instances, this limits total connections.',
    difficulty: 'medium',
    cloudServices: ['Cloud Run'],
  },

  // 4.4.07
  {
    domainCode: 'OPERATIONS',
    topicCode: 'STORAGE_MGMT',
    questionText:
      'You want to implement a lifecycle rule that changes your storage type from Standard to Nearline after a specific date. What conditions should you use? (Pick two.)',
    questionType: 'multiple',
    options: [
      'A. Age',
      'B. CreatedBefore',
      'C. MatchesStorageClass',
      'D. IsLive',
      'E. NumberofNewerVersions',
    ],
    correctAnswers: [1, 2],
    explanation:
      'CreatedBefore specifies the date condition (objects created before this date). MatchesStorageClass ensures the rule only applies to Standard storage class objects. Age is based on object age, not a specific date.',
    difficulty: 'medium',
    cloudServices: ['Cloud Storage'],
  },

  // 4.5.08
  {
    domainCode: 'OPERATIONS',
    topicCode: 'NETWORK_MGMT',
    questionText:
      'Cymbal Superstore has a subnetwork called mysubnet with an IP range of 10.1.2.0/24. You need to expand this subnet to include enough IP addresses for at most 2000 users or devices. What should you do?',
    questionType: 'single',
    options: [
      'A. gcloud compute networks subnets expand-ip-range mysubnet --region us-central1 --prefix-length 20',
      'B. gcloud networks subnets expand-ip-range mysubnet --region us-central1 --prefix-length 21',
      'C. gcloud compute networks subnets expand-ip-range mysubnet --region us-central1 --prefix-length 21',
      'D. gcloud compute networks subnets expand-ip-range mysubnet --region us-cetnral1 --prefix-length 22',
    ],
    correctAnswers: [2],
    explanation:
      '/21 provides 2048 IP addresses (2^11 - reserved), which is enough for 2000 users. /22 only provides 1024 IPs (not enough). /20 provides 4096 IPs (more than needed). The correct command syntax includes "compute" and the correct region spelling.',
    difficulty: 'medium',
    cloudServices: ['VPC'],
  },

  // 4.6.09
  {
    domainCode: 'OPERATIONS',
    topicCode: 'MONITORING',
    questionText:
      "Cymbal Superstore's supply chain management system has been deployed and is working well. You are tasked with monitoring the system's resources so you can react quickly to any problems. You want to ensure the CPU usage of each of your Compute Engine instances in us-central1 remains below 60%. You want an incident created if it exceeds this value for 5 minutes. You need to configure the proper alerting policy for this scenario. What should you do?",
    questionType: 'single',
    options: [
      'A. Choose resource type of VM instance and metric of CPU load, condition trigger if any time series violates, condition is below, threshold is .60, for 5 minutes.',
      'B. Choose resource type of VM instance and metric of CPU utilization, condition trigger all time series violates, condition is above, threshold is .60 for 5 minutes.',
      'C. Choose resource type of VM instance, and metric of CPU utilization, condition trigger if any time series violates, condition is below, threshold is .60 for 5 minutes.',
      'D. Choose resource type of VM instance and metric of CPU utilization, condition trigger if any time series violates, condition is above, threshold is .60 for 5 minutes.',
    ],
    correctAnswers: [3],
    explanation:
      'You want alerts when CPU exceeds 60%, so the condition should be "above" 0.60 (not below). "Any time series violates" triggers when any single VM exceeds the threshold. CPU utilization (not load) is the percentage metric. Duration of 5 minutes prevents false alerts.',
    difficulty: 'medium',
    cloudServices: ['Cloud Monitoring', 'Compute Engine'],
  },

  // ============ SECTION 5: Configuring access and security ============

  // 5.1.01
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'IAM',
    questionText:
      "You need to configure access to Spanner from the GKE cluster that is supporting Cymbal Superstore's ecommerce microservices application. You want to specify an account type to set the proper permissions. What should you do?",
    questionType: 'single',
    options: [
      'A. Assign permissions to a Google account referenced by the application.',
      'B. Assign permissions through a Google Workspace account referenced by the application.',
      'C. Assign permissions through service account referenced by the application.',
      'D. Assign permissions through a Cloud Identity account referenced by the application.',
    ],
    correctAnswers: [2],
    explanation:
      'Service accounts are the correct identity type for applications. In GKE, you use Workload Identity to map Kubernetes service accounts to Google Cloud service accounts, which then have IAM permissions to access Spanner. Human accounts (Google, Workspace, Cloud Identity) are for users, not applications.',
    difficulty: 'easy',
    cloudServices: ['IAM', 'GKE', 'Cloud Spanner'],
  },

  // 5.1.02
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'IAM',
    questionText:
      "You are trying to assign roles to the dev and prod projects of Cymbal Superstore's e-commerce app but are receiving an error when you try to run set-iam policy. The projects are organized into an ecommerce folder in the Cymbal Superstore organizational hierarchy. You want to follow best practices for the permissions you need while respecting the practice of least privilege. What should you do?",
    questionType: 'single',
    options: [
      'A. Ask your administrator for resourcemanager.projects.setIamPolicy roles for each project.',
      'B. Ask your administrator for the roles/resourcemanager.folderIamAdmin for the ecommerce folder.',
      'C. Ask your administrator for the roles/resourcemanager.organizationAdmin for Cymbal Superstore.',
      'D. Ask your administrator for the roles/iam.securityAdmin role in IAM.',
    ],
    correctAnswers: [1],
    explanation:
      "roles/resourcemanager.folderIamAdmin at the folder level gives you permission to manage IAM for all projects within that folder. This follows least privilege - you get access to only the ecommerce folder's projects, not the entire organization.",
    difficulty: 'medium',
    cloudServices: ['IAM', 'Resource Manager'],
  },

  // 5.1.03
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'IAM',
    questionText:
      "You have a custom role implemented for administration of the dev/test environment for Cymbal Superstore's transportation management application. You are developing a pilot to use Cloud Run instead of Cloud Run functions. You want to ensure your administrators have the correct access to the new resources. What should you do?",
    questionType: 'single',
    options: [
      'A. Make the change to the custom role locally and run an update on the custom role.',
      'B. Delete the custom role and recreate a new custom role with required permissions.',
      'C. Copy the existing role, add the new permissions to the copy, and delete the old role.',
      'D. Create a new role with needed permissions and migrate users to it.',
    ],
    correctAnswers: [0],
    explanation:
      'Custom roles can be updated in place using gcloud iam roles update. You modify the role definition locally (add Cloud Run permissions) and update it. This preserves existing role bindings and is the simplest approach. Deleting or recreating roles would remove existing bindings.',
    difficulty: 'medium',
    cloudServices: ['IAM', 'Cloud Run'],
  },

  // 5.2.04
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'SERVICE_ACCOUNTS',
    questionText:
      'Which of the scenarios below is an example of a situation where you should use a service account?',
    questionType: 'single',
    options: [
      'A. To directly access user data',
      'B. For development environments',
      'C. For interactive analysis',
      'D. For individual GKE pods',
    ],
    correctAnswers: [3],
    explanation:
      'Service accounts are designed for non-human identities like applications, VMs, and containers. In GKE, each pod can have its own service account via Workload Identity for fine-grained access control. Interactive analysis and development typically use user accounts.',
    difficulty: 'easy',
    cloudServices: ['IAM', 'GKE'],
  },

  // 5.2.05
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'SERVICE_ACCOUNTS',
    questionText:
      'Cymbal Superstore is implementing a mobile app for end users to track deliveries that are en route to them. The app needs to access data about truck location from Pub/Sub using Google recommended practices. What kind of credentials should you use?',
    questionType: 'single',
    options: [
      'A. API key',
      'B. OAuth 2.0 client',
      'C. Environment provided service account',
      'D. Service account key',
    ],
    correctAnswers: [1],
    explanation:
      'For end-user mobile apps accessing Google Cloud services, OAuth 2.0 client credentials are recommended. This allows users to authenticate with their own identity. API keys lack user context, service accounts are for applications not end users, and service account keys should be avoided when possible.',
    difficulty: 'medium',
    cloudServices: ['IAM', 'Pub/Sub'],
  },
];

// Run in transaction
const now = Date.now();
let insertedCount = 0;

db.exec('BEGIN TRANSACTION');
try {
  for (const q of WORKBOOK_QUESTIONS) {
    const { domainId, topicId } = getIds(q.domainCode, q.topicCode);

    insertQuestion.run({
      domainId,
      topicId,
      questionText: q.questionText,
      questionType: q.questionType,
      options: JSON.stringify(q.options),
      correctAnswers: JSON.stringify(q.correctAnswers),
      explanation: q.explanation,
      difficulty: q.difficulty,
      cloudServices: JSON.stringify(q.cloudServices),
      isGenerated: 0,
      source: 'workbook',
      createdAt: now,
    });
    insertedCount++;
  }

  db.exec('COMMIT');
  console.log(`Successfully inserted ${insertedCount} workbook questions`);
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Migration failed:', err);
  db.close();
  process.exit(1);
}

db.close();
console.log('Migration complete!');
