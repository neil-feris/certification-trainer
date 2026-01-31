/**
 * Migration: Add Official Google ACE Sample Questions
 * 20 questions from Google Cloud's official ACE sample exam
 * Source: https://cloud.google.com/learn/certification/cloud-engineer
 *
 * Run with: npx tsx packages/server/src/db/migrations/0023_add_google_sample_questions.ts
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

console.log('Running migration: Add Official Google ACE Sample Questions...');

// Check if google sample questions already exist
const existingGoogleSample = db
  .prepare("SELECT COUNT(*) as count FROM questions WHERE source = 'google-sample'")
  .get() as { count: number };

if (existingGoogleSample.count > 0) {
  console.log(
    `Google sample questions already exist (${existingGoogleSample.count} found). Skipping migration.`
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
  INSERT INTO questions (domain_id, topic_id, question_text, question_type, options, correct_answers, explanation, difficulty, gcp_services, is_generated, source, created_at)
  VALUES (@domainId, @topicId, @questionText, @questionType, @options, @correctAnswers, @explanation, @difficulty, @gcpServices, @isGenerated, @source, @createdAt)
`);

interface GoogleSampleQuestion {
  domainCode: string;
  topicCode: string;
  questionText: string;
  questionType: 'single' | 'multiple';
  options: string[];
  correctAnswers: number[];
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  gcpServices: string[];
}

const GOOGLE_SAMPLE_QUESTIONS: GoogleSampleQuestion[] = [
  // Question 1 - IAM Groups for BigQuery auditors
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'IAM',
    questionText:
      'Your organization plans to migrate its financial transaction monitoring application to Google Cloud. Auditors need to view the data and run reports in BigQuery, but they are not allowed to perform transactions in the application. You are leading the migration and want the simplest solution that will require the least amount of maintenance. What should you do?',
    questionType: 'single',
    options: [
      'A. Assign roles/bigquery.dataViewer to the individual auditors.',
      'B. Create a group for auditors and assign roles/viewer to them.',
      'C. Create a group for auditors, and assign roles/bigquery.dataViewer to them.',
      'D. Assign a custom role to each auditor that allows view-only access to BigQuery.',
    ],
    correctAnswers: [2],
    explanation:
      'A is not correct because Google recommended practice is to assign IAM roles to groups, not individuals. Groups are easier to manage than individual users and they provide high level visibility into roles and permissions. B is not correct because it uses a basic role to give auditors view access to all resources on the project. C is correct because it uses a predefined role to provide view access to BigQuery for the group of auditors. Auditors can be added or deleted from the group if job responsibilities change. D is not correct because using a predefined role can accomplish the goal and requires less maintenance.',
    difficulty: 'medium',
    gcpServices: ['BigQuery', 'IAM'],
  },

  // Question 2 - IAM for first project with sensitive data
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'PROJECTS_ACCOUNTS',
    questionText:
      "You are managing your company's first Google Cloud project. Project leads, developers, and internal testers will participate in the project, which includes sensitive information. You need to ensure that only specific members of the development team have access to sensitive information. You want to assign the appropriate Identity and Access Management (IAM) roles that also require the least amount of maintenance. What should you do?",
    questionType: 'single',
    options: [
      'A. Assign a basic role to each user.',
      'B. Create groups. Assign a basic role to each group, and then assign users to groups.',
      'C. Create groups. Assign a Custom role to each group, including those who should have access to sensitive data. Assign users to groups.',
      'D. Create groups. Assign an IAM Predefined role to each group as required, including those who should have access to sensitive data. Assign users to groups.',
    ],
    correctAnswers: [3],
    explanation:
      'A is not correct for two reasons: The recommended practice is to use groups and not to assign roles to each user. Beyond that, Basic Roles do not have enough granularity to account for access to sensitive data. B is not correct because Basic roles do not have enough granularity to account for access to sensitive data. C is not correct because creating and maintaining Custom roles will require more maintenance than using Predefined roles. D is correct because Predefined roles are fine-grained enough to set permissions for specific roles requiring sensitive data access. This solution also uses groups, which is the recommended practice for managing permissions for individual roles.',
    difficulty: 'medium',
    gcpServices: ['IAM', 'Resource Manager'],
  },

  // Question 3 - Cloud Functions for data change monitoring
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'SERVERLESS',
    questionText:
      'You are responsible for monitoring all changes in your Cloud Storage and Firestore instances. For each change, you need to invoke an action that will verify the compliance of the change in near real time. You want to accomplish this with minimal setup. What should you do?',
    questionType: 'single',
    options: [
      'A. Use the trigger mechanism in each datastore to invoke the security script.',
      'B. Use Cloud Function events, and call the security script from the Cloud Function triggers.',
      'C. Redirect your data-changing queries to an App Engine application, and call the security script from the application.',
      'D. Use a Python script to get logs of the datastores, analyze them, and invoke the security script.',
    ],
    correctAnswers: [1],
    explanation:
      'A is not correct because setting triggers in each individual database requires additional setup. B is correct because it provides fast response and requires the minimal amount of setup. C is not correct because it requires custom programming. D is not correct because it requires significant custom programming.',
    difficulty: 'medium',
    gcpServices: ['Cloud Functions', 'Cloud Storage', 'Firestore'],
  },

  // Question 4 - Pub/Sub for transaction processing
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'COMPUTE_PLANNING',
    questionText:
      'Your application needs to process a significant rate of transactions. The rate of transactions exceeds the processing capabilities of a single virtual machine (VM). You want to spread transactions across multiple servers in real time and in the most cost-effective manner. What should you do?',
    questionType: 'single',
    options: [
      "A. Send transactions to BigQuery. On the VMs, poll for transactions that do not have the 'processed' key, and mark them 'processed' when done.",
      "B. Set up Cloud SQL with a memory cache for speed. On your multiple servers, poll for transactions that do not have the 'processed' key, and mark them 'processed' when done.",
      'C. Send transactions to Pub/Sub. Process them in VMs in a managed instance group.',
      'D. Record transactions in Cloud Bigtable, and poll for new transactions from the VMs.',
    ],
    correctAnswers: [2],
    explanation:
      'A is not correct because its latency is significantly higher than the real-time response required. B is not correct because it will not deliver the desired performance. C is correct because Pub/Sub is a scalable solution that can effectively distribute a large number of tasks among multiple servers at a low cost. D is not correct because, although fast, it will introduce an additional expense for storing the data.',
    difficulty: 'medium',
    gcpServices: ['Pub/Sub', 'Compute Engine'],
  },

  // Question 5 - Cloud VPN for on-premises connectivity
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'NETWORK_PLANNING',
    questionText:
      'Your team needs to directly connect your on-premises resources to several virtual machines inside a virtual private cloud (VPC). You want to provide your team with fast and secure access to the VMs with minimal maintenance and cost. What should you do?',
    questionType: 'single',
    options: [
      'A. Set up Cloud Interconnect.',
      'B. Use Cloud VPN to create a bridge between the VPC and your network.',
      'C. Assign a public IP address to each VM, and assign a strong password to each one.',
      'D. Start a Compute Engine VM, install a software router, and create a direct tunnel to each VM.',
    ],
    correctAnswers: [1],
    explanation:
      'A is not correct because it is significantly more expensive than other existing solutions. B is correct because it agrees with the Google recommended practices. C is not correct because it will require a sizable maintenance effort. D is not correct because setting up connections for each individual VM requires a significant amount of maintenance.',
    difficulty: 'medium',
    gcpServices: ['Cloud VPN', 'VPC'],
  },

  // Question 6 - Cloud Storage lifecycle management
  {
    domainCode: 'OPERATIONS',
    topicCode: 'STORAGE_MGMT',
    questionText:
      "You are implementing Cloud Storage for your organization. You need to follow your organization's regulations. They include: 1) Archive data older than one year. 2) Delete data older than 5 years. 3) Use standard storage for all other data. You want to implement these guidelines automatically and in the simplest manner available. What should you do?",
    questionType: 'single',
    options: [
      'A. Set up Object Lifecycle management policies.',
      'B. Run a script daily. Copy data that is older than one year to an archival bucket, and delete five-year-old data.',
      'C. Run a script daily. Set storage class to ARCHIVE for data that is older than one year, and delete five-year-old data.',
      'D. Set up default storage class for three buckets named: STANDARD, ARCHIVE, DELETED. Use a script to move the data in the appropriate bucket when its condition matches your company guidelines.',
    ],
    correctAnswers: [0],
    explanation:
      "A is correct because Object Lifecycle allows you to automate the implementation of your organization's data policy. B is not correct because changing an object's storage class does not require copying the object to another bucket. C is not correct because it requires custom programming. D is not correct because moving an object to a DELETED bucket does not really delete it.",
    difficulty: 'easy',
    gcpServices: ['Cloud Storage'],
  },

  // Question 7 - Cloud Bigtable for IoT data
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'STORAGE_PLANNING',
    questionText:
      'You are creating a Cloud IOT application requiring data storage of up to 10 petabytes (PB). The application must support high-speed reads and writes of small pieces of data, but your data schema is simple. You want to use the most economical solution for data storage. What should you do?',
    questionType: 'single',
    options: [
      'A. Store the data in Cloud Spanner, and add an in-memory cache for speed.',
      'B. Store the data in Cloud Storage, and distribute the data through Cloud CDN for speed.',
      'C. Store the data in Cloud Bigtable, and implement the business logic in the programming language of your choice.',
      'D. Use BigQuery, and implement the business logic in SQL.',
    ],
    correctAnswers: [2],
    explanation:
      'A is not correct because Cloud Spanner would not be the most economical solution. B is not correct because blob-oriented Cloud Storage is not a good fit for reading and writing small pieces of data. C is correct because Bigtable provides high-speed reads and writes, accommodates a simple schema, and is cost-effective. D is not correct because BigQuery does not provide the high-speed reads and writes required by IoT.',
    difficulty: 'medium',
    gcpServices: ['Cloud Bigtable', 'Cloud IoT'],
  },

  // Question 8 - Kubernetes Services for pod communication
  {
    domainCode: 'OPERATIONS',
    topicCode: 'GKE_MGMT',
    questionText:
      'You have created a Kubernetes deployment on Google Kubernetes Engine (GKE) that has a backend service. You also have pods that run the frontend service. You want to ensure that there is no interruption in communication between your frontend and backend service pods if they are moved or restarted. What should you do?',
    questionType: 'single',
    options: [
      'A. Create a service that groups your pods in the backend service, and tell your frontend pods to communicate through that service.',
      'B. Create a DNS entry with a fixed IP address that the frontend service can use to reach the backend service.',
      'C. Assign static internal IP addresses that the frontend service can use to reach the backend pods.',
      'D. Assign static external IP addresses that the frontend service can use to reach the backend pods.',
    ],
    correctAnswers: [0],
    explanation:
      'A is correct because Kubernetes service serves the purpose of providing a destination that can be used when the pods are moved or restarted. B is not correct because a DNS entry is created by service creation. C is not correct because static internal IP addresses do not automatically change when pods are restarted. D is not correct because static external IP addresses do not automatically change when pods are restarted, and they take traffic outside of Google networks.',
    difficulty: 'medium',
    gcpServices: ['GKE'],
  },

  // Question 9 - Cloud Run for microservices
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'SERVERLESS',
    questionText:
      'You are responsible for the user-management service for your global company. The service will add, update, delete, and list addresses. Each of these operations is implemented by a Docker container microservice. The processing load can vary from low to very high. You want to deploy the service on Google Cloud for scalability and minimal administration. What should you do?',
    questionType: 'single',
    options: [
      'A. Deploy your Docker containers into Cloud Run.',
      'B. Start each Docker container as a managed instance group.',
      'C. Deploy your Docker containers into Google Kubernetes Engine.',
      'D. Combine the four microservices into one Docker image, and deploy it to the App Engine instance.',
    ],
    correctAnswers: [0],
    explanation:
      'A is correct because Cloud Run is a managed service that requires minimal administration. B is not correct because managed instance groups lack management capabilities to expose their services. C is not correct because, although GKE provides scalability, it requires ongoing administration of the cluster. D is not correct because it required effort to reimplement the four microservices in one Docker container. You will also lose your microservice architecture.',
    difficulty: 'easy',
    gcpServices: ['Cloud Run'],
  },

  // Question 10 - Static external IP with Cloud DNS
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'NETWORKING',
    questionText:
      'You provide a service that you need to open to everyone in your partner network. You have a server and an IP address where the application is located. You do not want to have to change the IP address on your DNS server if your server crashes or is replaced. You also want to avoid downtime and deliver a solution for minimal cost and setup. What should you do?',
    questionType: 'single',
    options: [
      'A. Create a script that updates the IP address for the domain when the server crashes or is replaced.',
      'B. Reserve a static internal IP address, and assign it using Cloud DNS.',
      'C. Reserve a static external IP address, and assign it using Cloud DNS.',
      'D. Use the Bring Your Own IP (BYOIP) method to use your own IP address.',
    ],
    correctAnswers: [2],
    explanation:
      'A is not correct because updating DNS records could take up to 24 hours and it will cause downtime. B is not correct because internal IPs are not routable and cannot be seen on the internet. C is correct because external IPs are routable and can be advertised and seen on the internet, and this is also the most cost-effective solution. D is not correct because, while it is possible, bringing your own IP address is not as cost effective as Google Cloud DNS.',
    difficulty: 'medium',
    gcpServices: ['Cloud DNS', 'VPC'],
  },

  // Question 11 - Cloud Foundation Toolkit for environment deployment
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'IAC',
    questionText:
      'Your team is building the development, test, and production environments for your project deployment in Google Cloud. You need to efficiently deploy and manage these environments and ensure that they are consistent. You want to follow Google-recommended practices. What should you do?',
    questionType: 'single',
    options: [
      'A. Create a Cloud Shell script that uses gcloud commands to deploy the environments.',
      'B. Create one Terraform configuration for all environments. Parameterize the differences between environments.',
      'C. For each environment, create a Terraform configuration. Use them for repeated deployment. Reconcile the templates periodically.',
      'D. Use the Cloud Foundation Toolkit to create one deployment template that will work for all environments, and deploy with Terraform.',
    ],
    correctAnswers: [3],
    explanation:
      'A is not correct because creating a custom script of gcloud commands that adheres to Google Cloud recommended practices would require substantial development and maintenance effort. B is not correct because parameterizing the environment differences is time consuming and error prone. C is not correct because it is prone to error and involves significant reconciliation work. D is correct because the Cloud Foundation Toolkit (CFT) provides ready-made templates that reflect Google Cloud recommended practices and can be used to automate creation of the environments.',
    difficulty: 'medium',
    gcpServices: ['Terraform', 'Cloud Foundation Toolkit'],
  },

  // Question 12 - Expand subnet CIDR range
  {
    domainCode: 'OPERATIONS',
    topicCode: 'NETWORK_MGMT',
    questionText:
      'You receive an error message when you try to start a new VM: "You have exhausted the IP range in your subnet." You want to resolve the error with the least amount of effort. What should you do?',
    questionType: 'single',
    options: [
      'A. Create a new subnet and start your VM there.',
      'B. Expand the CIDR range in your subnet, and restart the VM that issued the error.',
      'C. Create another subnet, and move several existing VMs into the new subnet.',
      'D. Restart the VM using exponential backoff until the VM starts successfully.',
    ],
    correctAnswers: [1],
    explanation:
      'A is not correct because you do not need a new subnet. Once you expand the CIDR range, the initial VM will work by redeploying it. B is correct because once you expand the CIDR range, you can redeploy it, and it will work. C is not correct because moving your VMs to another subnet is an additional time-consuming effort that is not required. D is not correct because once the CIDR range is exhausted, redeploying the failed VM will not resolve the issue.',
    difficulty: 'easy',
    gcpServices: ['VPC', 'Compute Engine'],
  },

  // Question 13 - Cloud DNS for applications
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'NETWORKING',
    questionText:
      'You are running several related applications on Compute Engine virtual machine (VM) instances. You want to follow Google-recommended practices and expose each application through a DNS name. What should you do?',
    questionType: 'single',
    options: [
      'A. Use the Compute Engine internal DNS service to assign DNS names to your VM instances, and make the names known to your users.',
      'B. Assign each VM instance an alias IP address range, and then make the internal DNS names public.',
      'C. Assign Google Cloud routes to your VM instances, assign DNS names to the routes, and make the DNS names public.',
      'D. Use Cloud DNS to translate your domain names into your IP addresses.',
    ],
    correctAnswers: [3],
    explanation:
      'A is not correct because email is not the way for submitting DNS publication requests. B is not correct because you cannot make the internal DNS name public. C is not correct because you cannot make DNS names public. D is correct because Cloud DNS is the proper tool for translating domain names into IP addresses.',
    difficulty: 'easy',
    gcpServices: ['Cloud DNS', 'Compute Engine'],
  },

  // Question 14 - Billing labels and BigQuery analysis
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'BILLING',
    questionText:
      'You are charged with optimizing Google Cloud resource consumption. Specifically, you need to investigate the resource consumption charges and present a summary of your findings. You want to do it in the most efficient way possible. What should you do?',
    questionType: 'single',
    options: [
      'A. Rename resources to reflect the owner and purpose. Write a Python script to analyze resource consumption.',
      'B. Attach labels to resources to reflect the owner and purpose. Export Cloud Billing data into BigQuery, and analyze it with Data Studio.',
      'C. Assign tags to resources to reflect the owner and purpose. Export Cloud Billing data into BigQuery, and analyze it with Data Studio.',
      'D. Create a script to analyze resource usage based on the project to which the resources belong. In this script, use the IAM accounts and services accounts that control given resources.',
    ],
    correctAnswers: [1],
    explanation:
      'A is not correct because it requires custom programming and does not follow Google recommended practices and is not the most efficient solution. B is correct because it describes Google Recommended practice: labels are attached to resources and these labels are then propagated into billing items. C is not correct because tags are no longer created when a label is created for a resource and cannot be used for tracking resources. D is not correct because it requires custom programming.',
    difficulty: 'medium',
    gcpServices: ['Cloud Billing', 'BigQuery', 'Looker Studio'],
  },

  // Question 15 - BigQuery for ad-hoc SQL queries
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'STORAGE_PLANNING',
    questionText:
      'You are creating an environment for researchers to run ad hoc SQL queries. The researchers work with large quantities of data. Although they will use the environment for an hour a day on average, the researchers need access to the functional environment at any time during the day. You need to deliver a cost-effective solution. What should you do?',
    questionType: 'single',
    options: [
      'A. Store the data in Cloud Bigtable, and run SQL queries provided by Bigtable schema.',
      'B. Store the data in BigQuery, and run SQL queries in BigQuery.',
      'C. Create a Dataproc cluster, store the data in HDFS storage, and run SQL queries in Spark.',
      'D. Create a Dataproc cluster, store the data in Cloud Storage, and run SQL queries in Spark.',
    ],
    correctAnswers: [1],
    explanation:
      'A is not correct because HBase does not allow ad-hoc queries. B is correct because BigQuery allows for ad hoc queries and is cost effective. C is not correct because HDFS is not the recommended storage to use with Dataproc on Google Cloud. D is not correct because it is not the most cost-effective solution, because cluster is always running.',
    difficulty: 'easy',
    gcpServices: ['BigQuery'],
  },

  // Question 16 - GKE Autopilot for cost optimization
  {
    domainCode: 'OPERATIONS',
    topicCode: 'GKE_MGMT',
    questionText:
      'You are migrating your workload from on-premises deployment to Google Kubernetes Engine (GKE). You want to minimize costs and stay within budget. What should you do?',
    questionType: 'single',
    options: [
      'A. Configure Autopilot in GKE to monitor node utilization and eliminate idle nodes.',
      'B. Configure the needed capacity; the sustained use discount will make you stay within budget.',
      'C. Scale individual nodes up and down with the Horizontal Pod Autoscaler.',
      'D. Create several nodes using Compute Engine, add them to a managed instance group, and set the group to scale up and down depending on load.',
    ],
    correctAnswers: [0],
    explanation:
      'A is correct because Autopilot is designed to reduce the operational cost of managing clusters and optimize your clusters for production. B is not correct because it violates the principle of provisioning on-demand rather than overprovisioning. Although sustained use discount lowers the budget, not using unnecessary resources will keep costs down more. C is not correct because Horizontal Pod Autoscaler is for adjusting the Kubernetes parameters for performance, not for taking out unnecessary resources. D is not correct because, although Google Kubernetes Engine uses Compute Engine internally, managed instance groups lack the Autopilot capabilities for scaling Kubernetes.',
    difficulty: 'medium',
    gcpServices: ['GKE'],
  },

  // Question 17 - Cloud Storage + Cloud Functions for image processing
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'DATA_SOLUTIONS',
    questionText:
      'Your application allows users to upload pictures. You need to convert each picture to your internal optimized binary format and store it. You want to use the most efficient, cost-effective solution. What should you do?',
    questionType: 'single',
    options: [
      'A. Store uploaded files in Cloud Bigtable, monitor Bigtable entries, and then run a Cloud Function to convert the files and store them in Bigtable.',
      'B. Store uploaded files in Firestore, monitor Firestore entries, and then run a Cloud Function to convert the files and store them in Firestore.',
      'C. Store uploaded files in Filestore, monitor Filestore entries, and then run a Cloud Function to convert the files and store them in Filestore.',
      'D. Save uploaded files in a Cloud Storage bucket, and monitor the bucket for uploads. Run a Cloud Function to convert the files and to store them in a Cloud Storage bucket.',
    ],
    correctAnswers: [3],
    explanation:
      'A is not correct because BigTable has limitations on storing binary files. B is not correct because Firestore is not efficient for large binary files. C is not correct because it is not the most cost-effective solution. D is correct because it follows Google recommended-practices and is the most efficient, cost-effective solution.',
    difficulty: 'easy',
    gcpServices: ['Cloud Storage', 'Cloud Functions'],
  },

  // Question 18 - Transfer Appliance for large data migration
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'STORAGE_PLANNING',
    questionText:
      'You are migrating your on-premises solution to Google Cloud. As a first step, the new cloud solution will need to ingest 100 TB of data. Your daily uploads will be within your current bandwidth limit of 100 Mbps. You want to follow Google-recommended practices for the most cost-effective way to implement the migration. What should you do?',
    questionType: 'single',
    options: [
      'A. Set up Partner Interconnect for the duration of the first upload.',
      'B. Obtain a Transfer Appliance, copy the data to it, and ship it to Google.',
      'C. Set up Dedicated Interconnect for the duration of your first upload, and then drop back to regular bandwidth.',
      'D. Divide your data between 100 computers, and upload each data portion to a bucket. Then run a script to merge the uploads together.',
    ],
    correctAnswers: [1],
    explanation:
      'A is not correct because Partner Interconnect, although less expensive than Dedicated Interconnect, is still not the most cost effective solution for this migration. B is correct because it follows Google recommended practices for these data sizes and is the most cost-effective solution to implement the migration. C is not correct because Dedicated Interconnect is not the most cost-effective for this use case. D is not correct because it is not the most cost effective solution.',
    difficulty: 'medium',
    gcpServices: ['Transfer Appliance', 'Cloud Storage'],
  },

  // Question 19 - Quotas for cost control
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'BILLING',
    questionText:
      'You are setting up billing for your project. You want to prevent excessive consumption of resources due to an error or malicious attack and prevent billing spikes or surprises. What should you do?',
    questionType: 'single',
    options: [
      'A. Set up budgets and alerts in your project.',
      'B. Set up quotas for the resources that your project will be using.',
      'C. Set up a spending limit on the credit card used in your billing account.',
      'D. Label all resources according to best practices, regularly export the billing reports, and analyze them with BigQuery.',
    ],
    correctAnswers: [1],
    explanation:
      'A is not correct because budgets and alerts will result in notifications, but will not prevent excessive resource consumption. B is correct because setting up quotas will prevent resource consumption from exceeding specified limits. C is not correct because it will not prevent excessive resource consumption. Instead, your credit card will incur an unpaid balance; you will receive an email about it from Google and will still be liable to pay. D is not correct because analyzing the root cause for going over the budget will not prevent overspend.',
    difficulty: 'medium',
    gcpServices: ['Cloud Billing', 'Quotas'],
  },

  // Question 20 - Google Cloud Pricing Calculator
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'PRODUCT_PLANNING',
    questionText:
      'Your project team needs to estimate the spending for your Google Cloud project for the next quarter. You know the project requirements. You want to produce your estimate as quickly as possible. What should you do?',
    questionType: 'single',
    options: [
      "A. Build a simple machine learning model that will predict your next month's spend.",
      'B. Estimate the number of hours of compute time required, and then multiply by the VM per-hour pricing.',
      'C. Use the Google Cloud Pricing Calculator to enter your predicted consumption for all groups of resources.',
      'D. Use the Google Cloud Pricing Calculator to enter your consumption for all groups of resources, and then adjust for volume discounts.',
    ],
    correctAnswers: [2],
    explanation:
      'A is not correct because, although ML produces excellent results in many areas, there are more straightforward approaches that require less time to produce an estimate. B is not correct because you need to add other charges, such as storage and data egress charges. C is correct because the Google Cloud Pricing Calculator quickly gives the result, and you know the resources required for the project. D is not correct because volume discounts, also called sustained use discounts, are applied automatically and are included in the calculator estimates.',
    difficulty: 'easy',
    gcpServices: ['Cloud Billing', 'Pricing Calculator'],
  },
];

// Run in transaction
const now = Date.now();
let insertedCount = 0;

db.exec('BEGIN TRANSACTION');
try {
  for (const q of GOOGLE_SAMPLE_QUESTIONS) {
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
      gcpServices: JSON.stringify(q.gcpServices),
      isGenerated: 0,
      source: 'google-sample',
      createdAt: now,
    });
    insertedCount++;
  }

  db.exec('COMMIT');
  console.log(`Successfully inserted ${insertedCount} Google sample questions`);
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Migration failed:', err);
  db.close();
  process.exit(1);
}

db.close();
console.log('Migration complete!');
