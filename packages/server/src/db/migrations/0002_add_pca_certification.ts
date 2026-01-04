/**
 * Migration: Add PCA (Professional Cloud Architect) certification
 * This migration adds the PCA certification to existing databases without affecting existing data.
 * Safe to run multiple times - checks for existing PCA before inserting.
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

console.log('Running migration: Add PCA certification...');

// Check if PCA already exists
const existingPCA = db.prepare("SELECT id FROM certifications WHERE code = 'PCA'").get() as
  | { id: number }
  | undefined;

if (existingPCA) {
  console.log('PCA certification already exists (id:', existingPCA.id, '). Skipping migration.');
  db.close();
  process.exit(0);
}

// Insert PCA certification
const insertCertification = db.prepare(`
  INSERT INTO certifications (code, name, short_name, description, provider, exam_duration_minutes, total_questions, passing_score_percent, is_active, created_at)
  VALUES (@code, @name, @shortName, @description, @provider, @examDurationMinutes, @totalQuestions, @passingScorePercent, @isActive, @createdAt)
`);

const pcaCertResult = insertCertification.run({
  code: 'PCA',
  name: 'Professional Cloud Architect',
  shortName: 'PCA',
  description:
    'A Professional Cloud Architect enables organizations to leverage Google Cloud technologies. With a thorough understanding of cloud architecture and Google Cloud, this individual designs, develops, and manages robust, secure, scalable, and dynamic solutions.',
  provider: 'gcp',
  examDurationMinutes: 120,
  totalQuestions: 50,
  passingScorePercent: 70,
  isActive: 1,
  createdAt: Date.now(),
});
const pcaCertId = pcaCertResult.lastInsertRowid;
console.log('Inserted PCA certification (id:', pcaCertId, ')');

// PCA Domains
const PCA_DOMAINS = [
  {
    code: 'PCA_DESIGN_PLAN',
    name: 'Designing and Planning a Cloud Solution Architecture',
    weight: 0.25,
    orderIndex: 1,
    description:
      'Design solution infrastructure meeting business and technical requirements using Well-Architected Framework',
  },
  {
    code: 'PCA_MANAGE_PROVISION',
    name: 'Managing and Provisioning a Solution Infrastructure',
    weight: 0.175,
    orderIndex: 2,
    description: 'Configure and deploy network, storage, and compute resources using IaC',
  },
  {
    code: 'PCA_SECURITY_COMPLIANCE',
    name: 'Designing for Security and Compliance',
    weight: 0.175,
    orderIndex: 3,
    description: 'Design secure architectures and ensure regulatory compliance',
  },
  {
    code: 'PCA_ANALYZE_OPTIMIZE',
    name: 'Analyzing and Optimizing Technical and Business Processes',
    weight: 0.15,
    orderIndex: 4,
    description: 'Analyze processes and implement optimization strategies',
  },
  {
    code: 'PCA_MANAGE_IMPL',
    name: 'Managing Implementation',
    weight: 0.125,
    orderIndex: 5,
    description: 'Advise teams and interact with Google Cloud programmatically',
  },
  {
    code: 'PCA_OPS_EXCELLENCE',
    name: 'Ensuring Solution and Operations Excellence',
    weight: 0.125,
    orderIndex: 6,
    description: 'Implement monitoring, deployment strategies, and reliability practices',
  },
];

const PCA_TOPICS: Record<string, { code: string; name: string; description: string }[]> = {
  PCA_DESIGN_PLAN: [
    {
      code: 'PCA_BUSINESS_REQ',
      name: 'Designing solution infrastructure per business requirements',
      description:
        'Business case analysis, stakeholder management, success criteria, cost optimization',
    },
    {
      code: 'PCA_TECHNICAL_REQ',
      name: 'Designing solution infrastructure per technical requirements',
      description: 'High availability, scalability, disaster recovery, performance requirements',
    },
    {
      code: 'PCA_RESOURCE_DESIGN',
      name: 'Designing network, storage, and compute resources',
      description: 'VPC architecture, storage selection, compute selection, hybrid connectivity',
    },
    {
      code: 'PCA_MIGRATION',
      name: 'Creating a migration plan',
      description: 'Migration strategies (lift-and-shift, replatform, refactor), data migration',
    },
    {
      code: 'PCA_FUTURE_IMPROVEMENTS',
      name: 'Envisioning future solution improvements',
      description: 'AI/ML integration, Vertex AI, cloud-native modernization',
    },
  ],
  PCA_MANAGE_PROVISION: [
    {
      code: 'PCA_NETWORK_CONFIG',
      name: 'Configuring network topologies',
      description: 'VPC design, Shared VPC, VPC peering, Cloud Interconnect, Cloud VPN',
    },
    {
      code: 'PCA_STORAGE_CONFIG',
      name: 'Configuring individual storage systems',
      description: 'Cloud Storage classes, persistent disks, Filestore, database provisioning',
    },
    {
      code: 'PCA_COMPUTE_CONFIG',
      name: 'Configuring compute systems',
      description: 'GCE instances, GKE clusters, Cloud Run, Cloud Functions, App Engine',
    },
    {
      code: 'PCA_IAC',
      name: 'Implementing Infrastructure as Code',
      description: 'Terraform, Config Connector, Deployment Manager, CI/CD for infrastructure',
    },
  ],
  PCA_SECURITY_COMPLIANCE: [
    {
      code: 'PCA_SECURITY_DESIGN',
      name: 'Designing for security',
      description:
        'IAM best practices, resource hierarchy, VPC Service Controls, Binary Authorization',
    },
    {
      code: 'PCA_DATA_SECURITY',
      name: 'Designing for data security',
      description: 'Encryption at rest and in transit, Cloud KMS, Secret Manager, DLP',
    },
    {
      code: 'PCA_COMPLIANCE',
      name: 'Designing for compliance',
      description: 'HIPAA, SOC 2, GDPR, PCI-DSS, audit logging, compliance reporting',
    },
  ],
  PCA_ANALYZE_OPTIMIZE: [
    {
      code: 'PCA_TECH_PROCESSES',
      name: 'Analyzing and defining technical processes',
      description: 'CI/CD pipelines, testing strategies, release management',
    },
    {
      code: 'PCA_BUSINESS_PROCESSES',
      name: 'Analyzing and defining business processes',
      description: 'Cost analysis, ROI calculation, FinOps practices, capacity planning',
    },
    {
      code: 'PCA_RESILIENCE',
      name: 'Developing procedures for testing resilience',
      description: 'Chaos engineering, disaster recovery testing, game days, incident response',
    },
  ],
  PCA_MANAGE_IMPL: [
    {
      code: 'PCA_TEAM_ADVICE',
      name: 'Advising development and operations teams',
      description: 'Application deployment, API management with Apigee, troubleshooting',
    },
    {
      code: 'PCA_PROGRAMMATIC',
      name: 'Interacting with Google Cloud programmatically',
      description: 'Cloud SDK, client libraries, REST APIs, Cloud Shell, Cloud Code',
    },
  ],
  PCA_OPS_EXCELLENCE: [
    {
      code: 'PCA_OBSERVABILITY',
      name: 'Monitoring, logging, profiling, and alerting',
      description: 'Cloud Monitoring, Cloud Logging, Cloud Trace, Cloud Profiler',
    },
    {
      code: 'PCA_DEPLOYMENT',
      name: 'Deployment and release management',
      description: 'Blue-green deployments, canary releases, rollback strategies',
    },
    {
      code: 'PCA_RELIABILITY',
      name: 'Ensuring reliability and quality',
      description: 'SLIs, SLOs, SLAs, error budgets, capacity planning',
    },
  ],
};

const insertDomain = db.prepare(`
  INSERT INTO domains (certification_id, code, name, weight, description, order_index)
  VALUES (@certificationId, @code, @name, @weight, @description, @orderIndex)
`);

const insertTopic = db.prepare(`
  INSERT INTO topics (domain_id, code, name, description)
  VALUES (@domainId, @code, @name, @description)
`);

// Insert PCA domains and topics
for (const domain of PCA_DOMAINS) {
  const result = insertDomain.run({ certificationId: pcaCertId, ...domain });
  const domainId = result.lastInsertRowid;
  console.log(`Inserted PCA domain: ${domain.name}`);

  const topics = PCA_TOPICS[domain.code] || [];
  for (const topic of topics) {
    insertTopic.run({ domainId, ...topic });
  }
}

// PCA Sample Questions (50 questions)
const PCA_SAMPLE_QUESTIONS = [
  // Domain 1: Designing and Planning (13 questions)
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_BUSINESS_REQ',
    questionText:
      'A retail company wants to migrate their e-commerce platform to Google Cloud. They require 99.99% availability during peak shopping seasons and need to comply with PCI-DSS. The CTO wants to minimize operational overhead. Which solution best meets these requirements?',
    questionType: 'single',
    options: [
      'A. Deploy on Compute Engine VMs with managed instance groups across multiple zones',
      'B. Use Cloud Run with Cloud SQL for PostgreSQL and Cloud CDN for static assets',
      'C. Deploy on GKE Autopilot with Cloud Spanner for the database and Cloud Armor for WAF',
      'D. Use App Engine Standard with Firestore and Cloud Load Balancing',
    ],
    correctAnswers: [2],
    explanation:
      'GKE Autopilot provides managed Kubernetes with minimal operational overhead. Cloud Spanner offers 99.999% availability. Cloud Armor provides WAF for PCI-DSS compliance.',
    difficulty: 'hard',
    gcpServices: ['GKE', 'Cloud Spanner', 'Cloud Armor'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_BUSINESS_REQ',
    questionText:
      'Your organization is evaluating cloud migration for a legacy application. The CFO requires a clear ROI analysis. Which Google Cloud tools should you use to build the business case? (Choose two)',
    questionType: 'multiple',
    options: [
      'A. Cloud Pricing Calculator for cost estimation',
      'B. Active Assist for optimization recommendations',
      'C. Google Cloud Adoption Framework for migration methodology',
      'D. StratoZone or Migration Center for workload assessment',
      'E. Cloud Trace for performance analysis',
    ],
    correctAnswers: [0, 3],
    explanation:
      'Cloud Pricing Calculator helps estimate costs. Migration Center provides workload discovery and TCO analysis.',
    difficulty: 'medium',
    gcpServices: ['Cloud Pricing Calculator', 'Migration Center'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_TECHNICAL_REQ',
    questionText:
      'A healthcare company needs to design a system for processing patient records with strict data residency requirements in the EU. The system must handle 10,000 requests per second with sub-100ms latency. Which architecture decision is most critical?',
    questionType: 'single',
    options: [
      'A. Use a single-region deployment in europe-west1 with read replicas',
      'B. Deploy across multiple EU regions with organization policies restricting data location',
      'C. Use Cloud Spanner with a regional configuration in europe-west1',
      'D. Implement a multi-region setup with data replication policies enforced by VPC Service Controls',
    ],
    correctAnswers: [1],
    explanation:
      'For strict EU data residency with high availability, deploying across multiple EU regions provides fault tolerance while organization policies ensure data never leaves the EU.',
    difficulty: 'hard',
    gcpServices: ['Organization Policy Service', 'Cloud Spanner'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_TECHNICAL_REQ',
    questionText:
      'You are designing a real-time analytics platform that must process streaming data from IoT devices. The system needs to handle variable loads from 1,000 to 1,000,000 events per second. Which architecture pattern should you recommend?',
    questionType: 'single',
    options: [
      'A. Pub/Sub → Dataflow → BigQuery with streaming inserts',
      'B. Cloud IoT Core → Cloud Functions → Cloud SQL',
      'C. Pub/Sub → Cloud Run → Bigtable',
      'D. Kafka on GKE → Apache Spark on Dataproc → Cloud Storage',
    ],
    correctAnswers: [0],
    explanation:
      'Pub/Sub handles massive message ingestion with automatic scaling. Dataflow provides exactly-once processing. BigQuery streaming inserts support high-volume real-time analytics.',
    difficulty: 'medium',
    gcpServices: ['Pub/Sub', 'Dataflow', 'BigQuery'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_RESOURCE_DESIGN',
    questionText:
      'A company has multiple development teams that need isolated environments but must share some common services like logging and monitoring. Which VPC design pattern is most appropriate?',
    questionType: 'single',
    options: [
      'A. Single VPC with subnets per team and firewall rules for isolation',
      'B. Separate VPCs per team connected via VPC Peering',
      'C. Shared VPC with host project for common services and service projects per team',
      'D. Multiple standalone VPCs with Cloud NAT for egress',
    ],
    correctAnswers: [2],
    explanation:
      'Shared VPC is designed for this use case. The host project contains shared resources while service projects provide isolation for each team.',
    difficulty: 'easy',
    gcpServices: ['Shared VPC', 'VPC'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_RESOURCE_DESIGN',
    questionText:
      'You need to choose a database for a gaming application that requires sub-millisecond read latency for player session data, handles 500,000 reads per second, and stores 50TB of data. Which database should you select?',
    questionType: 'single',
    options: [
      'A. Cloud SQL with read replicas',
      'B. Cloud Spanner with regional configuration',
      'C. Cloud Bigtable',
      'D. Memorystore for Redis',
    ],
    correctAnswers: [2],
    explanation:
      'Cloud Bigtable is designed for sub-millisecond latency at massive scale. It handles millions of reads per second and petabytes of data.',
    difficulty: 'medium',
    gcpServices: ['Cloud Bigtable'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_MIGRATION',
    questionText:
      'A financial services company is migrating a monolithic Java application to Google Cloud. They want to modernize incrementally while maintaining business continuity. Which migration strategy should you recommend?',
    questionType: 'single',
    options: [
      'A. Big-bang rewrite to microservices on Cloud Run',
      'B. Lift-and-shift to Compute Engine, then refactor to GKE',
      'C. Strangler fig pattern: gradually extract services while running the monolith on GKE',
      'D. Direct containerization to Cloud Run without code changes',
    ],
    correctAnswers: [2],
    explanation:
      'The strangler fig pattern allows incremental modernization by gradually extracting functionality into new services while the monolith continues running.',
    difficulty: 'medium',
    gcpServices: ['GKE'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_MIGRATION',
    questionText:
      'Your company needs to migrate 500TB of data from an on-premises data center to Cloud Storage. The migration must complete within 2 weeks, and the network connection is 1 Gbps. What approach should you take?',
    questionType: 'single',
    options: [
      'A. Use gsutil with parallel composite uploads over the existing network',
      'B. Order a Transfer Appliance for physical data transfer',
      'C. Set up Cloud Interconnect and use Storage Transfer Service',
      'D. Use Cloud VPN with multiple tunnels for increased bandwidth',
    ],
    correctAnswers: [1],
    explanation:
      'At 1 Gbps, transferring 500TB would take approximately 46 days, exceeding the 2-week requirement. Transfer Appliance provides physical transfer that bypasses network limitations.',
    difficulty: 'easy',
    gcpServices: ['Transfer Appliance', 'Cloud Storage'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_FUTURE_IMPROVEMENTS',
    questionText:
      'A media company wants to add AI-powered content recommendations to their streaming platform. They have limited ML expertise in-house. Which approach aligns with the Well-Architected Framework principle of operational excellence?',
    questionType: 'single',
    options: [
      'A. Build custom ML models using TensorFlow on Vertex AI Training',
      'B. Use Recommendations AI, a fully managed service for personalization',
      'C. Deploy open-source recommendation engines on GKE',
      'D. Implement collaborative filtering using BigQuery ML',
    ],
    correctAnswers: [1],
    explanation:
      'Recommendations AI is a fully managed service that requires minimal ML expertise while providing production-ready recommendations.',
    difficulty: 'easy',
    gcpServices: ['Recommendations AI', 'Vertex AI'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_FUTURE_IMPROVEMENTS',
    questionText:
      'A logistics company wants to implement predictive maintenance for their fleet using IoT sensor data. They need to train custom ML models on their historical data. Which Vertex AI components should they use? (Choose two)',
    questionType: 'multiple',
    options: [
      'A. Vertex AI Workbench for exploratory data analysis and model development',
      'B. Vertex AI Feature Store for managing ML features',
      'C. Cloud Vision API for image analysis',
      'D. Vertex AI Pipelines for automated training workflows',
      'E. Document AI for processing maintenance logs',
    ],
    correctAnswers: [0, 3],
    explanation:
      'Vertex AI Workbench provides managed Jupyter notebooks. Vertex AI Pipelines enables automated, reproducible ML workflows.',
    difficulty: 'medium',
    gcpServices: ['Vertex AI Workbench', 'Vertex AI Pipelines'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_TECHNICAL_REQ',
    questionText:
      'You are designing a disaster recovery solution for a critical application. The business requires an RTO of 15 minutes and RPO of 5 minutes. Which architecture pattern should you implement?',
    questionType: 'single',
    options: [
      'A. Cold standby with daily backups to Cloud Storage',
      'B. Warm standby with asynchronous database replication',
      'C. Hot standby with synchronous replication and automatic failover',
      'D. Pilot light with minimal infrastructure kept running',
    ],
    correctAnswers: [2],
    explanation:
      'RTO of 15 minutes and RPO of 5 minutes requires near-instant failover with minimal data loss. Hot standby with synchronous replication meets these requirements.',
    difficulty: 'medium',
    gcpServices: ['Cloud SQL', 'Cloud Spanner', 'Cloud Load Balancing'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_BUSINESS_REQ',
    questionText:
      'A startup is launching a new SaaS product and needs to design for rapid growth. They expect user growth from 1,000 to 1,000,000 users within 18 months. Which design principle is most important?',
    questionType: 'single',
    options: [
      'A. Design for current load with manual scaling procedures',
      'B. Over-provision resources to handle maximum expected load',
      'C. Use managed services with automatic scaling capabilities',
      'D. Implement custom auto-scaling using Cloud Functions',
    ],
    correctAnswers: [2],
    explanation:
      'Managed services with automatic scaling provide the elasticity needed for 1000x growth without operational overhead.',
    difficulty: 'easy',
    gcpServices: ['Cloud Run', 'GKE', 'Cloud SQL'],
  },
  {
    domainCode: 'PCA_DESIGN_PLAN',
    topicCode: 'PCA_RESOURCE_DESIGN',
    questionText:
      'You are designing a data lake architecture for a large enterprise. The solution must support both batch and real-time analytics, handle structured and unstructured data, and integrate with existing BI tools. Which architecture should you recommend?',
    questionType: 'single',
    options: [
      'A. Cloud Storage as the data lake with BigQuery for analytics and Looker for BI',
      'B. Cloud SQL for structured data and Cloud Storage for unstructured data',
      'C. BigQuery as both storage and compute layer with federated queries',
      'D. Dataproc with HDFS for all data processing needs',
    ],
    correctAnswers: [0],
    explanation:
      'Cloud Storage provides cost-effective storage for all data types. BigQuery offers high-performance analytics. Looker provides enterprise BI capabilities.',
    difficulty: 'hard',
    gcpServices: ['Cloud Storage', 'BigQuery', 'Looker'],
  },

  // Domain 2: Managing and Provisioning (9 questions)
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_NETWORK_CONFIG',
    questionText:
      'Your organization needs to connect their on-premises data center to Google Cloud. They require 10 Gbps of dedicated bandwidth with 99.99% availability. Which connectivity option should you recommend?',
    questionType: 'single',
    options: [
      'A. Cloud VPN with multiple tunnels',
      'B. Dedicated Interconnect with redundant connections',
      'C. Partner Interconnect with a single connection',
      'D. Cloud NAT with Direct Peering',
    ],
    correctAnswers: [1],
    explanation:
      'Dedicated Interconnect provides 10/100 Gbps connections. For 99.99% availability SLA, you need redundant connections in two different edge availability domains.',
    difficulty: 'medium',
    gcpServices: ['Cloud Interconnect'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_NETWORK_CONFIG',
    questionText:
      'You need to configure load balancing for a global application serving users in North America, Europe, and Asia. The application runs on GKE and requires WebSocket support. Which load balancer should you use?',
    questionType: 'single',
    options: [
      'A. Regional external HTTP(S) Load Balancer',
      'B. Global external HTTP(S) Load Balancer (classic)',
      'C. Global external Application Load Balancer',
      'D. Regional internal TCP/UDP Load Balancer',
    ],
    correctAnswers: [2],
    explanation:
      'Global external Application Load Balancer supports WebSocket connections, provides global anycast routing, and integrates with GKE.',
    difficulty: 'medium',
    gcpServices: ['Cloud Load Balancing', 'GKE'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_STORAGE_CONFIG',
    questionText:
      'A video streaming platform needs to store 1PB of video content. Most content is accessed frequently for 30 days after upload, then rarely accessed. How should you configure Cloud Storage for cost optimization?',
    questionType: 'single',
    options: [
      'A. Use Standard storage class for all content',
      'B. Use Nearline storage class for all content',
      'C. Use Standard storage with Object Lifecycle Management to transition to Coldline after 30 days',
      'D. Use Autoclass to automatically manage storage classes',
    ],
    correctAnswers: [3],
    explanation:
      'Autoclass automatically transitions objects between storage classes based on access patterns, providing optimal cost savings.',
    difficulty: 'easy',
    gcpServices: ['Cloud Storage'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_STORAGE_CONFIG',
    questionText:
      'Your application requires a fully managed NFS file system for shared storage across multiple Compute Engine instances. The workload is latency-sensitive with random I/O patterns. Which service should you use?',
    questionType: 'single',
    options: [
      'A. Cloud Storage with Cloud Storage FUSE',
      'B. Filestore Basic tier',
      'C. Filestore Enterprise tier',
      'D. Persistent Disk SSD in multi-attach mode',
    ],
    correctAnswers: [2],
    explanation:
      'Filestore Enterprise tier provides the lowest latency and highest performance for random I/O workloads with SSD-backed storage.',
    difficulty: 'medium',
    gcpServices: ['Filestore'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_COMPUTE_CONFIG',
    questionText:
      'You need to deploy a stateless containerized application that experiences unpredictable traffic spikes, sometimes from 0 to 10,000 requests per second within minutes. Which compute platform is most suitable?',
    questionType: 'single',
    options: [
      'A. GKE Standard with Cluster Autoscaler',
      'B. Cloud Run',
      'C. Compute Engine with managed instance groups',
      'D. GKE Autopilot',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Run scales from 0 to thousands of instances within seconds, handling extreme traffic spikes for stateless containers.',
    difficulty: 'easy',
    gcpServices: ['Cloud Run'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_COMPUTE_CONFIG',
    questionText:
      'A machine learning team needs GPU-enabled compute resources for training models. They want to minimize costs for jobs that can be interrupted. Which configuration should you recommend?',
    questionType: 'single',
    options: [
      'A. GKE Standard cluster with GPU node pools using on-demand instances',
      'B. Compute Engine Spot VMs with attached GPUs',
      'C. Vertex AI Training with preemptible VMs',
      'D. Cloud TPUs with on-demand pricing',
    ],
    correctAnswers: [1],
    explanation:
      'Spot VMs with GPUs offer up to 91% discount compared to on-demand GPU instances for interruptible workloads.',
    difficulty: 'easy',
    gcpServices: ['Compute Engine'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_IAC',
    questionText:
      'Your organization wants to implement infrastructure as code for their Google Cloud environment. They need to support GitOps workflows and want policy guardrails. Which combination of tools should you recommend? (Choose two)',
    questionType: 'multiple',
    options: [
      'A. Terraform with Cloud Build for CI/CD',
      'B. Config Connector for Kubernetes-native resource management',
      'C. Deployment Manager for declarative infrastructure',
      'D. Policy Controller for policy enforcement',
      'E. Cloud Functions for infrastructure automation',
    ],
    correctAnswers: [0, 3],
    explanation:
      'Terraform with Cloud Build provides robust IaC with GitOps workflows. Policy Controller enforces policies on resources.',
    difficulty: 'hard',
    gcpServices: ['Cloud Build', 'Policy Controller', 'Terraform'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_NETWORK_CONFIG',
    questionText:
      'You need to enable communication between two VPCs in different projects within the same organization. The VPCs have overlapping IP ranges. What should you do?',
    questionType: 'single',
    options: [
      'A. Set up VPC Network Peering between the VPCs',
      'B. Use Cloud VPN to connect the VPCs',
      'C. Reconfigure IP ranges to eliminate overlap, then use VPC Peering',
      'D. Create a Shared VPC to combine both networks',
    ],
    correctAnswers: [2],
    explanation:
      'VPC Peering cannot connect VPCs with overlapping IP ranges. You must reconfigure IP ranges to eliminate overlap first.',
    difficulty: 'medium',
    gcpServices: ['VPC', 'VPC Network Peering'],
  },
  {
    domainCode: 'PCA_MANAGE_PROVISION',
    topicCode: 'PCA_IAC',
    questionText:
      'You want to manage Google Cloud resources using Kubernetes-native tooling. Your team is already using kubectl and Helm. Which approach should you take?',
    questionType: 'single',
    options: [
      'A. Use Terraform with the Google provider',
      'B. Use Config Connector installed on your GKE cluster',
      'C. Use Deployment Manager templates',
      'D. Use Cloud SDK scripts in your CI/CD pipeline',
    ],
    correctAnswers: [1],
    explanation:
      'Config Connector allows managing Google Cloud resources as Kubernetes custom resources using kubectl and Helm.',
    difficulty: 'medium',
    gcpServices: ['Config Connector', 'GKE'],
  },

  // Domain 3: Security and Compliance (9 questions)
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_SECURITY_DESIGN',
    questionText:
      'A financial institution needs to ensure that sensitive data in Cloud Storage cannot be accessed from the public internet, even if bucket permissions are misconfigured. Which security control should be implemented?',
    questionType: 'single',
    options: [
      'A. Enable uniform bucket-level access',
      'B. Configure VPC Service Controls perimeter around the project',
      'C. Set up Cloud Armor policies',
      'D. Enable data access audit logs',
    ],
    correctAnswers: [1],
    explanation:
      'VPC Service Controls create a security perimeter that prevents data exfiltration regardless of IAM permissions.',
    difficulty: 'medium',
    gcpServices: ['VPC Service Controls', 'Cloud Storage'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_SECURITY_DESIGN',
    questionText:
      'Your security team requires that all container images deployed to production GKE clusters are signed and verified. Which service should you use?',
    questionType: 'single',
    options: [
      'A. Container Registry vulnerability scanning',
      'B. Binary Authorization',
      'C. Cloud Armor with custom rules',
      'D. Web Security Scanner',
    ],
    correctAnswers: [1],
    explanation:
      'Binary Authorization enforces deploy-time security policies, verifying that container images are signed before allowing deployment.',
    difficulty: 'easy',
    gcpServices: ['Binary Authorization', 'GKE'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_DATA_SECURITY',
    questionText:
      'Your application processes credit card data and must be PCI-DSS compliant. You need to encrypt sensitive fields in Cloud SQL using customer-managed encryption keys (CMEK). Which service manages these keys?',
    questionType: 'single',
    options: ['A. Cloud HSM', 'B. Cloud KMS', 'C. Secret Manager', 'D. Cloud Data Loss Prevention'],
    correctAnswers: [1],
    explanation:
      'Cloud KMS manages customer-controlled encryption keys used for CMEK in Cloud SQL and other services.',
    difficulty: 'easy',
    gcpServices: ['Cloud KMS', 'Cloud SQL'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_DATA_SECURITY',
    questionText:
      'You need to detect and redact personally identifiable information (PII) from documents before storing them in Cloud Storage. Which service should you use?',
    questionType: 'single',
    options: [
      'A. Cloud Data Loss Prevention (DLP)',
      'B. Security Command Center',
      'C. Cloud Armor',
      'D. Access Transparency',
    ],
    correctAnswers: [0],
    explanation:
      'Cloud DLP is designed to discover, classify, and protect sensitive data. It can scan for PII and apply transformations like redaction.',
    difficulty: 'medium',
    gcpServices: ['Cloud Data Loss Prevention'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_COMPLIANCE',
    questionText:
      'Your organization operates in the EU and must comply with GDPR data residency requirements. How should you configure your Google Cloud environment to ensure resources are only created in EU regions?',
    questionType: 'single',
    options: [
      'A. Create separate projects for each region and use IAM to restrict access',
      'B. Configure Organization Policy constraints to restrict resource locations',
      'C. Use VPC Service Controls to block non-EU traffic',
      'D. Set up Cloud Monitoring alerts for resources created outside EU',
    ],
    correctAnswers: [1],
    explanation:
      'Organization Policy constraints proactively prevent resources from being created outside allowed regions at creation time.',
    difficulty: 'medium',
    gcpServices: ['Organization Policy Service'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_COMPLIANCE',
    questionText:
      'Your company needs to demonstrate HIPAA compliance for a healthcare application. Which Google Cloud feature provides evidence of compliance with HIPAA requirements?',
    questionType: 'single',
    options: [
      'A. Security Command Center findings',
      'B. Cloud Audit Logs',
      'C. Compliance Reports Manager in Google Cloud Console',
      'D. Access Transparency logs',
    ],
    correctAnswers: [2],
    explanation:
      'Compliance Reports Manager provides access to third-party audit reports and certifications that demonstrate compliance.',
    difficulty: 'medium',
    gcpServices: ['Compliance Reports Manager'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_SECURITY_DESIGN',
    questionText:
      'You need to implement a zero-trust security model for accessing Google Cloud resources from employee devices. Which Google Cloud service should be the foundation?',
    questionType: 'single',
    options: [
      'A. Cloud VPN with multi-factor authentication',
      'B. Identity-Aware Proxy (IAP)',
      'C. Cloud NAT with firewall rules',
      'D. Private Google Access',
    ],
    correctAnswers: [1],
    explanation:
      'Identity-Aware Proxy implements zero-trust access by verifying user identity and device context before granting access to applications.',
    difficulty: 'medium',
    gcpServices: ['Identity-Aware Proxy'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_DATA_SECURITY',
    questionText:
      'An application needs to securely store API keys and database credentials. The credentials should be versioned and auditable, with automatic rotation support. Which service should you use?',
    questionType: 'single',
    options: [
      'A. Cloud KMS',
      'B. Environment variables in Cloud Run',
      'C. Secret Manager',
      'D. Cloud Storage with CMEK encryption',
    ],
    correctAnswers: [2],
    explanation:
      'Secret Manager is purpose-built for storing sensitive data with versioning, access auditing, and supports automatic rotation.',
    difficulty: 'easy',
    gcpServices: ['Secret Manager'],
  },
  {
    domainCode: 'PCA_SECURITY_COMPLIANCE',
    topicCode: 'PCA_SECURITY_DESIGN',
    questionText:
      'Your organization wants to centrally manage and monitor security vulnerabilities, misconfigurations, and threats across all Google Cloud projects. Which service provides this capability?',
    questionType: 'single',
    options: [
      'A. Cloud Audit Logs',
      'B. Security Command Center',
      'C. Cloud Monitoring',
      'D. Policy Controller',
    ],
    correctAnswers: [1],
    explanation:
      'Security Command Center is the native security and risk management platform for centralized visibility into security vulnerabilities and threats.',
    difficulty: 'hard',
    gcpServices: ['Security Command Center'],
  },

  // Domain 4: Analyzing and Optimizing (7 questions)
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_TECH_PROCESSES',
    questionText:
      'Your development team wants to implement CI/CD for a microservices application on GKE. They need automated testing, container building, and deployment with approval gates for production. Which services should they use? (Choose two)',
    questionType: 'multiple',
    options: [
      'A. Cloud Build for CI/CD pipelines',
      'B. Cloud Composer for workflow orchestration',
      'C. Cloud Deploy for continuous delivery with approvals',
      'D. Cloud Scheduler for timed deployments',
      'E. Artifact Registry for container storage',
    ],
    correctAnswers: [0, 2],
    explanation:
      'Cloud Build handles CI (testing, building). Cloud Deploy provides managed continuous delivery with approval gates and rollback capabilities.',
    difficulty: 'medium',
    gcpServices: ['Cloud Build', 'Cloud Deploy'],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_TECH_PROCESSES',
    questionText:
      'You need to implement a testing strategy for a serverless application using Cloud Run, Cloud Functions, Firestore, and Pub/Sub. Which approach provides the most comprehensive testing?',
    questionType: 'single',
    options: [
      'A. Unit tests with mocked dependencies only',
      'B. Integration tests against production services',
      'C. Unit tests with mocks, integration tests with emulators, and end-to-end tests in staging',
      'D. End-to-end tests in production with feature flags',
    ],
    correctAnswers: [2],
    explanation:
      'A comprehensive testing strategy includes unit tests with mocks, integration tests with local emulators, and end-to-end tests in staging.',
    difficulty: 'medium',
    gcpServices: ['Cloud Run', 'Cloud Functions', 'Firestore', 'Pub/Sub'],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_BUSINESS_PROCESSES',
    questionText:
      'Your organization wants to optimize cloud spending without impacting performance. The cloud bill shows significant spend on Compute Engine. Which tool provides AI-powered recommendations for right-sizing VMs?',
    questionType: 'single',
    options: [
      'A. Cloud Billing reports',
      'B. Active Assist with Recommender',
      'C. Cloud Monitoring dashboards',
      'D. Cost Management tools',
    ],
    correctAnswers: [1],
    explanation:
      'Active Assist uses machine learning to analyze resource utilization and provides specific recommendations through Recommender.',
    difficulty: 'easy',
    gcpServices: ['Active Assist', 'Recommender'],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_BUSINESS_PROCESSES',
    questionText:
      'A company is comparing cloud costs to their on-premises data center. They need to perform a TCO analysis that includes hidden costs like power, cooling, and personnel. Which approach should they take?',
    questionType: 'single',
    options: [
      'A. Use only the Cloud Pricing Calculator for cloud costs',
      'B. Use Migration Center for comprehensive TCO analysis',
      'C. Compare cloud monthly bills to data center lease costs',
      'D. Calculate server hardware costs only',
    ],
    correctAnswers: [1],
    explanation:
      'Migration Center performs comprehensive TCO analysis including hidden on-premises costs like facilities, power, and personnel.',
    difficulty: 'easy',
    gcpServices: ['Migration Center'],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_RESILIENCE',
    questionText:
      'Your organization wants to test their disaster recovery procedures for a production system. The test should validate RTO and RPO requirements without impacting users. What approach should you recommend?',
    questionType: 'single',
    options: [
      'A. Perform a tabletop exercise with documentation review',
      'B. Conduct a full failover test during a maintenance window',
      'C. Implement chaos engineering with gradual fault injection',
      'D. Test backup restoration in an isolated environment',
    ],
    correctAnswers: [2],
    explanation:
      'Chaos engineering with gradual fault injection allows testing disaster recovery in production with controlled blast radius.',
    difficulty: 'hard',
    gcpServices: ['Cloud Monitoring', 'Cloud Logging'],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_RESILIENCE',
    questionText:
      'You are designing an incident response process for a cloud-native application. Which practice aligns with the SRE (Site Reliability Engineering) approach to incident management?',
    questionType: 'single',
    options: [
      'A. Assign blame to individuals who caused the incident',
      'B. Conduct blameless post-mortems focused on systemic improvements',
      'C. Immediately implement all suggested fixes after an incident',
      'D. Keep incident details confidential within the operations team',
    ],
    correctAnswers: [1],
    explanation:
      'Blameless post-mortems focus on understanding systemic factors rather than individual blame, encouraging transparency and learning.',
    difficulty: 'medium',
    gcpServices: [],
  },
  {
    domainCode: 'PCA_ANALYZE_OPTIMIZE',
    topicCode: 'PCA_TECH_PROCESSES',
    questionText:
      'A development team is experiencing slow feedback loops due to long-running end-to-end tests in their CI/CD pipeline. How should they optimize the pipeline while maintaining quality?',
    questionType: 'single',
    options: [
      'A. Remove end-to-end tests entirely to speed up deployments',
      'B. Run all tests in parallel using Cloud Build concurrent builds',
      'C. Implement a testing pyramid with more unit tests, fewer E2E tests, and run E2E tests only on main branch',
      'D. Move all testing to post-deployment monitoring',
    ],
    correctAnswers: [2],
    explanation:
      'The testing pyramid recommends many unit tests, fewer integration tests, and minimal E2E tests. Running E2E only on main branch balances speed and quality.',
    difficulty: 'medium',
    gcpServices: ['Cloud Build'],
  },

  // Domain 5: Managing Implementation (6 questions)
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_TEAM_ADVICE',
    questionText:
      'A development team is struggling with API versioning for their microservices. They need to support multiple API versions while deprecating old ones gracefully. Which Google Cloud service provides comprehensive API management capabilities?',
    questionType: 'single',
    options: [
      'A. Cloud Endpoints',
      'B. Apigee API Management',
      'C. API Gateway',
      'D. Cloud Load Balancing with URL maps',
    ],
    correctAnswers: [1],
    explanation:
      'Apigee provides comprehensive API management including version management, deprecation policies, developer portals, and analytics.',
    difficulty: 'medium',
    gcpServices: ['Apigee'],
  },
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_TEAM_ADVICE',
    questionText:
      'An operations team needs to troubleshoot a performance issue in a distributed application spanning Cloud Run, Cloud Functions, and GKE. Which tool provides end-to-end distributed tracing?',
    questionType: 'single',
    options: [
      'A. Cloud Logging with log correlation',
      'B. Cloud Trace',
      'C. Cloud Profiler',
      'D. Error Reporting',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Trace provides distributed tracing that follows requests across service boundaries, showing latency at each step.',
    difficulty: 'easy',
    gcpServices: ['Cloud Trace'],
  },
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_PROGRAMMATIC',
    questionText:
      'A developer needs to automate infrastructure provisioning from their local machine. They want IDE integration, syntax highlighting, and the ability to preview changes before applying. Which tool combination should they use?',
    questionType: 'single',
    options: [
      'A. Cloud Console with gcloud commands',
      'B. Terraform with VS Code extension and terraform plan',
      'C. Cloud Shell only',
      'D. REST API calls with curl',
    ],
    correctAnswers: [1],
    explanation:
      'Terraform with VS Code extension provides IDE integration and terraform plan shows a preview of changes before applying.',
    difficulty: 'easy',
    gcpServices: ['Terraform'],
  },
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_PROGRAMMATIC',
    questionText:
      'You need to write a script that lists all Compute Engine instances across all projects in your organization. Which approach is most efficient?',
    questionType: 'single',
    options: [
      'A. Use gcloud compute instances list with --project flag for each project',
      'B. Use Cloud Asset Inventory to query compute instances across the organization',
      'C. Query the Compute Engine API directly for each project',
      'D. Export billing data and parse instance names',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Asset Inventory provides a unified view of resources across the entire organization with a single API call.',
    difficulty: 'medium',
    gcpServices: ['Cloud Asset Inventory'],
  },
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_TEAM_ADVICE',
    questionText:
      'A team is adopting Kubernetes but lacks expertise. They want to minimize the learning curve while still using Kubernetes APIs. Which GKE mode should they use?',
    questionType: 'single',
    options: [
      'A. GKE Standard with manual node management',
      'B. GKE Autopilot',
      'C. Self-managed Kubernetes on Compute Engine',
      'D. Anthos on bare metal',
    ],
    correctAnswers: [1],
    explanation:
      'GKE Autopilot manages cluster infrastructure automatically while providing full Kubernetes API compatibility.',
    difficulty: 'easy',
    gcpServices: ['GKE'],
  },
  {
    domainCode: 'PCA_MANAGE_IMPL',
    topicCode: 'PCA_PROGRAMMATIC',
    questionText:
      'You need to quickly test a gcloud command against your GCP environment from a machine without the SDK installed. What is the fastest option?',
    questionType: 'single',
    options: [
      'A. Install Cloud SDK locally',
      'B. Use Cloud Shell from the Google Cloud Console',
      'C. Set up a Compute Engine VM with Cloud SDK',
      'D. Use the REST API with curl',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Shell provides an instant, authenticated command-line environment in the browser with gcloud pre-installed.',
    difficulty: 'easy',
    gcpServices: ['Cloud Shell'],
  },

  // Domain 6: Operations Excellence (6 questions)
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_OBSERVABILITY',
    questionText:
      'You need to set up monitoring for a critical production application. Which metrics should you prioritize for alerting based on the Four Golden Signals? (Choose two)',
    questionType: 'multiple',
    options: [
      'A. CPU utilization percentage',
      'B. Request latency (p50, p95, p99)',
      'C. Error rate (5xx responses)',
      'D. Disk space usage',
      'E. Memory utilization',
    ],
    correctAnswers: [1, 2],
    explanation:
      'The Four Golden Signals are Latency, Traffic, Errors, and Saturation. Request latency and error rate directly measure user experience.',
    difficulty: 'medium',
    gcpServices: ['Cloud Monitoring'],
  },
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_OBSERVABILITY',
    questionText:
      'A production application is experiencing intermittent slowness. You need to identify which function calls are consuming the most CPU time. Which service should you use?',
    questionType: 'single',
    options: ['A. Cloud Trace', 'B. Cloud Profiler', 'C. Cloud Monitoring', 'D. Cloud Logging'],
    correctAnswers: [1],
    explanation:
      'Cloud Profiler provides continuous CPU and memory profiling of production applications, showing which functions consume the most resources.',
    difficulty: 'easy',
    gcpServices: ['Cloud Profiler'],
  },
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_DEPLOYMENT',
    questionText:
      'You want to deploy a new version of an application to Cloud Run with minimal risk. You need the ability to route a small percentage of traffic to the new version first. Which deployment strategy should you use?',
    questionType: 'single',
    options: [
      'A. Rolling update with immediate full rollout',
      'B. Blue-green deployment with instant cutover',
      'C. Canary deployment with traffic splitting',
      'D. Recreate deployment with downtime window',
    ],
    correctAnswers: [2],
    explanation:
      'Cloud Run supports traffic splitting between revisions, enabling canary deployments. You can route a small percentage to the new revision and gradually increase.',
    difficulty: 'easy',
    gcpServices: ['Cloud Run'],
  },
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_RELIABILITY',
    questionText:
      'Your team has defined an SLO of 99.9% availability for an API. This gives you an error budget of approximately 43 minutes of downtime per month. How should you use this error budget?',
    questionType: 'single',
    options: [
      'A. Try to use all 43 minutes each month for deployments',
      'B. Reserve it for planned maintenance windows only',
      'C. Balance between feature velocity and reliability work based on budget consumption',
      'D. Ignore it and focus only on achieving 100% availability',
    ],
    correctAnswers: [2],
    explanation:
      'Error budget should balance innovation and reliability. When the budget is healthy, prioritize feature velocity. When depleted, shift focus to reliability work.',
    difficulty: 'hard',
    gcpServices: [],
  },
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_RELIABILITY',
    questionText:
      'You are defining SLIs for a web application. Which SLI definition best measures user-perceived availability?',
    questionType: 'single',
    options: [
      'A. Percentage of time the server process is running',
      'B. Percentage of successful HTTP requests (non-5xx) as measured at the load balancer',
      'C. Average CPU utilization below 80%',
      'D. Number of pods in Running state in Kubernetes',
    ],
    correctAnswers: [1],
    explanation:
      'User-perceived availability is best measured by successful requests from the user perspective. Measuring at the load balancer captures all user requests.',
    difficulty: 'medium',
    gcpServices: ['Cloud Monitoring', 'Cloud Load Balancing'],
  },
  {
    domainCode: 'PCA_OPS_EXCELLENCE',
    topicCode: 'PCA_DEPLOYMENT',
    questionText:
      'You need to implement a deployment pipeline that promotes releases through dev, staging, and production environments with approval gates. Which Google Cloud service provides this capability?',
    questionType: 'single',
    options: [
      'A. Cloud Build alone',
      'B. Cloud Deploy',
      'C. Cloud Scheduler',
      'D. Pub/Sub with Cloud Functions',
    ],
    correctAnswers: [1],
    explanation:
      'Cloud Deploy is a managed continuous delivery service with deployment pipelines, multiple stages, approval gates, and rollback capabilities.',
    difficulty: 'easy',
    gcpServices: ['Cloud Deploy'],
  },
];

const insertQuestion = db.prepare(`
  INSERT INTO questions (domain_id, topic_id, question_text, question_type, options, correct_answers, explanation, difficulty, gcp_services, is_generated, created_at)
  VALUES (@domainId, @topicId, @questionText, @questionType, @options, @correctAnswers, @explanation, @difficulty, @gcpServices, @isGenerated, @createdAt)
`);

const getDomainByCode = db.prepare('SELECT id FROM domains WHERE code = ?');
const getTopicByCode = db.prepare('SELECT id FROM topics WHERE code = ?');

const now = Date.now();
let insertedCount = 0;

for (const q of PCA_SAMPLE_QUESTIONS) {
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
    insertedCount++;
  }
}

console.log(`Inserted ${insertedCount} PCA sample questions`);
console.log('Migration complete!');

db.close();
