# AWS SAA-C03 Workbook Content Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Seed AWS SAA-C03 workbook resources (50+ services) and official sample questions (~10) via startup migration v28, enabling the workbook feature for AWS SAA.

**Architecture:** Single startup migration (v28) with three sections: workbook resources, sample questions, capabilities update. All data inline in the migration function. Uses the existing `workbook_resources` table (with `cloud_service` + `certification_id` columns from v26) and `questions` table (with `cloud_services` column and `source: 'workbook'`).

**Tech Stack:** better-sqlite3 raw SQL (synchronous), JSON.stringify for array/object fields

---

### Task 1: Download and Extract AWS SAA-C03 Sample Questions

**Files:**
- None (research task — extract question text from PDF)

**Step 1: Download the official AWS sample questions PDF**

```bash
curl -o /tmp/aws-saa-c03-sample-questions.pdf "https://d1.awsstatic.com/training-and-certification/docs-sa-assoc/AWS-Certified-Solutions-Architect-Associate_Sample-Questions.pdf"
```

**Step 2: Extract text from the PDF**

```bash
# If pdftotext available:
pdftotext /tmp/aws-saa-c03-sample-questions.pdf /tmp/aws-saa-c03-questions.txt
# Otherwise use: python3 -c "import subprocess; ..." or manual transcription
```

**Step 3: Structure the extracted questions**

For each question, record:
- Question text
- Options (A-D or A-E)
- Correct answer(s) — the PDF includes an answer key
- Map to AWS SAA domain/topic codes from migration v22:
  - Domain codes: `SECURE_ARCH`, `RESILIENT_ARCH`, `PERF_ARCH`, `COST_ARCH`
  - Topic codes per domain (see `packages/server/src/db/startupMigrations.ts:1480-1644`)
- AWS services referenced (for `cloudServices` field)

Save as structured notes for use in Task 3.

---

### Task 2: Add Workbook Resources Migration

**Files:**
- Modify: `packages/server/src/db/startupMigrations.ts` (after migration v27, before the `];` closing the array)

**Step 1: Add migration v28 skeleton**

Insert after the v27 migration object (line ~2092) and before `];`:

```typescript
{
  version: 28,
  name: 'seed_aws_saa_workbook_content',
  up: (db) => {
    const awsCert = db.prepare("SELECT id FROM certifications WHERE code = 'AWS-SAA'").get() as
      | { id: number }
      | undefined;

    if (!awsCert) {
      console.log('  [migration] AWS-SAA certification not found, skipping workbook content');
      return;
    }

    // Check if resources already seeded
    const existingResources = db
      .prepare('SELECT COUNT(*) as count FROM workbook_resources WHERE certification_id = ?')
      .get(awsCert.id) as { count: number };

    if (existingResources.count > 0) {
      console.log('  [migration] AWS SAA workbook resources already seeded');
    } else {
      // --- PART 1: Workbook Resources ---
      // (added in Step 2)
    }

    // --- PART 2: Sample Questions ---
    // (added in Task 3)

    // --- PART 3: Update capabilities ---
    // (added in Task 4)
  },
},
```

**Step 2: Add workbook resources data**

Inside the `else` block from Step 1, add the resources. Each service maps to courses, skill badges, and documentation links.

The insert statement uses the post-v26 schema (`cloud_service` + `certification_id`):

```typescript
const insertResource = db.prepare(`
  INSERT INTO workbook_resources (certification_id, cloud_service, courses, skill_badges, documentation_links)
  VALUES (?, ?, ?, ?, ?)
