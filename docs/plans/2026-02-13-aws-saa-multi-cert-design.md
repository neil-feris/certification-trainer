# AWS SAA-C03 Multi-Cert Support Design

**Date**: 2026-02-13
**Branch**: `feature/aws-saa-multi-cert`
**Goal**: Add AWS Solutions Architect Associate (SAA-C03) certification with full parity to GCP ACE, refactoring GCP-specific code into provider-agnostic abstractions.

## Current State

The ACE codebase is ~70% multi-cert ready. `certificationId` is threaded through most tables and routes. Key gaps:

- **Mastery map**: Hardcoded `GCP_SERVICE_CATEGORIES` constant
- **Learning path**: Hardcoded `LEARNING_PATH_ITEMS` TS constant
- **Workbook**: No `certificationId` filter, hardcoded "ACE" strings
- **Spaced repetition**: No `certificationId` on table
- **Question schema**: `gcpServices` field name is GCP-specific
- **Workbook resources**: `gcpService` field name is GCP-specific
- **Question generator**: `if/else` on cert code instead of lookup map

## Approach: Provider Abstraction Layer

Generalize GCP-specific concepts into provider-agnostic DB tables. Add AWS SAA alongside GCP ACE/PCA without provider-specific code paths.

## Schema Changes

### New Tables

#### `serviceCategories`
```sql
CREATE TABLE service_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id),
  category_name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(certification_id, category_name)
);
```

#### `serviceCategoryItems`
```sql
CREATE TABLE service_category_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES service_categories(id),
  service_name TEXT NOT NULL,
  UNIQUE(category_id, service_name)
);
```

#### `learningPathItems`
```sql
CREATE TABLE learning_path_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id),
  item_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'course' | 'lab' | 'skill_badge' | 'reading'
  url TEXT,
  description TEXT,
  duration_estimate TEXT,
  UNIQUE(certification_id, item_order)
);
```

### Modified Tables

| Table | Change | Migration |
|-------|--------|-----------|
| `questions` | Rename `gcpServices` → `cloudServices` | ALTER TABLE RENAME COLUMN |
| `spacedRepetition` | Add `certificationId INTEGER REFERENCES certifications(id)` | ALTER TABLE ADD COLUMN (nullable) |
| `workbookResources` | Rename `gcpService` → `cloudService`, add `certificationId` | ALTER TABLE RENAME + ADD |
| `certifications` | Extend capabilities JSON: `hasWorkbook`, `hasMasteryMap` | Data update only |

## AWS SAA-C03 Domain Structure

4 domains, 24 topics:

| Domain | Weight | Topics |
|--------|--------|--------|
| Design Secure Architectures | 30% | IAM policies & roles, VPC security (SGs, NACLs, endpoints), Encryption (KMS, CloudHSM, ACM), AWS Organizations & SCPs, WAF & Shield, Cognito & SSO |
| Design Resilient Architectures | 26% | Multi-AZ & multi-region design, Auto Scaling & ELB, Route 53 routing policies, Disaster recovery strategies, Decoupling (SQS, SNS, EventBridge), Step Functions & workflows |
| Design High-Performing Architectures | 24% | EC2 instance selection & placement, Storage (S3, EBS, EFS, FSx), Database (RDS, Aurora, DynamoDB), Caching (ElastiCache, CloudFront), Serverless (Lambda, API Gateway), Data analytics (Kinesis, Redshift) |
| Design Cost-Optimized Architectures | 20% | Pricing models (RI, Spot, Savings Plans), S3 storage tiers & lifecycle, Right-sizing & Cost Explorer, Trusted Advisor & Compute Optimizer, Data transfer cost optimization, Serverless cost patterns |

## AWS Service Categories (Mastery Map)

| Category | Services |
|----------|----------|
| Compute | EC2, Lambda, ECS, EKS, Fargate, Elastic Beanstalk, Batch |
| Storage | S3, EBS, EFS, FSx, Storage Gateway, Snow Family |
| Database | RDS, Aurora, DynamoDB, ElastiCache, Redshift, Neptune, DocumentDB |
| Networking | VPC, ELB (ALB/NLB/GWLB), CloudFront, Route 53, Direct Connect, Transit Gateway, API Gateway, Global Accelerator |
| Security | IAM, KMS, CloudHSM, WAF, Shield, Cognito, Organizations, GuardDuty, Inspector, Macie |
| Management | CloudWatch, CloudTrail, Config, Systems Manager, CloudFormation, Trusted Advisor, Service Catalog |
| Integration | SQS, SNS, EventBridge, Step Functions, Kinesis, AppFlow |

## Question Generator

New `SYSTEM_PROMPT_AWS_SAA` prompt:
- Focus on architectural decision-making scenarios
- Reference AWS Well-Architected Framework (6 pillars)
- Emphasize multi-service integration (e.g., "which combination of services...")
- Same JSON output format as existing prompts
- Domain/topic mapping to AWS SAA domains

