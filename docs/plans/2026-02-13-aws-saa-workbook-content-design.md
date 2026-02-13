# AWS SAA-C03 Workbook Content Seeding

**Date**: 2026-02-13
**Branch**: `feature/aws-saa-workbook-content`
**Base**: `uat`
**Goal**: Seed AWS SAA-C03 workbook resources and official sample questions to enable workbook feature parity with GCP ACE.

## Context

Multi-cert infrastructure is built and deployed. AWS SAA-C03 has domains (4), topics (24), service categories (7 with 50+ services), learning path (14 items), and a question generation system prompt — all seeded via migrations v22-v24. Missing: workbook resources and official practice questions.

## Scope

### Part 1: Workbook Resources (Primary)

Map all 50+ AWS services (already in `service_categories` via migration v23) to learning resources. Each service gets:

- **courses**: AWS Training & Certification course/module names
- **skill_badges**: AWS Skill Builder lab and badge names
- **documentation_links**: Direct AWS documentation URLs

Coverage: all 7 service categories:
1. Compute (7 services): EC2, Lambda, ECS, EKS, Fargate, Elastic Beanstalk, Batch
2. Storage (6 services): S3, EBS, EFS, FSx, Storage Gateway, Snow Family
3. Database (7 services): RDS, Aurora, DynamoDB, ElastiCache, Redshift, Neptune, DocumentDB
4. Networking (8 services): VPC, ELB, CloudFront, Route 53, Direct Connect, Transit Gateway, API Gateway, Global Accelerator
5. Security (10 services): IAM, KMS, CloudHSM, WAF, Shield, Cognito, Organizations, GuardDuty, Inspector, Macie
6. Management (7 services): CloudWatch, CloudTrail, Config, Systems Manager, CloudFormation, Trusted Advisor, Service Catalog
7. Application Integration (6 services): SQS, SNS, EventBridge, Step Functions, Kinesis, AppFlow

### Part 2: Official Sample Questions (Secondary)

Seed ~10 official AWS SAA-C03 sample questions from the [AWS sample questions PDF](https://d1.awsstatic.com/training-and-certification/docs-sa-assoc/AWS-Certified-Solutions-Architect-Associate_Sample-Questions.pdf).

Each question includes:
- `questionText`, `questionType` (single/multi-select)
- `options` (JSON string array), `correctAnswers` (JSON int array)
- `explanation` with reasoning
- `domainId`/`topicId` mapped to existing AWS SAA domains/topics
- `cloudServices` (JSON string array of referenced services)
- `source: 'workbook'`, `difficulty: 'medium'`

### Part 3: Capabilities Update

Update AWS-SAA capabilities to `hasWorkbook: true` so the client shows the workbook UI.

## Implementation

Single startup migration v28 with three sections:
1. Insert workbook resources for all 50+ services
2. Insert ~10 sample questions
3. Merge `hasWorkbook: true` into AWS-SAA capabilities

## Files Changed

- `packages/server/src/db/startupMigrations.ts` — migration v28
- `CLAUDE.md` — bump migration version

## Question Sourcing

1. Download AWS sample questions PDF
2. Extract via `pdftotext` or manual transcription
3. Map each question to domain/topic by content analysis
4. Tag with relevant AWS services

## Out of Scope

- LLM-generated practice questions (users can generate these through the existing question generation flow)
- Paid AWS practice exam content (copyrighted)
- AWS Skill Builder integration (would need API access)