`);

const resources = [
  // --- Compute (7 services) ---
  {
    service: 'EC2',
    courses: [{ name: 'Amazon EC2 Basics', module: 'Compute Fundamentals' }],
    badges: ['Running Containers on Amazon ECS'],
    docs: [{ title: 'Amazon EC2 Documentation', url: 'https://docs.aws.amazon.com/ec2/' }],
  },
  {
    service: 'Lambda',
    courses: [{ name: 'AWS Lambda Foundations', module: 'Serverless' }],
    badges: ['Serverless Development'],
    docs: [{ title: 'AWS Lambda Documentation', url: 'https://docs.aws.amazon.com/lambda/' }],
  },
  {
    service: 'ECS',
    courses: [{ name: 'Amazon ECS Primer', module: 'Containers' }],
    badges: ['Amazon ECS Service Management'],
    docs: [{ title: 'Amazon ECS Documentation', url: 'https://docs.aws.amazon.com/ecs/' }],
  },
  {
    service: 'EKS',
    courses: [{ name: 'Amazon EKS Primer', module: 'Kubernetes' }],
    badges: ['Running Kubernetes on AWS'],
    docs: [{ title: 'Amazon EKS Documentation', url: 'https://docs.aws.amazon.com/eks/' }],
  },
  {
    service: 'Fargate',
    courses: [{ name: 'AWS Fargate Primer', module: 'Serverless Containers' }],
    badges: ['Serverless Containers with Fargate'],
    docs: [{ title: 'AWS Fargate Documentation', url: 'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html' }],
  },
  {
    service: 'Elastic Beanstalk',
    courses: [{ name: 'AWS Elastic Beanstalk Primer', module: 'Managed Platforms' }],
    badges: ['Deploy Applications with Elastic Beanstalk'],
    docs: [{ title: 'Elastic Beanstalk Documentation', url: 'https://docs.aws.amazon.com/elasticbeanstalk/' }],
  },
  {
    service: 'Batch',
    courses: [{ name: 'AWS Batch Primer', module: 'Batch Processing' }],
    badges: [],
    docs: [{ title: 'AWS Batch Documentation', url: 'https://docs.aws.amazon.com/batch/' }],
  },

  // --- Storage (6 services) ---
  {
    service: 'S3',
    courses: [{ name: 'Amazon S3 Business Continuity and Disaster Recovery', module: 'Storage' }, { name: 'Architecting on AWS', module: 'Storage Services' }],
    badges: ['Data Protection and Disaster Recovery'],
    docs: [{ title: 'Amazon S3 Documentation', url: 'https://docs.aws.amazon.com/s3/' }, { title: 'S3 Storage Classes', url: 'https://aws.amazon.com/s3/storage-classes/' }],
  },
  {
    service: 'EBS',
    courses: [{ name: 'Amazon EBS Primer', module: 'Block Storage' }],
    badges: ['Storage Core'],
    docs: [{ title: 'Amazon EBS Documentation', url: 'https://docs.aws.amazon.com/ebs/' }],
  },
  {
    service: 'EFS',
    courses: [{ name: 'Amazon EFS Primer', module: 'File Storage' }],
    badges: ['Storage Core'],
    docs: [{ title: 'Amazon EFS Documentation', url: 'https://docs.aws.amazon.com/efs/' }],
  },
  {
    service: 'FSx',
    courses: [{ name: 'Amazon FSx Primer', module: 'Managed File Systems' }],
    badges: [],
    docs: [{ title: 'Amazon FSx Documentation', url: 'https://docs.aws.amazon.com/fsx/' }],
  },
  {
    service: 'Storage Gateway',
    courses: [{ name: 'AWS Storage Gateway Primer', module: 'Hybrid Storage' }],
    badges: [],
    docs: [{ title: 'Storage Gateway Documentation', url: 'https://docs.aws.amazon.com/storagegateway/' }],
  },
  {
    service: 'Snow Family',
    courses: [{ name: 'AWS Snow Family Overview', module: 'Data Migration' }],
    badges: [],
    docs: [{ title: 'AWS Snow Family Documentation', url: 'https://docs.aws.amazon.com/snowball/' }],
  },

  // --- Database (7 services) ---
  {
    service: 'RDS',
    courses: [{ name: 'Amazon RDS Service Primer', module: 'Relational Databases' }, { name: 'Architecting on AWS', module: 'Database Services' }],
    badges: ['Amazon RDS Service Introduction'],
    docs: [{ title: 'Amazon RDS Documentation', url: 'https://docs.aws.amazon.com/rds/' }],
  },
  {
    service: 'Aurora',
    courses: [{ name: 'Amazon Aurora Service Primer', module: 'High-Performance Databases' }],
    badges: ['Amazon Aurora Service Introduction'],
    docs: [{ title: 'Amazon Aurora Documentation', url: 'https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/' }],
  },
  {
    service: 'DynamoDB',
    courses: [{ name: 'Amazon DynamoDB Service Primer', module: 'NoSQL' }, { name: 'Amazon DynamoDB for Serverless Architectures', module: 'DynamoDB Deep Dive' }],
    badges: ['Amazon DynamoDB Service Introduction'],
    docs: [{ title: 'Amazon DynamoDB Documentation', url: 'https://docs.aws.amazon.com/dynamodb/' }],
  },
  {
    service: 'ElastiCache',
    courses: [{ name: 'Amazon ElastiCache Service Primer', module: 'Caching' }],
    badges: [],
    docs: [{ title: 'Amazon ElastiCache Documentation', url: 'https://docs.aws.amazon.com/elasticache/' }],
  },
  {
    service: 'Redshift',
    courses: [{ name: 'Amazon Redshift Primer', module: 'Data Warehousing' }],
    badges: ['Data Analytics Fundamentals'],
    docs: [{ title: 'Amazon Redshift Documentation', url: 'https://docs.aws.amazon.com/redshift/' }],
  },
  {
    service: 'Neptune',
    courses: [{ name: 'Amazon Neptune Primer', module: 'Graph Databases' }],
    badges: [],
    docs: [{ title: 'Amazon Neptune Documentation', url: 'https://docs.aws.amazon.com/neptune/' }],
  },
  {
    service: 'DocumentDB',
    courses: [{ name: 'Amazon DocumentDB Primer', module: 'Document Databases' }],
    badges: [],
    docs: [{ title: 'Amazon DocumentDB Documentation', url: 'https://docs.aws.amazon.com/documentdb/' }],
  },

  // --- Networking & Content Delivery (8 services) ---
  {
    service: 'VPC',
    courses: [{ name: 'Amazon VPC Networking Primer', module: 'Networking Fundamentals' }, { name: 'Architecting on AWS', module: 'Networking' }],
    badges: ['Networking Core'],
    docs: [{ title: 'Amazon VPC Documentation', url: 'https://docs.aws.amazon.com/vpc/' }, { title: 'VPC Best Practices', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-best-practices.html' }],
  },
  {
    service: 'ELB (ALB/NLB/GWLB)',
    courses: [{ name: 'Elastic Load Balancing Primer', module: 'Load Balancing' }],
    badges: ['Networking Core'],
    docs: [{ title: 'Elastic Load Balancing Documentation', url: 'https://docs.aws.amazon.com/elasticloadbalancing/' }],
  },
  {
    service: 'CloudFront',
    courses: [{ name: 'Amazon CloudFront Primer', module: 'Content Delivery' }],
    badges: ['CloudFront Streaming'],
    docs: [{ title: 'Amazon CloudFront Documentation', url: 'https://docs.aws.amazon.com/cloudfront/' }],
  },
  {
    service: 'Route 53',
    courses: [{ name: 'Amazon Route 53 Primer', module: 'DNS Management' }],
    badges: ['DNS and Routing'],
    docs: [{ title: 'Amazon Route 53 Documentation', url: 'https://docs.aws.amazon.com/route53/' }],
  },
  {
    service: 'Direct Connect',
    courses: [{ name: 'AWS Direct Connect Primer', module: 'Hybrid Networking' }],
    badges: [],
    docs: [{ title: 'AWS Direct Connect Documentation', url: 'https://docs.aws.amazon.com/directconnect/' }],
  },
  {
    service: 'Transit Gateway',
    courses: [{ name: 'AWS Transit Gateway Primer', module: 'Network Architecture' }],
    badges: [],
    docs: [{ title: 'Transit Gateway Documentation', url: 'https://docs.aws.amazon.com/vpc/latest/tgw/' }],
  },
  {
    service: 'API Gateway',
    courses: [{ name: 'Amazon API Gateway Primer', module: 'API Management' }],
    badges: ['Serverless Development'],
    docs: [{ title: 'Amazon API Gateway Documentation', url: 'https://docs.aws.amazon.com/apigateway/' }],
  },
  {
    service: 'Global Accelerator',
    courses: [{ name: 'AWS Global Accelerator Primer', module: 'Global Networking' }],
    badges: [],
    docs: [{ title: 'AWS Global Accelerator Documentation', url: 'https://docs.aws.amazon.com/global-accelerator/' }],
  },

  // --- Security, Identity & Compliance (10 services) ---
  {
    service: 'IAM',
    courses: [{ name: 'AWS Identity and Access Management Introduction', module: 'Security Fundamentals' }, { name: 'Architecting on AWS', module: 'Identity and Access Management' }],
    badges: ['Security Fundamentals'],
    docs: [{ title: 'IAM Documentation', url: 'https://docs.aws.amazon.com/iam/' }, { title: 'IAM Best Practices', url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html' }],
  },
  {
    service: 'KMS',
    courses: [{ name: 'AWS Key Management Service Primer', module: 'Encryption' }],
    badges: ['Data Protection and Disaster Recovery'],
    docs: [{ title: 'AWS KMS Documentation', url: 'https://docs.aws.amazon.com/kms/' }],
  },
  {
    service: 'CloudHSM',
    courses: [{ name: 'AWS CloudHSM Primer', module: 'Hardware Security' }],
    badges: [],
    docs: [{ title: 'AWS CloudHSM Documentation', url: 'https://docs.aws.amazon.com/cloudhsm/' }],
  },
  {
    service: 'WAF',
    courses: [{ name: 'AWS WAF Primer', module: 'Web Application Security' }],
    badges: ['Security Core'],
    docs: [{ title: 'AWS WAF Documentation', url: 'https://docs.aws.amazon.com/waf/' }],
  },
  {
    service: 'Shield',
    courses: [{ name: 'AWS Shield Primer', module: 'DDoS Protection' }],
    badges: [],
    docs: [{ title: 'AWS Shield Documentation', url: 'https://docs.aws.amazon.com/waf/latest/developerguide/shield-chapter.html' }],
  },
  {
    service: 'Cognito',
    courses: [{ name: 'Amazon Cognito Primer', module: 'User Authentication' }],
    badges: ['Security Core'],
    docs: [{ title: 'Amazon Cognito Documentation', url: 'https://docs.aws.amazon.com/cognito/' }],
  },
  {
    service: 'Organizations',
    courses: [{ name: 'AWS Organizations Primer', module: 'Multi-Account Strategy' }],
    badges: ['Security Core'],
    docs: [{ title: 'AWS Organizations Documentation', url: 'https://docs.aws.amazon.com/organizations/' }],
  },
  {
    service: 'GuardDuty',
    courses: [{ name: 'Amazon GuardDuty Primer', module: 'Threat Detection' }],
    badges: ['Security Core'],
    docs: [{ title: 'Amazon GuardDuty Documentation', url: 'https://docs.aws.amazon.com/guardduty/' }],
  },
  {
    service: 'Inspector',
    courses: [{ name: 'Amazon Inspector Primer', module: 'Vulnerability Assessment' }],
    badges: [],
    docs: [{ title: 'Amazon Inspector Documentation', url: 'https://docs.aws.amazon.com/inspector/' }],
  },
  {
    service: 'Macie',
    courses: [{ name: 'Amazon Macie Primer', module: 'Data Privacy' }],
    badges: [],
    docs: [{ title: 'Amazon Macie Documentation', url: 'https://docs.aws.amazon.com/macie/' }],
  },

  // --- Management & Governance (7 services) ---
  {
    service: 'CloudWatch',
    courses: [{ name: 'Introduction to Amazon CloudWatch', module: 'Monitoring' }, { name: 'Architecting on AWS', module: 'Monitoring and Scaling' }],
    badges: ['Monitoring and Observability'],
    docs: [{ title: 'Amazon CloudWatch Documentation', url: 'https://docs.aws.amazon.com/cloudwatch/' }],
  },
  {
    service: 'CloudTrail',
    courses: [{ name: 'AWS CloudTrail Primer', module: 'Audit and Compliance' }],
    badges: ['Security Core'],
    docs: [{ title: 'AWS CloudTrail Documentation', url: 'https://docs.aws.amazon.com/cloudtrail/' }],
  },
  {
    service: 'Config',
    courses: [{ name: 'AWS Config Primer', module: 'Compliance Monitoring' }],
    badges: [],
    docs: [{ title: 'AWS Config Documentation', url: 'https://docs.aws.amazon.com/config/' }],
  },
  {
    service: 'Systems Manager',
    courses: [{ name: 'AWS Systems Manager Primer', module: 'Operations Management' }],
    badges: ['Operations Core'],
    docs: [{ title: 'AWS Systems Manager Documentation', url: 'https://docs.aws.amazon.com/systems-manager/' }],
  },
  {
    service: 'CloudFormation',
    courses: [{ name: 'AWS CloudFormation Primer', module: 'Infrastructure as Code' }],
    badges: ['CloudFormation Foundations'],
    docs: [{ title: 'AWS CloudFormation Documentation', url: 'https://docs.aws.amazon.com/cloudformation/' }],
  },
  {
    service: 'Trusted Advisor',
    courses: [{ name: 'AWS Trusted Advisor Overview', module: 'Best Practices' }],
    badges: [],
    docs: [{ title: 'AWS Trusted Advisor Documentation', url: 'https://docs.aws.amazon.com/awssupport/latest/user/trusted-advisor.html' }],
  },
  {
    service: 'Service Catalog',
    courses: [{ name: 'AWS Service Catalog Primer', module: 'Governance' }],
    badges: [],
    docs: [{ title: 'AWS Service Catalog Documentation', url: 'https://docs.aws.amazon.com/servicecatalog/' }],
  },

  // --- Application Integration (6 services) ---
  {
    service: 'SQS',
    courses: [{ name: 'Amazon SQS Primer', module: 'Messaging' }, { name: 'Architecting on AWS', module: 'Decoupling' }],
    badges: ['Serverless Development'],
    docs: [{ title: 'Amazon SQS Documentation', url: 'https://docs.aws.amazon.com/sqs/' }],
  },
  {
    service: 'SNS',
    courses: [{ name: 'Amazon SNS Primer', module: 'Pub/Sub Messaging' }],
    badges: ['Serverless Development'],
    docs: [{ title: 'Amazon SNS Documentation', url: 'https://docs.aws.amazon.com/sns/' }],
  },
  {
    service: 'EventBridge',
    courses: [{ name: 'Amazon EventBridge Primer', module: 'Event-Driven Architecture' }],
    badges: ['Event-Driven Architectures'],
    docs: [{ title: 'Amazon EventBridge Documentation', url: 'https://docs.aws.amazon.com/eventbridge/' }],
  },
  {
    service: 'Step Functions',
    courses: [{ name: 'AWS Step Functions Primer', module: 'Workflow Orchestration' }],
    badges: ['Serverless Development'],
    docs: [{ title: 'AWS Step Functions Documentation', url: 'https://docs.aws.amazon.com/step-functions/' }],
  },
  {
    service: 'Kinesis',
    courses: [{ name: 'Amazon Kinesis Primer', module: 'Real-Time Streaming' }],
    badges: ['Data Analytics Fundamentals'],
    docs: [{ title: 'Amazon Kinesis Documentation', url: 'https://docs.aws.amazon.com/kinesis/' }],
  },
  {
    service: 'AppFlow',
    courses: [{ name: 'Amazon AppFlow Primer', module: 'SaaS Integration' }],
    badges: [],
    docs: [{ title: 'Amazon AppFlow Documentation', url: 'https://docs.aws.amazon.com/appflow/' }],
  },
];

for (const r of resources) {
  insertResource.run(
    awsCert.id,
    r.service,
    JSON.stringify(r.courses),
    JSON.stringify(r.badges),
    JSON.stringify(r.docs)
  );
}

console.log(`  [migration] Seeded ${resources.length} AWS SAA workbook resources`);
```