Prompt selection changes from `if/else` to lookup map:
```typescript
const SYSTEM_PROMPTS: Record<string, string> = {
  ACE: SYSTEM_PROMPT_ACE,
  PCA: SYSTEM_PROMPT_PCA,
  'AWS-SAA': SYSTEM_PROMPT_AWS_SAA,
};
const systemPrompt = SYSTEM_PROMPTS[certCode] ?? SYSTEM_PROMPT_GENERIC;
```

## Feature Parity Matrix

| Feature | GCP ACE | AWS SAA | Notes |
|---------|---------|---------|-------|
| LLM question generation | Yes | Yes | New system prompt |
| Exams | Yes | Yes | Works via certificationId |
| Drills | Yes | Yes | Works via certificationId |
| Flashcards | Yes | Yes | Works via certificationId |
| Adaptive learning | Yes | Yes | Works via certificationId |
| Readiness projection | Yes | Yes | Per-cert snapshots |
| Mastery map | Yes | Yes | Service categories from DB |
| Study plans | Yes | Yes | Per-cert learning path from DB |
| Learning path | Yes | Yes | Migrated to DB |
| Workbook | Yes | Planned | Infra ready, needs AWS practice question seeding |
| Spaced repetition | Yes | Yes | Add certificationId filter |
| Achievements | Yes | Yes | Cert-agnostic |
| Streaks/XP | Yes | Yes | Cert-agnostic |
| Case studies | PCA only | No | SAA exam format doesn't include them |

## Migration Plan

All via `startupMigrations.ts` (versions 14-23):

1. **v14**: Create `serviceCategories` + `serviceCategoryItems` tables
2. **v15**: Seed GCP service categories from existing `GCP_SERVICE_CATEGORIES` constant
3. **v16**: Create `learningPathItems` table
4. **v17**: Migrate `LEARNING_PATH_ITEMS` data into `learningPathItems` for GCP ACE
5. **v18**: Rename `questions.gcpServices` → `questions.cloudServices`
6. **v19**: Rename `workbookResources.gcpService` → `workbookResources.cloudService`, add `certificationId`
7. **v20**: Add `certificationId` to `spacedRepetition` table
8. **v21**: Insert AWS SAA certification + domains + topics
9. **v22**: Seed AWS service categories + learning path items
10. **v23**: Update certification capabilities (`hasWorkbook`, `hasMasteryMap`)

## Client Changes

### Mastery Map Page
- **Before**: Import `GCP_SERVICE_CATEGORIES` from shared
- **After**: Fetch `/api/mastery-map/categories?certificationId=X` from API
- New API endpoint returns service categories per certification

### Workbook Hub
- **Before**: Hardcoded "41 diagnostic questions from the ACE Exam Prep Workbook"
- **After**: Dynamic text from certification name + question count
- Show/hide based on `capabilities.hasWorkbook`

### Learning Path
- **Before**: Import hardcoded `LEARNING_PATH_ITEMS` array
- **After**: Fetch from `/api/study/learning-path/items?certificationId=X`
- Same UI, data from DB instead of constant

### Navigation
- Use `capabilities.hasMasteryMap` to show/hide mastery map nav item
- Use `capabilities.hasWorkbook` to show/hide workbook nav item

### Shared Types
- Add `cloudServices` to question type (deprecate `gcpServices`)
- Add `ServiceCategory`, `ServiceCategoryItem`, `LearningPathItem` types
- Extend `CertificationCapabilities` with `hasWorkbook`, `hasMasteryMap`

## Files Modified

### Server
- `db/schema.ts` — new tables, column renames
- `db/startupMigrations.ts` — migrations v14-v23
- `db/seed.ts` — add AWS SAA seeding function
- `services/questionGenerator.ts` — prompt lookup map, AWS SAA prompt
- `services/workbookService.ts` — add certificationId filter
- `routes/progress.ts` — mastery map from DB, new categories endpoint
- `routes/study.ts` — learning path from DB
- `routes/flashcards.ts` — spaced rep cert filter
- `routes/exams.ts` — spaced rep cert filter
- `routes/drills.ts` — spaced rep cert filter
- `routes/workbook.ts` — cert filter on all queries

### Shared
- `index.ts` — new types, updated capabilities, deprecate gcpServices
- `gcpServices.ts` — keep for backward compat during migration, eventually remove

### Client
- `components/progress/ReadinessPage.tsx` — mastery map from API
- `components/study/workbook/WorkbookHub.tsx` — dynamic strings
- `components/study/learning-path/*` — fetch from API
- `components/layout/AppShell.tsx` — capability-based nav
- `stores/certificationStore.ts` — extended capabilities
- `api/client.ts` — new API endpoints

## Non-Goals

- AWS-specific UI theming (orange vs blue) — same UI for all certs
- AWS case studies — SAA format doesn't include them
- Multi-provider dashboard comparison — single cert at a time
- AWS free tier lab integration — just link to AWS Skill Builder courses
