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
  },
  {
    code: 'PLAN_CONFIG',
    name: 'Planning and Configuring a Cloud Solution',
    weight: 0.175,
    orderIndex: 2,
    description: 'Plan compute, storage, and network resources for cloud solutions',
    topics: [
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
  },
  {
    code: 'DEPLOY_IMPLEMENT',
    name: 'Deploying and Implementing a Cloud Solution',
    weight: 0.25,
    orderIndex: 3,
    description: 'Deploy compute, storage, networking, and marketplace solutions',
    topics: [
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
  },
  {
    code: 'OPERATIONS',
    name: 'Ensuring Successful Operation of a Cloud Solution',
    weight: 0.2,
    orderIndex: 4,
    description: 'Manage and monitor compute, storage, and networking resources',
    topics: [
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
  },
  {
    code: 'ACCESS_SECURITY',
    name: 'Configuring Access and Security',
    weight: 0.2,
    orderIndex: 5,
    description: 'Manage IAM, service accounts, and security policies',
    topics: [
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
  },
];

// PCA Certification Domain Data (Professional Cloud Architect)
const PCA_DOMAINS = [
  {
    code: 'PCA_DESIGN_PLAN',
    name: 'Designing and Planning a Cloud Solution Architecture',
    weight: 0.25,
    orderIndex: 1,
    description:
      'Design solution infrastructure meeting business and technical requirements using Well-Architected Framework',
    topics: [
      {
        code: 'PCA_BUSINESS_REQ',
        name: 'Designing solution infrastructure per business requirements',
        description:
          'Business case analysis, stakeholder management, success criteria, cost optimization, regulatory compliance',
      },
      {
        code: 'PCA_TECHNICAL_REQ',
        name: 'Designing solution infrastructure per technical requirements',
        description:
          'High availability, scalability, disaster recovery, performance requirements, integration patterns',
      },
      {
        code: 'PCA_RESOURCE_DESIGN',
        name: 'Designing network, storage, and compute resources',
        description:
          'VPC architecture, storage selection, compute selection, hybrid connectivity, data pipeline design',
      },
      {
        code: 'PCA_MIGRATION',
        name: 'Creating a migration plan',
        description:
          'Migration strategies (lift-and-shift, replatform, refactor), data migration, cutover planning',
      },
      {
        code: 'PCA_FUTURE_IMPROVEMENTS',
        name: 'Envisioning future solution improvements',
        description:
          'AI/ML integration, Vertex AI, cloud-native modernization, sustainability considerations',
      },
    ],
  },
  {
    code: 'PCA_MANAGE_PROVISION',
    name: 'Managing and Provisioning a Solution Infrastructure',
    weight: 0.175,
    orderIndex: 2,
    description: 'Configure and deploy network, storage, and compute resources using IaC',
    topics: [
      {
        code: 'PCA_NETWORK_CONFIG',
        name: 'Configuring network topologies',
        description:
          'VPC design, Shared VPC, VPC peering, Cloud Interconnect, Cloud VPN, load balancing',
      },
      {
        code: 'PCA_STORAGE_CONFIG',
        name: 'Configuring individual storage systems',
        description:
          'Cloud Storage classes, persistent disks, Filestore, database provisioning, backup strategies',
      },
      {
        code: 'PCA_COMPUTE_CONFIG',
        name: 'Configuring compute systems',
        description:
          'GCE instances, GKE clusters, Cloud Run, Cloud Functions, App Engine, sole-tenant nodes',
      },
      {
        code: 'PCA_IAC',
        name: 'Implementing Infrastructure as Code',
        description: 'Terraform, Config Connector, Deployment Manager, CI/CD for infrastructure',
      },
    ],
  },
  {
    code: 'PCA_SECURITY_COMPLIANCE',
    name: 'Designing for Security and Compliance',
    weight: 0.175,
    orderIndex: 3,
    description: 'Design secure architectures and ensure regulatory compliance',
    topics: [
      {
        code: 'PCA_SECURITY_DESIGN',
        name: 'Designing for security',
        description:
          'IAM best practices, resource hierarchy, VPC Service Controls, Binary Authorization, Cloud Armor',
      },
      {
        code: 'PCA_DATA_SECURITY',
        name: 'Designing for data security',
        description:
          'Encryption at rest and in transit, Cloud KMS, Secret Manager, DLP, data classification',
      },
      {
        code: 'PCA_COMPLIANCE',
        name: 'Designing for compliance',
        description:
          'HIPAA, SOC 2, GDPR, PCI-DSS, audit logging, compliance reporting, data residency',
      },
    ],
  },
  {
    code: 'PCA_ANALYZE_OPTIMIZE',
    name: 'Analyzing and Optimizing Technical and Business Processes',
    weight: 0.15,
    orderIndex: 4,
    description: 'Analyze processes and implement optimization strategies',
    topics: [
      {
        code: 'PCA_TECH_PROCESSES',
        name: 'Analyzing and defining technical processes',
        description:
          'CI/CD pipelines, testing strategies, release management, technical debt assessment',
      },
      {
        code: 'PCA_BUSINESS_PROCESSES',
        name: 'Analyzing and defining business processes',
        description:
          'Cost analysis, ROI calculation, FinOps practices, capacity planning, vendor management',
      },
      {
        code: 'PCA_RESILIENCE',
        name: 'Developing procedures for testing resilience',
        description: 'Chaos engineering, disaster recovery testing, game days, incident response',
      },
    ],
  },
  {
    code: 'PCA_MANAGE_IMPL',
    name: 'Managing Implementation',
    weight: 0.125,
    orderIndex: 5,
    description: 'Advise teams and interact with Google Cloud programmatically',
    topics: [
      {
        code: 'PCA_TEAM_ADVICE',
        name: 'Advising development and operations teams',
        description:
          'Application deployment, API management with Apigee, troubleshooting, best practices',
      },
      {
        code: 'PCA_PROGRAMMATIC',
        name: 'Interacting with Google Cloud programmatically',
        description: 'Cloud SDK, client libraries, REST APIs, Cloud Shell, Cloud Code',
      },
    ],
  },
  {
    code: 'PCA_OPS_EXCELLENCE',
    name: 'Ensuring Solution and Operations Excellence',
    weight: 0.125,
    orderIndex: 6,
    description: 'Implement monitoring, deployment strategies, and reliability practices',
    topics: [
      {
        code: 'PCA_OBSERVABILITY',
        name: 'Monitoring, logging, profiling, and alerting',
        description:
          'Cloud Monitoring, Cloud Logging, Cloud Trace, Cloud Profiler, alerting policies, dashboards',
      },
      {
        code: 'PCA_DEPLOYMENT',
        name: 'Deployment and release management',
        description:
          'Blue-green deployments, canary releases, rollback strategies, feature flags, traffic management',
      },
      {
        code: 'PCA_RELIABILITY',
        name: 'Ensuring reliability and quality',
        description: 'SLIs, SLOs, SLAs, error budgets, capacity planning, quality control measures',
      },
    ],
  },
];

// Sample questions for initial seeding
const SAMPLE_QUESTIONS = [
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'PROJECTS_ACCOUNTS',
    questionText:
      'Your organization needs to create a new project for a development team. The project should automatically inherit IAM policies from the parent folder. What is the correct approach?',
    questionType: 'single' as const,
    options: [
      'A. Create the project at the organization level and manually copy IAM policies',
      'B. Create the project inside the appropriate folder in the resource hierarchy',
      'C. Create the project and use gcloud to sync IAM policies from the parent',
      'D. Projects cannot inherit IAM policies; they must be configured individually',
    ],
    correctAnswers: [1],
    explanation:
      'IAM policies are inherited down the resource hierarchy in GCP. When you create a project inside a folder, it automatically inherits the IAM policies from that folder (and any parent folders up to the organization). This is the recommended approach for managing access at scale.',
    difficulty: 'medium' as const,
    gcpServices: ['Resource Manager', 'IAM'],
  },
  {
    domainCode: 'SETUP_CLOUD_ENV',
    topicCode: 'BILLING',
    questionText:
      'You need to set up budget alerts for a project that should notify stakeholders when spending reaches 50%, 75%, and 100% of the budget. Which service should you use?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Monitoring with custom metrics',
      'B. Cloud Billing Budgets and Alerts',
      'C. BigQuery billing export with scheduled queries',
      'D. Cloud Functions triggered by Pub/Sub billing events',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Billing Budgets and Alerts is the native GCP service for setting spending thresholds and notifications. You can configure multiple threshold percentages and notification channels (email, Pub/Sub) directly in the Cloud Console or via API.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Billing'],
  },
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'COMPUTE_PLANNING',
    questionText:
      'A batch processing workload runs for 2-3 hours daily and can be interrupted without data loss. Which VM configuration would be most cost-effective?',
    questionType: 'single' as const,
    options: [
      'A. Standard VMs with sustained use discounts',
      'B. Preemptible VMs or Spot VMs',
      'C. Committed use VMs with 1-year commitment',
      'D. Sole-tenant nodes for dedicated hardware',
    ],
    correctAnswers: [1],
    explanation:
      'Preemptible VMs (now called Spot VMs) offer up to 91% discount compared to regular VMs. They are ideal for fault-tolerant, batch workloads that can handle interruption. Since the workload only runs 2-3 hours daily and can be interrupted, Spot VMs provide the best cost optimization.',
    difficulty: 'medium' as const,
    gcpServices: ['Compute Engine'],
  },
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'GKE',
    questionText:
      'You need to deploy a containerized application to GKE that requires access to Cloud SQL. What is the recommended way to provide database credentials to the pods?',
    questionType: 'single' as const,
    options: [
      'A. Store credentials in environment variables in the Deployment YAML',
      'B. Use Workload Identity with a Kubernetes service account mapped to a GCP service account',
      'C. Create a ConfigMap with the database password',
      'D. Mount the credentials from a local file in the container image',
    ],
    correctAnswers: [1],
    explanation:
      'Workload Identity is the recommended way to access GCP services from GKE. It allows Kubernetes service accounts to act as GCP service accounts, providing secure, keyless authentication. This eliminates the need to manage and rotate service account keys.',
    difficulty: 'medium' as const,
    gcpServices: ['GKE', 'Cloud SQL', 'Workload Identity'],
  },
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'SERVERLESS',
    questionText:
      'You want to deploy a containerized web application that automatically scales based on HTTP traffic and scales to zero when idle. Which service should you use?',
    questionType: 'single' as const,
    options: [
      'A. Compute Engine with managed instance groups',
      'B. Google Kubernetes Engine with Horizontal Pod Autoscaler',
      'C. Cloud Run',
      'D. App Engine Flexible Environment',
    ],
    correctAnswers: [2],
    explanation:
      'Cloud Run is a fully managed serverless platform for containerized applications. It automatically scales based on incoming requests and scales to zero when there is no traffic, meaning you only pay for actual usage. This makes it ideal for variable traffic workloads.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Run'],
  },
  {
    domainCode: 'OPERATIONS',
    topicCode: 'MONITORING',
    questionText:
      'Your application logs are stored in Cloud Logging. You need to create a metric that counts the number of 500 errors in your application logs and alert when it exceeds a threshold. What steps should you take? (Choose two)',
    questionType: 'multiple' as const,
    options: [
      'A. Create a logs-based metric with a filter for 500 errors',
      'B. Export logs to BigQuery and create a scheduled query',
      'C. Create an alerting policy based on the logs-based metric',
      'D. Use Cloud Trace to identify error patterns',
      'E. Create a Cloud Function to parse logs and send alerts',
    ],
    correctAnswers: [0, 2],
    explanation:
      'The correct approach is to: 1) Create a logs-based metric in Cloud Logging with a filter that matches 500 errors, and 2) Create an alerting policy in Cloud Monitoring that triggers when the metric exceeds your threshold. This is the native, recommended way to alert on log patterns.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Logging', 'Cloud Monitoring'],
  },
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'IAM',
    questionText:
      'A developer needs to deploy Cloud Functions but should not be able to create or modify IAM policies. Which predefined role should you assign?',
    questionType: 'single' as const,
    options: [
      'A. roles/owner',
      'B. roles/cloudfunctions.developer',
      'C. roles/cloudfunctions.admin',
      'D. roles/editor',
    ],
    correctAnswers: [1],
    explanation:
      'The roles/cloudfunctions.developer role grants permissions to create, update, and delete Cloud Functions without the ability to modify IAM policies. The admin role includes IAM permissions, and owner/editor are overly permissive. Following the principle of least privilege, developer is the correct choice.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Functions', 'IAM'],
  },
  {
    domainCode: 'ACCESS_SECURITY',
    topicCode: 'SERVICE_ACCOUNTS',
    questionText:
      'You need to allow a Compute Engine VM to read objects from a Cloud Storage bucket without using service account keys. What should you do?',
    questionType: 'single' as const,
    options: [
      'A. Attach a service account to the VM with the Storage Object Viewer role',
      'B. Create a service account key and store it on the VM',
      'C. Use signed URLs for all storage access',
      'D. Grant the default compute service account the Storage Admin role',
    ],
    correctAnswers: [0],
    explanation:
      'The recommended approach is to attach a service account to the VM with only the required permissions (Storage Object Viewer for read access). The VM will automatically receive credentials through the metadata service, eliminating the need for key files. This is more secure and easier to manage.',
    difficulty: 'easy' as const,
    gcpServices: ['Compute Engine', 'Cloud Storage', 'IAM'],
  },
  {
    domainCode: 'PLAN_CONFIG',
    topicCode: 'STORAGE_PLANNING',
    questionText:
      'Your application requires a globally distributed, strongly consistent database for user session data with low-latency reads and writes. Which database service should you choose?',
    questionType: 'single' as const,
    options: [
      'A. Cloud SQL with read replicas',
      'B. Cloud Spanner',
      'C. Firestore in Datastore mode',
      'D. Cloud Bigtable',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Spanner is the only GCP database that provides global distribution with strong consistency and low-latency reads/writes. Cloud SQL is regional, Firestore provides eventual consistency for multi-region, and Bigtable is optimized for analytical workloads, not transactional data like sessions.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Spanner'],
  },
  {
    domainCode: 'DEPLOY_IMPLEMENT',
    topicCode: 'DATA_SOLUTIONS',
    questionText:
      'You need to import 500GB of CSV data into BigQuery daily. The data arrives in Cloud Storage. What is the most efficient method?',
    questionType: 'single' as const,
    options: [
      'A. Use the BigQuery web UI to manually upload files',
      'B. Create an external table pointing to Cloud Storage',
      'C. Use a BigQuery load job with wildcard source URIs',
      'D. Stream the data using the BigQuery Streaming API',
    ],
    correctAnswers: [2],
    explanation:
      'For large batch loads from Cloud Storage, BigQuery load jobs are the most efficient option. They support wildcard URIs to load multiple files, are free (no charge for loading data), and can handle large volumes efficiently. External tables have query performance overhead, and streaming has costs and quotas.',
    difficulty: 'medium' as const,
    gcpServices: ['BigQuery', 'Cloud Storage'],
  },
];