**IMPORTANT**: The `service` field values MUST match EXACTLY the service names seeded in migration v23 (`packages/server/src/db/startupMigrations.ts:1696-1774`). The names are: EC2, Lambda, ECS, EKS, Fargate, Elastic Beanstalk, Batch, S3, EBS, EFS, FSx, Storage Gateway, Snow Family, RDS, Aurora, DynamoDB, ElastiCache, Redshift, Neptune, DocumentDB, VPC, ELB (ALB/NLB/GWLB), CloudFront, Route 53, Direct Connect, Transit Gateway, API Gateway, Global Accelerator, IAM, KMS, CloudHSM, WAF, Shield, Cognito, Organizations, GuardDuty, Inspector, Macie, CloudWatch, CloudTrail, Config, Systems Manager, CloudFormation, Trusted Advisor, Service Catalog, SQS, SNS, EventBridge, Step Functions, Kinesis, AppFlow.

**Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add packages/server/src/db/startupMigrations.ts
git commit -m "feat(db): add AWS SAA workbook resources for 51 services (migration v28)"
```

---

### Task 3: Add AWS SAA Sample Questions to Migration v28

**Files:**
- Modify: `packages/server/src/db/startupMigrations.ts` (inside migration v28's `up` function, after workbook resources)

**Step 1: Add sample questions section**

After the resources insertion code and before the capabilities update, add:

```typescript
// --- PART 2: Sample Questions ---
const existingQuestions = db
  .prepare("SELECT COUNT(*) as count FROM questions WHERE source = 'workbook' AND domain_id IN (SELECT id FROM domains WHERE certification_id = ?)")
  .get(awsCert.id) as { count: number };

if (existingQuestions.count > 0) {
  console.log('  [migration] AWS SAA workbook questions already seeded');
} else {
  const getDomainByCode = db.prepare(
    'SELECT id FROM domains WHERE code = ? AND certification_id = ?'
  );
  const getTopicByCode = db.prepare(
    'SELECT id FROM topics WHERE code = ? AND domain_id = ?'
  );

  function getIds(domainCode: string, topicCode: string): { domainId: number; topicId: number } {
    const domain = getDomainByCode.get(domainCode, awsCert!.id) as { id: number } | undefined;
    if (!domain) throw new Error(`Domain not found: ${domainCode}`);
    const topic = getTopicByCode.get(topicCode, domain.id) as { id: number } | undefined;
    if (!topic) throw new Error(`Topic not found: ${topicCode} in domain ${domainCode}`);
    return { domainId: domain.id, topicId: topic.id };
  }

  const insertQuestion = db.prepare(`
    INSERT INTO questions (domain_id, topic_id, question_text, question_type, options, correct_answers, explanation, difficulty, cloud_services, is_generated, source, created_at)
    VALUES (@domainId, @topicId, @questionText, @questionType, @options, @correctAnswers, @explanation, @difficulty, @cloudServices, @isGenerated, @source, @createdAt)
  `);

  const now = Date.now();

  // Questions sourced from: https://d1.awsstatic.com/training-and-certification/docs-sa-assoc/AWS-Certified-Solutions-Architect-Associate_Sample-Questions.pdf
  const sampleQuestions = [
    // INSERT EXTRACTED QUESTIONS HERE
    // Each follows this structure:
    // {
    //   domainCode: 'SECURE_ARCH',
    //   topicCode: 'IAM',
    //   questionText: '...',
    //   questionType: 'single' | 'multiple',
    //   options: ['A. ...', 'B. ...', 'C. ...', 'D. ...'],
    //   correctAnswers: [2],  // 0-indexed
    //   explanation: '...',
    //   difficulty: 'medium',
    //   cloudServices: ['IAM', 'S3'],
    // },
  ];

  for (const q of sampleQuestions) {
    const ids = getIds(q.domainCode, q.topicCode);
    insertQuestion.run({
      domainId: ids.domainId,
      topicId: ids.topicId,
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
  }

  console.log(`  [migration] Seeded ${sampleQuestions.length} AWS SAA sample questions`);
}
```

**Step 2: Populate sampleQuestions array with extracted PDF content**

Use the questions extracted in Task 1. Each question must be mapped to the correct domain/topic code using these mappings:

| Question About | Domain Code | Topic Code |
|----------------|-------------|------------|
| IAM, roles, policies | SECURE_ARCH | IAM |
| VPC, security groups, NACLs | SECURE_ARCH | VPC_SEC |
| KMS, encryption | SECURE_ARCH | ENCRYPTION |
| Organizations, SCPs | SECURE_ARCH | ORG_SCP |
| WAF, Shield, DDoS | SECURE_ARCH | EDGE_SEC |
| Cognito, SSO, SAML | SECURE_ARCH | IDENTITY |
| Multi-AZ, failover | RESILIENT_ARCH | HA_DESIGN |
| Auto Scaling, ELB | RESILIENT_ARCH | SCALING |
| Route 53, DNS routing | RESILIENT_ARCH | DNS_ROUTING |
| DR strategies | RESILIENT_ARCH | DR |
| SQS, SNS, EventBridge | RESILIENT_ARCH | DECOUPLE |
| Step Functions, workflows | RESILIENT_ARCH | WORKFLOWS |
| EC2 types, placement | PERF_ARCH | COMPUTE |
| S3, EBS, EFS performance | PERF_ARCH | STORAGE |
| RDS, Aurora, DynamoDB perf | PERF_ARCH | DATABASE |
| CloudFront, ElastiCache | PERF_ARCH | CACHING |
| Lambda, API Gateway, Fargate | PERF_ARCH | SERVERLESS |
| Kinesis, Redshift, Athena | PERF_ARCH | DATA_ANALYTICS |
| Reserved/Spot/Savings | COST_ARCH | PRICING |
| S3 tiers, lifecycle | COST_ARCH | STORAGE_TIERS |
| Cost Explorer, right-sizing | COST_ARCH | RIGHTSIZING |
| Data transfer costs | COST_ARCH | TRANSFER |
| Serverless pricing | COST_ARCH | SERVERLESS_COST |
| Tags, budgets | COST_ARCH | TAGGING |

**Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add packages/server/src/db/startupMigrations.ts
git commit -m "feat(db): add AWS SAA official sample questions to workbook"
```

---

### Task 4: Update Capabilities and CLAUDE.md

**Files:**
- Modify: `packages/server/src/db/startupMigrations.ts` (inside migration v28, after questions)
- Modify: `CLAUDE.md` (migration version bump)

**Step 1: Add capabilities update to migration v28**

After the questions section, add:

```typescript
// --- PART 3: Update capabilities to enable workbook ---
const row = db
  .prepare("SELECT capabilities FROM certifications WHERE code = 'AWS-SAA'")
  .get() as { capabilities: string | null } | undefined;

const existing = row?.capabilities ? JSON.parse(row.capabilities) : {};
const merged = { ...existing, hasWorkbook: true };

db.prepare("UPDATE certifications SET capabilities = ? WHERE code = 'AWS-SAA'").run(
  JSON.stringify(merged)
);

console.log('  [migration] Updated AWS-SAA capabilities: hasWorkbook = true');
```

**Step 2: Update CLAUDE.md migration version**

In `CLAUDE.md`, update:
- `current latest: **27**` → `current latest: **28**`
- `version: 28,  // Increment from last version (27)` → `version: 29,  // Increment from last version (28)`

**Step 3: Run typecheck and tests**

```bash
npm run typecheck
npm run test
```

Expected: PASS (294+ tests)

**Step 4: Commit**

```bash
git add packages/server/src/db/startupMigrations.ts CLAUDE.md
git commit -m "feat(db): enable workbook for AWS SAA with capabilities update"
```

---

### Task 5: Verify End-to-End

**Step 1: Start dev server to trigger migrations**

```bash
npm run dev:server
```

Expected output includes:
```
[migration] Seeded 51 AWS SAA workbook resources
[migration] Seeded N AWS SAA sample questions
[migration] Updated AWS-SAA capabilities: hasWorkbook = true
```

**Step 2: Verify via API**

```bash
# Check capabilities
curl -s http://localhost:3001/api/certifications | jq '.[] | select(.code == "AWS-SAA") | .capabilities'
# Expected: {"hasCaseStudies":false,"hasWorkbook":true,"hasMasteryMap":true}

# Check workbook resources exist
curl -s "http://localhost:3001/api/workbook/progress?certificationId=<AWS_SAA_ID>" | head
```

**Step 3: Run full test suite**

```bash
npm run test
npm run typecheck
npm run lint
```

Expected: All pass

**Step 4: Final commit if any adjustments needed**

**Step 5: Push to remote**

```bash
git push -u origin feature/aws-saa-workbook-content
```