// PCA Sample Questions (50 questions for complete exam coverage)
const PCA_SAMPLE_QUESTIONS = [
  // Domain 1: Designing and Planning a Cloud Solution Architecture (13 questions)
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_BUSINESS_REQ',
    questionText:
      'A retail company wants to migrate their e-commerce platform to Google Cloud. They require 99.99% availability during peak shopping seasons and need to comply with PCI-DSS. The CTO wants to minimize operational overhead. Which solution best meets these requirements?',
    questionType: 'single' as const,
    options: [
      'A. Deploy on Compute Engine VMs with managed instance groups across multiple zones',
      'B. Use Cloud Run with Cloud SQL for PostgreSQL and Cloud CDN for static assets',
      'C. Deploy on GKE Autopilot with Cloud Spanner for the database and Cloud Armor for WAF',
      'D. Use App Engine Standard with Firestore and Cloud Load Balancing',
    ],
    correctAnswers: [2],
    explanation:
      'GKE Autopilot provides managed Kubernetes with minimal operational overhead while supporting complex workloads. Cloud Spanner offers 99.999% availability with global consistency required for e-commerce transactions. Cloud Armor provides WAF capabilities for PCI-DSS compliance. This combination best balances availability, compliance, and reduced operational burden.',
    difficulty: 'hard' as const,
    gcpServices: ['GKE', 'Cloud Spanner', 'Cloud Armor'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_BUSINESS_REQ',
    questionText:
      'Your organization is evaluating cloud migration for a legacy application. The CFO requires a clear ROI analysis. Which Google Cloud tools should you use to build the business case? (Choose two)',
    questionType: 'multiple' as const,
    options: [
      'A. Cloud Pricing Calculator for cost estimation',
      'B. Active Assist for optimization recommendations',
      'C. Google Cloud Adoption Framework for migration methodology',
      'D. StratoZone or Migration Center for workload assessment',
      'E. Cloud Trace for performance analysis',
    ],
    correctAnswers: [0, 3],
    explanation:
      'The Cloud Pricing Calculator helps estimate costs for proposed architecture, essential for ROI calculations. StratoZone/Migration Center provides workload discovery and TCO analysis, comparing current on-premises costs with cloud costs. Together, these tools provide the financial data needed for a business case.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Pricing Calculator', 'Migration Center'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_TECHNICAL_REQ',
    questionText:
      'A healthcare company needs to design a system for processing patient records with strict data residency requirements in the EU. The system must handle 10,000 requests per second with sub-100ms latency. Which architecture decision is most critical?',
    questionType: 'single' as const,
    options: [
      'A. Use a single-region deployment in europe-west1 with read replicas',
      'B. Deploy across multiple EU regions with organization policies restricting data location',
      'C. Use Cloud Spanner with a regional configuration in europe-west1',
      'D. Implement a multi-region setup with data replication policies enforced by VPC Service Controls',
    ],
    correctAnswers: [1],
    explanation:
      'For strict EU data residency with high availability, deploying across multiple EU regions provides fault tolerance while organization policies ensure data never leaves the EU. This satisfies both the regulatory requirement and the high availability needs for 10K RPS workloads.',
    difficulty: 'hard' as const,
    gcpServices: ['Organization Policy Service', 'Cloud Spanner'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_TECHNICAL_REQ',
    questionText:
      'You are designing a real-time analytics platform that must process streaming data from IoT devices. The system needs to handle variable loads from 1,000 to 1,000,000 events per second. Which architecture pattern should you recommend?',
    questionType: 'single' as const,
    options: [
      'A. Pub/Sub → Dataflow → BigQuery with streaming inserts',
      'B. Cloud IoT Core → Cloud Functions → Cloud SQL',
      'C. Pub/Sub → Cloud Run → Bigtable',
      'D. Kafka on GKE → Apache Spark on Dataproc → Cloud Storage',
    ],
    correctAnswers: [0],
    explanation:
      'Pub/Sub handles massive message ingestion with automatic scaling. Dataflow provides exactly-once processing semantics and auto-scaling for streaming pipelines. BigQuery streaming inserts support high-volume real-time analytics. This serverless pattern handles the 1000x load variation without manual intervention.',
    difficulty: 'medium' as const,
    gcpServices: ['Pub/Sub', 'Dataflow', 'BigQuery'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_RESOURCE_DESIGN',
    questionText:
      'A company has multiple development teams that need isolated environments but must share some common services like logging and monitoring. Which VPC design pattern is most appropriate?',
    questionType: 'single' as const,
    options: [
      'A. Single VPC with subnets per team and firewall rules for isolation',
      'B. Separate VPCs per team connected via VPC Peering',
      'C. Shared VPC with host project for common services and service projects per team',
      'D. Multiple standalone VPCs with Cloud NAT for egress',
    ],
    correctAnswers: [2],
    explanation:
      'Shared VPC is designed for exactly this use case. The host project contains shared resources (logging, monitoring, common services) while service projects provide isolation for each team. This maintains central control over networking while allowing team autonomy.',
    difficulty: 'easy' as const,
    gcpServices: ['Shared VPC', 'VPC'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_RESOURCE_DESIGN',
    questionText:
      'You need to choose a database for a gaming application that requires sub-millisecond read latency for player session data, handles 500,000 reads per second, and stores 50TB of data. Which database should you select?',
    questionType: 'single' as const,
    options: [
      'A. Cloud SQL with read replicas',
      'B. Cloud Spanner with regional configuration',
      'C. Cloud Bigtable',
      'D. Memorystore for Redis',
    ],
    correctAnswers: [2],
    explanation:
      'Cloud Bigtable is designed for sub-millisecond latency at massive scale. It handles millions of reads per second and petabytes of data. For session data requiring extreme read performance at 50TB scale, Bigtable is the optimal choice. Memorystore has size limits, Spanner has higher latency, and Cloud SQL cannot scale to this level.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Bigtable'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_MIGRATION',
    questionText:
      'A financial services company is migrating a monolithic Java application to Google Cloud. They want to modernize incrementally while maintaining business continuity. Which migration strategy should you recommend?',
    questionType: 'single' as const,
    options: [
      'A. Big-bang rewrite to microservices on Cloud Run',
      'B. Lift-and-shift to Compute Engine, then refactor to GKE',
      'C. Strangler fig pattern: gradually extract services while running the monolith on GKE',
      'D. Direct containerization to Cloud Run without code changes',
    ],
    correctAnswers: [2],
    explanation:
      'The strangler fig pattern allows incremental modernization by gradually extracting functionality into new services while the monolith continues running. This minimizes risk and maintains business continuity. GKE supports both the legacy monolith and new microservices, enabling gradual transition.',
    difficulty: 'medium' as const,
    gcpServices: ['GKE'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_MIGRATION',
    questionText:
      'Your company needs to migrate 500TB of data from an on-premises data center to Cloud Storage. The migration must complete within 2 weeks, and the network connection is 1 Gbps. What approach should you take?',
    questionType: 'single' as const,
    options: [
      'A. Use gsutil with parallel composite uploads over the existing network',
      'B. Order a Transfer Appliance for physical data transfer',
      'C. Set up Cloud Interconnect and use Storage Transfer Service',
      'D. Use Cloud VPN with multiple tunnels for increased bandwidth',
    ],
    correctAnswers: [1],
    explanation:
      'At 1 Gbps, transferring 500TB would take approximately 46 days (500TB × 8 / 1Gbps = ~46 days), exceeding the 2-week requirement. The Transfer Appliance can hold up to 1PB and provides physical transfer that bypasses network limitations. This is the only option that can meet the timeline.',
    difficulty: 'easy' as const,
    gcpServices: ['Transfer Appliance', 'Cloud Storage'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_FUTURE_IMPROVEMENTS',
    questionText:
      'A media company wants to add AI-powered content recommendations to their streaming platform. They have limited ML expertise in-house. Which approach aligns with the Well-Architected Framework principle of operational excellence?',
    questionType: 'single' as const,
    options: [
      'A. Build custom ML models using TensorFlow on Vertex AI Training',
      'B. Use Recommendations AI, a fully managed service for personalization',
      'C. Deploy open-source recommendation engines on GKE',
      'D. Implement collaborative filtering using BigQuery ML',
    ],
    correctAnswers: [1],
    explanation:
      'Recommendations AI is a fully managed service that requires minimal ML expertise while providing production-ready recommendations. This aligns with the operational excellence pillar by reducing operational burden and using managed services. It allows the team to focus on business logic rather than ML infrastructure.',
    difficulty: 'easy' as const,
    gcpServices: ['Recommendations AI', 'Vertex AI'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_FUTURE_IMPROVEMENTS',
    questionText:
      'A logistics company wants to implement predictive maintenance for their fleet using IoT sensor data. They need to train custom ML models on their historical data. Which Vertex AI components should they use? (Choose two)',
    questionType: 'multiple' as const,
    options: [
      'A. Vertex AI Workbench for exploratory data analysis and model development',
      'B. Vertex AI Feature Store for managing ML features',
      'C. Cloud Vision API for image analysis',
      'D. Vertex AI Pipelines for automated training workflows',
      'E. Document AI for processing maintenance logs',
    ],
    correctAnswers: [0, 3],
    explanation:
      'Vertex AI Workbench provides managed Jupyter notebooks for data scientists to explore data and develop models. Vertex AI Pipelines enables automated, reproducible ML workflows for training and deployment. Together, these components support the full ML development lifecycle for custom predictive maintenance models.',
    difficulty: 'medium' as const,
    gcpServices: ['Vertex AI Workbench', 'Vertex AI Pipelines'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_TECHNICAL_REQ',
    questionText:
      'You are designing a disaster recovery solution for a critical application. The business requires an RTO of 15 minutes and RPO of 5 minutes. Which architecture pattern should you implement?',
    questionType: 'single' as const,
    options: [
      'A. Cold standby with daily backups to Cloud Storage',
      'B. Warm standby with asynchronous database replication',
      'C. Hot standby with synchronous replication and automatic failover',
      'D. Pilot light with minimal infrastructure kept running',
    ],
    correctAnswers: [2],
    explanation:
      'An RTO of 15 minutes and RPO of 5 minutes requires near-instant failover with minimal data loss. Hot standby with synchronous replication ensures data is copied in real-time (meeting RPO), and automatic failover enables rapid recovery (meeting RTO). Cold/warm/pilot light approaches cannot meet these aggressive requirements.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud SQL', 'Cloud Spanner', 'Cloud Load Balancing'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_BUSINESS_REQ',
    questionText:
      'A startup is launching a new SaaS product and needs to design for rapid growth. They expect user growth from 1,000 to 1,000,000 users within 18 months. Which design principle is most important?',
    questionType: 'single' as const,
    options: [
      'A. Design for current load with manual scaling procedures',
      'B. Over-provision resources to handle maximum expected load',
      'C. Use managed services with automatic scaling capabilities',
      'D. Implement custom auto-scaling using Cloud Functions',
    ],
    correctAnswers: [2],
    explanation:
      'For 1000x growth, managed services with automatic scaling (Cloud Run, GKE Autopilot, Cloud SQL) provide the elasticity needed without operational overhead. This follows the Well-Architected Framework principle of using managed services for scale. Over-provisioning wastes resources; manual scaling cannot keep pace with rapid growth.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Run', 'GKE', 'Cloud SQL'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_RESOURCE_DESIGN',
    questionText:
      'You are designing a data lake architecture for a large enterprise. The solution must support both batch and real-time analytics, handle structured and unstructured data, and integrate with existing BI tools. Which architecture should you recommend?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Storage as the data lake with BigQuery for analytics and Looker for BI',
      'B. Cloud SQL for structured data and Cloud Storage for unstructured data',
      'C. BigQuery as both storage and compute layer with federated queries',
      'D. Dataproc with HDFS for all data processing needs',
    ],
    correctAnswers: [0],
    explanation:
      'Cloud Storage provides cost-effective storage for all data types (the data lake). BigQuery offers high-performance analytics for both batch and real-time queries with native Cloud Storage integration. Looker provides enterprise BI capabilities. This architecture separates storage and compute, enabling independent scaling.',
    difficulty: 'hard' as const,
    gcpServices: ['Cloud Storage', 'BigQuery', 'Looker'],
  },

  // Domain 2: Managing and Provisioning a Solution Infrastructure (9 questions)
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_NETWORK_CONFIG',
    questionText:
      'Your organization needs to connect their on-premises data center to Google Cloud. They require 10 Gbps of dedicated bandwidth with 99.99% availability. Which connectivity option should you recommend?',
    questionType: 'single' as const,
    options: [
      'A. Cloud VPN with multiple tunnels',
      'B. Dedicated Interconnect with redundant connections',
      'C. Partner Interconnect with a single connection',
      'D. Cloud NAT with Direct Peering',
    ],
    correctAnswers: [1],
    explanation:
      'Dedicated Interconnect provides 10/100 Gbps connections directly to Google. For 99.99% availability SLA, you need redundant connections in two different edge availability domains. Cloud VPN is limited to 3 Gbps per tunnel. Partner Interconnect is for smaller bandwidth needs.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Interconnect'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_NETWORK_CONFIG',
    questionText:
      'You need to configure load balancing for a global application serving users in North America, Europe, and Asia. The application runs on GKE and requires WebSocket support. Which load balancer should you use?',
    questionType: 'single' as const,
    options: [
      'A. Regional external HTTP(S) Load Balancer',
      'B. Global external HTTP(S) Load Balancer (classic)',
      'C. Global external Application Load Balancer',
      'D. Regional internal TCP/UDP Load Balancer',
    ],
    correctAnswers: [2],
    explanation:
      'The Global external Application Load Balancer (the new advanced HTTP(S) LB) supports WebSocket connections, provides global anycast routing for users across continents, and integrates with GKE through Gateway API or Ingress. It offers the best performance for global applications.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Load Balancing', 'GKE'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_STORAGE_CONFIG',
    questionText:
      'A video streaming platform needs to store 1PB of video content. Most content is accessed frequently for 30 days after upload, then rarely accessed. How should you configure Cloud Storage for cost optimization?',
    questionType: 'single' as const,
    options: [
      'A. Use Standard storage class for all content',
      'B. Use Nearline storage class for all content',
      'C. Use Standard storage with Object Lifecycle Management to transition to Coldline after 30 days',
      'D. Use Autoclass to automatically manage storage classes',
    ],
    correctAnswers: [3],
    explanation:
      'Autoclass automatically transitions objects between storage classes based on access patterns. For content with predictable initial high access that decreases over time, Autoclass provides optimal cost savings without requiring manual lifecycle policy configuration. It handles the transition from Standard to Nearline to Coldline automatically.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Storage'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_STORAGE_CONFIG',
    questionText:
      'Your application requires a fully managed NFS file system for shared storage across multiple Compute Engine instances. The workload is latency-sensitive with random I/O patterns. Which service should you use?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Storage with Cloud Storage FUSE',
      'B. Filestore Basic tier',
      'C. Filestore Enterprise tier',
      'D. Persistent Disk SSD in multi-attach mode',
    ],
    correctAnswers: [2],
    explanation:
      'Filestore Enterprise tier provides the lowest latency and highest performance for random I/O workloads. It offers SSD-backed storage with consistent performance. Basic tier is suitable for less demanding workloads. Cloud Storage FUSE adds latency. Multi-attach PD has limitations and is not a true shared file system.',
    difficulty: 'medium' as const,
    gcpServices: ['Filestore'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_COMPUTE_CONFIG',
    questionText:
      'You need to deploy a stateless containerized application that experiences unpredictable traffic spikes, sometimes from 0 to 10,000 requests per second within minutes. Which compute platform is most suitable?',
    questionType: 'single' as const,
    options: [
      'A. GKE Standard with Cluster Autoscaler',
      'B. Cloud Run',
      'C. Compute Engine with managed instance groups',
      'D. GKE Autopilot',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Run scales from 0 to thousands of instances within seconds, handling extreme traffic spikes for stateless containers. It provides the fastest scale-up time among the options. GKE (both Standard and Autopilot) has slower node provisioning. Cloud Run is ideal for unpredictable, spiky workloads.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Run'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_COMPUTE_CONFIG',
    questionText:
      'A machine learning team needs GPU-enabled compute resources for training models. They want to minimize costs for jobs that can be interrupted. Which configuration should you recommend?',
    questionType: 'single' as const,
    options: [
      'A. GKE Standard cluster with GPU node pools using on-demand instances',
      'B. Compute Engine Spot VMs with attached GPUs',
      'C. Vertex AI Training with preemptible VMs',
      'D. Cloud TPUs with on-demand pricing',
    ],
    correctAnswers: [1],
    explanation:
      'Spot VMs with GPUs offer up to 91% discount compared to on-demand GPU instances. For interruptible ML training jobs, this provides significant cost savings. Vertex AI Training also supports preemptible instances, but direct Spot VMs offer more flexibility for custom training setups.',
    difficulty: 'easy' as const,
    gcpServices: ['Compute Engine'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_IAC',
    questionText:
      'Your organization wants to implement infrastructure as code for their Google Cloud environment. They need to support GitOps workflows and want policy guardrails. Which combination of tools should you recommend? (Choose two)',
    questionType: 'multiple' as const,
    options: [
      'A. Terraform with Cloud Build for CI/CD',
      'B. Config Connector for Kubernetes-native resource management',
      'C. Deployment Manager for declarative infrastructure',
      'D. Policy Controller for policy enforcement',
      'E. Cloud Functions for infrastructure automation',
    ],
    correctAnswers: [0, 3],
    explanation:
      'Terraform with Cloud Build provides robust IaC with GitOps workflows through version-controlled infrastructure definitions. Policy Controller (based on OPA Gatekeeper) enforces policies on Kubernetes resources including Config Connector-managed GCP resources. Together they enable GitOps with policy guardrails.',
    difficulty: 'hard' as const,
    gcpServices: ['Cloud Build', 'Policy Controller', 'Terraform'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_NETWORK_CONFIG',
    questionText:
      'You need to enable communication between two VPCs in different projects within the same organization. The VPCs have overlapping IP ranges. What should you do?',
    questionType: 'single' as const,
    options: [
      'A. Set up VPC Network Peering between the VPCs',
      'B. Use Cloud VPN to connect the VPCs',
      'C. Reconfigure IP ranges to eliminate overlap, then use VPC Peering',
      'D. Create a Shared VPC to combine both networks',
    ],
    correctAnswers: [2],
    explanation:
      'VPC Peering cannot connect VPCs with overlapping IP ranges - this is a fundamental limitation. The solution requires reconfiguring IP ranges to eliminate overlap before peering can be established. Cloud VPN also cannot route overlapping ranges without NAT. Shared VPC would require network restructuring as well.',
    difficulty: 'medium' as const,
    gcpServices: ['VPC', 'VPC Network Peering'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_IAC',
    questionText:
      'You want to manage Google Cloud resources using Kubernetes-native tooling. Your team is already using kubectl and Helm. Which approach should you take?',
    questionType: 'single' as const,
    options: [
      'A. Use Terraform with the Google provider',
      'B. Use Config Connector installed on your GKE cluster',
      'C. Use Deployment Manager templates',
      'D. Use Cloud SDK scripts in your CI/CD pipeline',
    ],
    correctAnswers: [1],
    explanation:
      'Config Connector allows managing Google Cloud resources as Kubernetes custom resources using familiar tools like kubectl and Helm. It integrates with the Kubernetes ecosystem the team already uses, enabling consistent workflows for both cluster resources and GCP infrastructure.',
    difficulty: 'medium' as const,
    gcpServices: ['Config Connector', 'GKE'],
  },

  // Domain 3: Designing for Security and Compliance (9 questions)
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_SECURITY_DESIGN',
    questionText:
      'A financial institution needs to ensure that sensitive data in Cloud Storage cannot be accessed from the public internet, even if bucket permissions are misconfigured. Which security control should be implemented?',
    questionType: 'single' as const,
    options: [
      'A. Enable uniform bucket-level access',
      'B. Configure VPC Service Controls perimeter around the project',
      'C. Set up Cloud Armor policies',
      'D. Enable data access audit logs',
    ],
    correctAnswers: [1],
    explanation:
      'VPC Service Controls create a security perimeter that prevents data exfiltration regardless of IAM permissions. Even if a bucket is accidentally made public, VPC-SC blocks access from outside the perimeter. This provides defense-in-depth against misconfiguration.',
    difficulty: 'medium' as const,
    gcpServices: ['VPC Service Controls', 'Cloud Storage'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_SECURITY_DESIGN',
    questionText:
      'Your security team requires that all container images deployed to production GKE clusters are signed and verified. Which service should you use?',
    questionType: 'single' as const,
    options: [
      'A. Container Registry vulnerability scanning',
      'B. Binary Authorization',
      'C. Cloud Armor with custom rules',
      'D. Web Security Scanner',
    ],
    correctAnswers: [1],
    explanation:
      'Binary Authorization enforces deploy-time security policies for GKE. It verifies that container images are signed by trusted authorities before allowing deployment. This ensures only approved, verified images run in production, preventing unauthorized or tampered images.',
    difficulty: 'easy' as const,
    gcpServices: ['Binary Authorization', 'GKE'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_DATA_SECURITY',
    questionText:
      'Your application processes credit card data and must be PCI-DSS compliant. You need to encrypt sensitive fields in Cloud SQL using customer-managed encryption keys (CMEK). Which service manages these keys?',
    questionType: 'single' as const,
    options: ['A. Cloud HSM', 'B. Cloud KMS', 'C. Secret Manager', 'D. Cloud Data Loss Prevention'],
    correctAnswers: [1],
    explanation:
      'Cloud KMS manages customer-controlled encryption keys used for CMEK in Cloud SQL and other services. It provides key lifecycle management, rotation, and access control. Cloud HSM provides hardware-backed keys within Cloud KMS for additional security but is not a separate key management service.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud KMS', 'Cloud SQL'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_DATA_SECURITY',
    questionText:
      'You need to detect and redact personally identifiable information (PII) from documents before storing them in Cloud Storage. Which service should you use?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Data Loss Prevention (DLP)',
      'B. Security Command Center',
      'C. Cloud Armor',
      'D. Access Transparency',
    ],
    correctAnswers: [0],
    explanation:
      'Cloud DLP is specifically designed to discover, classify, and protect sensitive data. It can scan content for PII (names, SSNs, credit cards, etc.) and apply transformations like redaction, masking, or tokenization before data is stored. This is essential for data protection compliance.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Data Loss Prevention'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_COMPLIANCE',
    questionText:
      'Your organization operates in the EU and must comply with GDPR data residency requirements. How should you configure your Google Cloud environment to ensure compute and storage resources are only created in EU regions?',
    questionType: 'single' as const,
    options: [
      'A. Create separate projects for each region and use IAM to restrict access',
      'B. Configure Organization Policy constraints to restrict resource locations',
      'C. Use VPC Service Controls to block non-EU traffic',
      'D. Set up Cloud Monitoring alerts for resources created outside EU',
    ],
    correctAnswers: [1],
    explanation:
      'Organization Policy constraints (specifically gcp.resourceLocations) proactively prevent resources from being created outside allowed regions. This is a preventive control that enforces compliance at creation time, unlike reactive controls like monitoring alerts. VPC-SC controls data access, not resource location.',
    difficulty: 'medium' as const,
    gcpServices: ['Organization Policy Service'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_COMPLIANCE',
    questionText:
      'Your company needs to demonstrate HIPAA compliance for a healthcare application. Which Google Cloud feature provides evidence of Google`s compliance with HIPAA requirements?',
    questionType: 'single' as const,
    options: [
      'A. Security Command Center findings',
      'B. Cloud Audit Logs',
      'C. Compliance Reports Manager in Google Cloud Console',
      'D. Access Transparency logs',
    ],
    correctAnswers: [2],
    explanation:
      'Compliance Reports Manager provides access to third-party audit reports and certifications (SOC 1/2/3, ISO 27001, HIPAA, etc.) that demonstrate Google Cloud`s compliance with various regulatory frameworks. This documentation supports customer compliance efforts during audits.',
    difficulty: 'medium' as const,
    gcpServices: ['Compliance Reports Manager'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_SECURITY_DESIGN',
    questionText:
      'You need to implement a zero-trust security model for accessing Google Cloud resources from employee devices. Which Google Cloud service should be the foundation of this architecture?',
    questionType: 'single' as const,
    options: [
      'A. Cloud VPN with multi-factor authentication',
      'B. Identity-Aware Proxy (IAP)',
      'C. Cloud NAT with firewall rules',
      'D. Private Google Access',
    ],
    correctAnswers: [1],
    explanation:
      'Identity-Aware Proxy implements zero-trust access by verifying user identity and device context before granting access to applications. It removes the need for VPN by authenticating at the application layer. IAP integrates with BeyondCorp Enterprise for comprehensive zero-trust security.',
    difficulty: 'medium' as const,
    gcpServices: ['Identity-Aware Proxy'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_DATA_SECURITY',
    questionText:
      'An application needs to securely store API keys and database credentials. The credentials should be versioned and auditable, with automatic rotation support. Which service should you use?',
    questionType: 'single' as const,
    options: [
      'A. Cloud KMS',
      'B. Environment variables in Cloud Run',
      'C. Secret Manager',
      'D. Cloud Storage with CMEK encryption',
    ],
    correctAnswers: [2],
    explanation:
      'Secret Manager is purpose-built for storing sensitive data like API keys, passwords, and certificates. It provides versioning, access auditing through Cloud Audit Logs, and supports automatic rotation through integration with Cloud Functions. KMS manages encryption keys, not secrets.',
    difficulty: 'easy' as const,
    gcpServices: ['Secret Manager'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_SECURITY_DESIGN',
    questionText:
      'Your organization wants to centrally manage and monitor security vulnerabilities, misconfigurations, and threats across all Google Cloud projects. Which service provides this capability?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Audit Logs',
      'B. Security Command Center',
      'C. Cloud Monitoring',
      'D. Policy Controller',
    ],
    correctAnswers: [1],
    explanation:
      'Security Command Center (SCC) is Google Cloud`s native security and risk management platform. It provides centralized visibility into security vulnerabilities, misconfigurations, and threats across the organization. SCC integrates findings from multiple security services and enables security posture management.',
    difficulty: 'hard' as const,
    gcpServices: ['Security Command Center'],
  },

  // Domain 4: Analyzing and Optimizing Technical and Business Processes (7 questions)
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_TECH_PROCESSES',
    questionText:
      'Your development team wants to implement CI/CD for a microservices application on GKE. They need automated testing, container building, and deployment with approval gates for production. Which services should they use? (Choose two)',
    questionType: 'multiple' as const,
    options: [
      'A. Cloud Build for CI/CD pipelines',
      'B. Cloud Composer for workflow orchestration',
      'C. Cloud Deploy for continuous delivery with approvals',
      'D. Cloud Scheduler for timed deployments',
      'E. Artifact Registry for container storage',
    ],
    correctAnswers: [0, 2],
    explanation:
      'Cloud Build handles the CI portion: running tests, building containers, and pushing to Artifact Registry. Cloud Deploy provides managed continuous delivery with deployment pipelines, approval gates, and rollback capabilities specifically designed for GKE and Cloud Run. Together they form a complete CI/CD solution.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Build', 'Cloud Deploy'],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_TECH_PROCESSES',
    questionText:
      'You need to implement a testing strategy for a serverless application. The application uses Cloud Run, Cloud Functions, Firestore, and Pub/Sub. Which approach provides the most comprehensive testing?',
    questionType: 'single' as const,
    options: [
      'A. Unit tests with mocked dependencies only',
      'B. Integration tests against production services',
      'C. Unit tests with mocks, integration tests with emulators, and end-to-end tests in a staging environment',
      'D. End-to-end tests in production with feature flags',
    ],
    correctAnswers: [2],
    explanation:
      'A comprehensive testing strategy includes multiple layers: unit tests with mocks for fast feedback, integration tests with local emulators (Firestore, Pub/Sub emulators) for realistic testing without cloud costs, and end-to-end tests in staging to verify the complete system. This provides confidence while managing costs and complexity.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Run', 'Cloud Functions', 'Firestore', 'Pub/Sub'],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_BUSINESS_PROCESSES',
    questionText:
      'Your organization wants to optimize cloud spending without impacting performance. The cloud bill shows significant spend on Compute Engine. Which tool provides AI-powered recommendations for right-sizing VMs?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Billing reports',
      'B. Active Assist with Recommender',
      'C. Cloud Monitoring dashboards',
      'D. Cost Management tools',
    ],
    correctAnswers: [1],
    explanation:
      'Active Assist uses machine learning to analyze resource utilization and provides specific recommendations through Recommender. For Compute Engine, it suggests VM right-sizing based on actual usage patterns, potentially reducing costs by identifying over-provisioned instances without manual analysis.',
    difficulty: 'easy' as const,
    gcpServices: ['Active Assist', 'Recommender'],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_BUSINESS_PROCESSES',
    questionText:
      'A company is comparing cloud costs to their on-premises data center. They need to perform a TCO analysis that includes hidden costs like power, cooling, and personnel. Which approach should they take?',
    questionType: 'single' as const,
    options: [
      'A. Use only the Cloud Pricing Calculator for cloud costs',
      'B. Use Migration Center for comprehensive TCO analysis',
      'C. Compare cloud monthly bills to data center lease costs',
      'D. Calculate server hardware costs only',
    ],
    correctAnswers: [1],
    explanation:
      'Migration Center (formerly StratoZone and TCO Calculator) performs comprehensive TCO analysis including hidden on-premises costs like facilities, power, cooling, networking, storage, and personnel. It compares these against projected cloud costs for an accurate financial comparison.',
    difficulty: 'easy' as const,
    gcpServices: ['Migration Center'],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_RESILIENCE',
    questionText:
      'Your organization wants to test their disaster recovery procedures for a production system. The test should validate RTO and RPO requirements without impacting users. What approach should you recommend?',
    questionType: 'single' as const,
    options: [
      'A. Perform a tabletop exercise with documentation review',
      'B. Conduct a full failover test during a maintenance window',
      'C. Implement chaos engineering with gradual fault injection',
      'D. Test backup restoration in an isolated environment',
    ],
    correctAnswers: [2],
    explanation:
      'Chaos engineering with gradual fault injection allows testing disaster recovery in production with controlled blast radius. You can validate actual system behavior under failure conditions without full failover risk. This provides more realistic validation than tabletop exercises while being safer than full failover tests.',
    difficulty: 'hard' as const,
    gcpServices: ['Cloud Monitoring', 'Cloud Logging'],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_RESILIENCE',
    questionText:
      'You are designing an incident response process for a cloud-native application. Which practice aligns with the SRE (Site Reliability Engineering) approach to incident management?',
    questionType: 'single' as const,
    options: [
      'A. Assign blame to individuals who caused the incident',
      'B. Conduct blameless post-mortems focused on systemic improvements',
      'C. Immediately implement all suggested fixes after an incident',
      'D. Keep incident details confidential within the operations team',
    ],
    correctAnswers: [1],
    explanation:
      'Blameless post-mortems are a core SRE practice. They focus on understanding systemic factors that contributed to incidents rather than individual blame. This encourages transparency, learning, and systemic improvements while avoiding a culture where people hide mistakes.',
    difficulty: 'medium' as const,
    gcpServices: [],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_TECH_PROCESSES',
    questionText:
      'A development team is experiencing slow feedback loops due to long-running end-to-end tests in their CI/CD pipeline. How should they optimize the pipeline while maintaining quality?',
    questionType: 'single' as const,
    options: [
      'A. Remove end-to-end tests entirely to speed up deployments',
      'B. Run all tests in parallel using Cloud Build concurrent builds',
      'C. Implement a testing pyramid with more unit tests, fewer E2E tests, and run E2E tests only on main branch',
      'D. Move all testing to post-deployment monitoring',
    ],
    correctAnswers: [2],
    explanation:
      'The testing pyramid recommends many fast unit tests, fewer integration tests, and minimal E2E tests. Running comprehensive E2E tests only on the main branch (after PR merge) maintains quality while providing fast feedback for feature development. This balances speed and confidence.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Build'],
  },

  // Domain 5: Managing Implementation (6 questions)
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_TEAM_ADVICE',
    questionText:
      'A development team is struggling with API versioning for their microservices. They need to support multiple API versions while deprecating old ones gracefully. Which Google Cloud service provides comprehensive API management capabilities?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Endpoints',
      'B. Apigee API Management',
      'C. API Gateway',
      'D. Cloud Load Balancing with URL maps',
    ],
    correctAnswers: [1],
    explanation:
      'Apigee provides comprehensive API management including version management, deprecation policies, developer portals, analytics, and monetization. It supports complex API lifecycle management needs for enterprise microservices. Cloud Endpoints and API Gateway are lighter-weight options for simpler use cases.',
    difficulty: 'medium' as const,
    gcpServices: ['Apigee'],
  },
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_TEAM_ADVICE',
    questionText:
      'An operations team needs to troubleshoot a performance issue in a distributed application spanning Cloud Run, Cloud Functions, and GKE. Which tool provides end-to-end distributed tracing?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Logging with log correlation',
      'B. Cloud Trace',
      'C. Cloud Profiler',
      'D. Error Reporting',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Trace provides distributed tracing that follows requests across service boundaries, showing latency at each step. It integrates with Cloud Run, Cloud Functions, and GKE, providing visibility into end-to-end request flow. This helps identify which service or call is causing performance issues.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Trace'],
  },
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_PROGRAMMATIC',
    questionText:
      'A developer needs to automate infrastructure provisioning from their local machine. They want IDE integration, syntax highlighting, and the ability to preview changes before applying. Which tool combination should they use?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Console with gcloud commands',
      'B. Terraform with VS Code extension and terraform plan',
      'C. Cloud Shell only',
      'D. REST API calls with curl',
    ],
    correctAnswers: [1],
    explanation:
      'Terraform with VS Code extension provides IDE integration (syntax highlighting, autocomplete, error checking) and the terraform plan command shows a preview of changes before applying. This enables a productive local development workflow with change validation.',
    difficulty: 'easy' as const,
    gcpServices: ['Terraform'],
  },
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_PROGRAMMATIC',
    questionText:
      'You need to write a script that lists all Compute Engine instances across all projects in your organization. Which approach is most efficient?',
    questionType: 'single' as const,
    options: [
      'A. Use gcloud compute instances list with --project flag for each project',
      'B. Use Cloud Asset Inventory to query compute instances across the organization',
      'C. Query the Compute Engine API directly for each project',
      'D. Export billing data and parse instance names',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Asset Inventory provides a unified view of resources across the entire organization with a single API call. It efficiently queries assets without iterating through projects. This is significantly faster and simpler than querying each project individually.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Asset Inventory'],
  },
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_TEAM_ADVICE',
    questionText:
      'A team is adopting Kubernetes but lacks expertise. They want to minimize the learning curve while still using Kubernetes APIs. Which GKE mode should they use?',
    questionType: 'single' as const,
    options: [
      'A. GKE Standard with manual node management',
      'B. GKE Autopilot',
      'C. Self-managed Kubernetes on Compute Engine',
      'D. Anthos on bare metal',
    ],
    correctAnswers: [1],
    explanation:
      'GKE Autopilot manages the cluster infrastructure automatically (nodes, scaling, security patches) while providing full Kubernetes API compatibility. Teams can focus on deploying workloads without managing nodes, reducing the operational learning curve while retaining Kubernetes portability.',
    difficulty: 'easy' as const,
    gcpServices: ['GKE'],
  },
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_PROGRAMMATIC',
    questionText:
      'You need to quickly test a gcloud command against your GCP environment from a machine without the SDK installed. What is the fastest option?',
    questionType: 'single' as const,
    options: [
      'A. Install Cloud SDK locally',
      'B. Use Cloud Shell from the Google Cloud Console',
      'C. Set up a Compute Engine VM with Cloud SDK',
      'D. Use the REST API with curl',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Shell provides an instant, authenticated command-line environment in the browser with gcloud and common tools pre-installed. It requires no local setup and is accessible from any machine with a browser, making it the fastest option for quick testing.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Shell'],
  },

  // Domain 6: Ensuring Solution and Operations Excellence (6 questions)
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_OBSERVABILITY',
    questionText:
      'You need to set up monitoring for a critical production application. Which metrics should you prioritize for alerting based on the Four Golden Signals? (Choose two)',
    questionType: 'multiple' as const,
    options: [
      'A. CPU utilization percentage',
      'B. Request latency (p50, p95, p99)',
      'C. Error rate (5xx responses)',
      'D. Disk space usage',
      'E. Memory utilization',
    ],
    correctAnswers: [1, 2],
    explanation:
      'The Four Golden Signals are Latency, Traffic, Errors, and Saturation. Request latency (especially p95, p99) and error rate directly measure user experience and are the most actionable for alerting. CPU and memory are saturation indicators but less directly tied to user impact.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Monitoring'],
  },
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_OBSERVABILITY',
    questionText:
      'A production application is experiencing intermittent slowness. You need to identify which function calls are consuming the most CPU time. Which service should you use?',
    questionType: 'single' as const,
    options: ['A. Cloud Trace', 'B. Cloud Profiler', 'C. Cloud Monitoring', 'D. Cloud Logging'],
    correctAnswers: [1],
    explanation:
      'Cloud Profiler provides continuous CPU and memory profiling of production applications with minimal overhead. It shows which functions consume the most resources, enabling optimization of hot paths. Cloud Trace shows request flow; Profiler shows resource consumption within the application.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Profiler'],
  },
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_DEPLOYMENT',
    questionText:
      'You want to deploy a new version of an application to Cloud Run with minimal risk. You need the ability to route a small percentage of traffic to the new version first. Which deployment strategy should you use?',
    questionType: 'single' as const,
    options: [
      'A. Rolling update with immediate full rollout',
      'B. Blue-green deployment with instant cutover',
      'C. Canary deployment with traffic splitting',
      'D. Recreate deployment with downtime window',
    ],
    correctAnswers: [2],
    explanation:
      'Cloud Run natively supports traffic splitting between revisions, enabling canary deployments. You can route a small percentage (e.g., 5%) to the new revision, monitor for issues, then gradually increase traffic. This minimizes the blast radius of potential problems.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Run'],
  },
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_RELIABILITY',
    questionText:
      'Your team has defined an SLO of 99.9% availability for an API. After calculating, this gives you an error budget of approximately 43 minutes of downtime per month. How should you use this error budget?',
    questionType: 'single' as const,
    options: [
      'A. Try to use all 43 minutes each month for deployments',
      'B. Reserve it for planned maintenance windows only',
      'C. Balance between feature velocity and reliability work based on budget consumption',
      'D. Ignore it and focus only on achieving 100% availability',
    ],
    correctAnswers: [2],
    explanation:
      'Error budget should balance innovation and reliability. When the budget is healthy, prioritize feature velocity. When it is depleted, shift focus to reliability work. This SRE practice avoids both over-engineering for unnecessary reliability and moving too fast at the cost of user experience.',
    difficulty: 'hard' as const,
    gcpServices: [],
  },
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_RELIABILITY',
    questionText:
      'You are defining SLIs for a web application. Which SLI definition best measures user-perceived availability?',
    questionType: 'single' as const,
    options: [
      'A. Percentage of time the server process is running',
      'B. Percentage of successful HTTP requests (non-5xx) as measured at the load balancer',
      'C. Average CPU utilization below 80%',
      'D. Number of pods in Running state in Kubernetes',
    ],
    correctAnswers: [1],
    explanation:
      'User-perceived availability is best measured by successful requests from the user perspective. Measuring at the load balancer captures all user requests and their outcomes. Server uptime and pod status do not capture actual request success; CPU utilization is a resource metric, not an availability indicator.',
    difficulty: 'medium' as const,
    gcpServices: ['Cloud Monitoring', 'Cloud Load Balancing'],
  },
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_DEPLOYMENT',
    questionText:
      'You need to implement a deployment pipeline that promotes releases through dev, staging, and production environments with approval gates. Which Google Cloud service provides this capability?',
    questionType: 'single' as const,
    options: [
      'A. Cloud Build alone',
      'B. Cloud Deploy',
      'C. Cloud Scheduler',
      'D. Pub/Sub with Cloud Functions',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Deploy is a managed continuous delivery service that provides deployment pipelines with multiple stages (dev, staging, prod), approval gates, rollback capabilities, and deployment verification. It integrates with Cloud Build for building and handles the promotion workflow.',
    difficulty: 'easy' as const,
    gcpServices: ['Cloud Deploy'],
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
  const [aceCert] = await db
    .insert(certifications)
    .values({
      code: 'ACE',
      name: 'Associate Cloud Engineer',
      shortName: 'ACE',
      description:
        'An Associate Cloud Engineer deploys and secures applications and infrastructure, monitors operations, and manages enterprise solutions.',
      provider: 'gcp',
      examDurationMinutes: 120,
      totalQuestions: 50,
      passingScorePercent: 70,
      isActive: true,
      createdAt: new Date(),
    })
    .returning();
  console.log(`Inserted certification: ${aceCert.name}`);

  // Insert domains for ACE
  for (const domainData of ACE_DOMAINS) {
    const { topics: topicList, ...domainFields } = domainData;

    const [insertedDomain] = await db
      .insert(domains)
      .values({
        certificationId: aceCert.id,
        ...domainFields,
      })
      .returning();
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

  console.log(`Inserted ${SAMPLE_QUESTIONS.length} ACE sample questions`);

  // Insert PCA certification
  const [pcaCert] = await db
    .insert(certifications)
    .values({
      code: 'PCA',
      name: 'Professional Cloud Architect',
      shortName: 'PCA',
      description:
        'A Professional Cloud Architect enables organizations to leverage Google Cloud technologies. With a thorough understanding of cloud architecture and Google Cloud, this individual designs, develops, and manages robust, secure, scalable, and dynamic solutions.',
      provider: 'gcp',
      examDurationMinutes: 120,
      totalQuestions: 50,
      passingScorePercent: 70,
      isActive: true,
      createdAt: new Date(),
    })
    .returning();
  console.log(`Inserted certification: ${pcaCert.name}`);

  // Insert domains for PCA
  for (const domainData of PCA_DOMAINS) {
    const { topics: topicList, ...domainFields } = domainData;

    const [insertedDomain] = await db
      .insert(domains)
      .values({
        certificationId: pcaCert.id,
        ...domainFields,
      })
      .returning();
    console.log(`Inserted PCA domain: ${insertedDomain.name}`);

    // Insert topics for this domain
    for (const topic of topicList) {
      await db.insert(topics).values({
        domainId: insertedDomain.id,
        ...topic,
      });
    }
  }

  // Insert PCA sample questions
  for (const q of PCA_SAMPLE_QUESTIONS) {
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

  console.log(`Inserted ${PCA_SAMPLE_QUESTIONS.length} PCA sample questions`);
  console.log('Seeding completed!');

  sqlite.close();
}

seed().catch(console.error);
