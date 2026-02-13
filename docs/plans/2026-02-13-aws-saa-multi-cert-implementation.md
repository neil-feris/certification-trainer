# AWS SAA-C03 Multi-Cert Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AWS Solutions Architect Associate (SAA-C03) certification with full feature parity to GCP ACE, by refactoring GCP-specific code into provider-agnostic database-backed abstractions.

**Architecture:** Replace hardcoded GCP constants (`GCP_SERVICE_CATEGORIES`, `LEARNING_PATH_ITEMS`) with database tables keyed by `certificationId`. Rename GCP-specific columns (`gcpServices` → `cloudServices`). Add `certificationId` to tables that lack it (`spacedRepetition`). Seed AWS SAA data (cert, domains, topics, service categories, learning path). Update client to fetch from API instead of importing constants.

**Tech Stack:** Drizzle ORM (SQLite), Fastify routes, React 19 + TanStack Query + Zustand, Vitest for tests.

**Design Doc:** `docs/plans/2026-02-13-aws-saa-multi-cert-design.md`

---

## Phase 1: Schema & Migrations

### Task 1: Create serviceCategories and serviceCategoryItems Tables

**Files:**
- Modify: `packages/server/src/db/schema.ts` (add after workbookResources, ~line 832)
- Modify: `packages/server/src/db/startupMigrations.ts` (add migration v14)

**Step 1: Add Drizzle schema definitions**

In `packages/server/src/db/schema.ts`, add after the `workbookResources` table:

```typescript
// ============ SERVICE CATEGORIES (Provider-Agnostic Mastery Map) ============
export const serviceCategories = sqliteTable(
  'service_categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    certificationId: integer('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    categoryName: text('category_name').notNull(),
    categoryId: text('category_id').notNull(), // slug: 'compute', 'storage', etc.
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => [
    uniqueIndex('service_categories_cert_cat_idx').on(table.certificationId, table.categoryId),
    index('service_categories_cert_idx').on(table.certificationId),
  ]
);

export const serviceCategoryItems = sqliteTable(
  'service_category_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'cascade' }),
    serviceName: text('service_name').notNull(),
  },
  (table) => [
    uniqueIndex('service_category_items_cat_svc_idx').on(table.categoryId, table.serviceName),
    index('service_category_items_cat_idx').on(table.categoryId),
  ]
);
```

**Step 2: Add startup migration v14**

In `packages/server/src/db/startupMigrations.ts`, add to the `migrations` array:

```typescript
{
  version: 14,
  name: 'create_service_categories_tables',
  up: (db) => {
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='service_categories'")
      .get();

    if (!tableExists) {
      db.exec(`
        CREATE TABLE service_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
          category_name TEXT NOT NULL,
          category_id TEXT NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE(certification_id, category_id)
        );
        CREATE INDEX IF NOT EXISTS service_categories_cert_idx ON service_categories(certification_id);
      `);
      console.log('  [migration] Created service_categories table');
    }

    const itemsTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='service_category_items'")
      .get();

    if (!itemsTableExists) {
      db.exec(`
        CREATE TABLE service_category_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
          service_name TEXT NOT NULL,
          UNIQUE(category_id, service_name)
        );
        CREATE INDEX IF NOT EXISTS service_category_items_cat_idx ON service_category_items(category_id);
      `);
      console.log('  [migration] Created service_category_items table');
    }
  },
},
```

**Step 3: Run typecheck**

Run: `npm run typecheck -w @ace-prep/server`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/src/db/startupMigrations.ts
git commit -m "feat(schema): create service_categories and service_category_items tables (v14)"
```

---

### Task 2: Seed GCP Service Categories from Existing Constant

**Files:**
- Modify: `packages/server/src/db/startupMigrations.ts` (add migration v15)

**Step 1: Add migration v15 to seed GCP categories**

Reference `GCP_SERVICE_CATEGORIES` from `packages/shared/src/gcpServices.ts` — it has 7 categories (compute, storage, networking, analytics, ai-ml, security, operations) with ~40 services total.

```typescript
{
  version: 15,
  name: 'seed_gcp_service_categories',
  up: (db) => {
    // Get ACE certification
    const aceCert = db.prepare("SELECT id FROM certifications WHERE code = 'ACE'").get() as
      | { id: number }
      | undefined;

    if (!aceCert) {
      console.log('  [migration] ACE certification not found, skipping GCP service category seed');
      return;
    }

    // Check if already seeded
    const existing = db
      .prepare('SELECT COUNT(*) as count FROM service_categories WHERE certification_id = ?')
      .get(aceCert.id) as { count: number };

    if (existing.count > 0) {
      console.log('  [migration] GCP service categories already seeded');
      return;
    }

    // GCP service categories (mirroring GCP_SERVICE_CATEGORIES from shared)
    const categories = [
      { id: 'compute', name: 'Compute', order: 1, services: ['Compute Engine', 'App Engine', 'Cloud Functions', 'Cloud Run', 'GKE', 'Anthos'] },
      { id: 'storage', name: 'Storage & Databases', order: 2, services: ['Cloud Storage', 'Cloud SQL', 'Cloud Spanner', 'Firestore', 'Bigtable', 'Memorystore', 'Persistent Disk'] },
      { id: 'networking', name: 'Networking', order: 3, services: ['VPC', 'Cloud Load Balancing', 'Cloud CDN', 'Cloud DNS', 'Cloud Interconnect', 'Cloud VPN', 'Cloud NAT', 'Cloud Armor'] },
      { id: 'analytics', name: 'Data & Analytics', order: 4, services: ['BigQuery', 'Dataflow', 'Dataproc', 'Pub/Sub', 'Cloud Composer', 'Data Catalog'] },
      { id: 'ai-ml', name: 'AI & Machine Learning', order: 5, services: ['Vertex AI', 'AutoML', 'Cloud Vision', 'Cloud Natural Language', 'Cloud Translation'] },
      { id: 'security', name: 'Security & Identity', order: 6, services: ['Cloud IAM', 'Cloud KMS', 'Secret Manager', 'Cloud Audit Logs', 'Binary Authorization', 'VPC Service Controls'] },
      { id: 'operations', name: 'Operations', order: 7, services: ['Cloud Monitoring', 'Cloud Logging', 'Error Reporting', 'Cloud Trace', 'Cloud Profiler', 'Cloud Debugger'] },
    ];

    const insertCategory = db.prepare(
      'INSERT INTO service_categories (certification_id, category_id, category_name, display_order) VALUES (?, ?, ?, ?)'
    );
    const insertItem = db.prepare(
      'INSERT INTO service_category_items (category_id, service_name) VALUES (?, ?)'
    );

    for (const cat of categories) {
      const result = insertCategory.run(aceCert.id, cat.id, cat.name, cat.order);
      const catDbId = result.lastInsertRowid;
      for (const svc of cat.services) {
        insertItem.run(catDbId, svc);
      }
    }

    console.log(`  [migration] Seeded ${categories.length} GCP service categories for ACE`);
  },
},
```

Also seed PCA categories (same GCP services since PCA is also GCP):

```typescript
{
  version: 16,
  name: 'seed_pca_service_categories',
  up: (db) => {
    const pcaCert = db.prepare("SELECT id FROM certifications WHERE code = 'PCA'").get() as
      | { id: number }
      | undefined;

    if (!pcaCert) {
      console.log('  [migration] PCA certification not found, skipping');
      return;
    }

    const existing = db
      .prepare('SELECT COUNT(*) as count FROM service_categories WHERE certification_id = ?')
      .get(pcaCert.id) as { count: number };

    if (existing.count > 0) {
      console.log('  [migration] PCA service categories already seeded');
      return;
    }

    // PCA uses same GCP services as ACE (copy from ACE seed)
    const categories = [
      { id: 'compute', name: 'Compute', order: 1, services: ['Compute Engine', 'App Engine', 'Cloud Functions', 'Cloud Run', 'GKE', 'Anthos'] },
      { id: 'storage', name: 'Storage & Databases', order: 2, services: ['Cloud Storage', 'Cloud SQL', 'Cloud Spanner', 'Firestore', 'Bigtable', 'Memorystore', 'Persistent Disk'] },
      { id: 'networking', name: 'Networking', order: 3, services: ['VPC', 'Cloud Load Balancing', 'Cloud CDN', 'Cloud DNS', 'Cloud Interconnect', 'Cloud VPN', 'Cloud NAT', 'Cloud Armor'] },
      { id: 'analytics', name: 'Data & Analytics', order: 4, services: ['BigQuery', 'Dataflow', 'Dataproc', 'Pub/Sub', 'Cloud Composer', 'Data Catalog'] },
      { id: 'ai-ml', name: 'AI & Machine Learning', order: 5, services: ['Vertex AI', 'AutoML', 'Cloud Vision', 'Cloud Natural Language', 'Cloud Translation'] },
      { id: 'security', name: 'Security & Identity', order: 6, services: ['Cloud IAM', 'Cloud KMS', 'Secret Manager', 'Cloud Audit Logs', 'Binary Authorization', 'VPC Service Controls'] },
      { id: 'operations', name: 'Operations', order: 7, services: ['Cloud Monitoring', 'Cloud Logging', 'Error Reporting', 'Cloud Trace', 'Cloud Profiler', 'Cloud Debugger'] },
    ];

    const insertCategory = db.prepare(
      'INSERT INTO service_categories (certification_id, category_id, category_name, display_order) VALUES (?, ?, ?, ?)'
    );
    const insertItem = db.prepare(
      'INSERT INTO service_category_items (category_id, service_name) VALUES (?, ?)'
    );

    for (const cat of categories) {
      const result = insertCategory.run(pcaCert.id, cat.id, cat.name, cat.order);
      const catDbId = result.lastInsertRowid;
      for (const svc of cat.services) {
        insertItem.run(catDbId, svc);
      }
    }

    console.log(`  [migration] Seeded ${categories.length} GCP service categories for PCA`);
  },
},
```

**Step 2: Commit**

```bash
git add packages/server/src/db/startupMigrations.ts
git commit -m "feat(schema): seed GCP service categories for ACE + PCA (v15-v16)"
```

---

### Task 3: Create learningPathItems Table and Migrate Data

**Files:**
- Modify: `packages/server/src/db/schema.ts` (add table)
- Modify: `packages/server/src/db/startupMigrations.ts` (add migrations v17-v18)

**Step 1: Add Drizzle schema for learningPathItems**

In `packages/server/src/db/schema.ts`, add after `serviceCategoryItems`:

```typescript
// ============ LEARNING PATH ITEMS (Per-Certification) ============
export const learningPathItems = sqliteTable(
  'learning_path_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    certificationId: integer('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    itemOrder: integer('item_order').notNull(),
    title: text('title').notNull(),
    type: text('type').notNull(), // 'course' | 'skill_badge' | 'lab' | 'exam' | 'reading'
    url: text('url'),
    description: text('description'),
    topics: text('topics'), // JSON array of strings
    whyItMatters: text('why_it_matters'),
    durationEstimate: text('duration_estimate'),
  },
  (table) => [
    uniqueIndex('learning_path_items_cert_order_idx').on(table.certificationId, table.itemOrder),
    index('learning_path_items_cert_idx').on(table.certificationId),
  ]
);
```

**Step 2: Add migration v17 (create table)**

```typescript
{
  version: 17,
  name: 'create_learning_path_items_table',
  up: (db) => {
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='learning_path_items'")
      .get();

    if (!tableExists) {
      db.exec(`
        CREATE TABLE learning_path_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
          item_order INTEGER NOT NULL,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          url TEXT,
          description TEXT,
          topics TEXT,
          why_it_matters TEXT,
          duration_estimate TEXT,
          UNIQUE(certification_id, item_order)
        );
        CREATE INDEX IF NOT EXISTS learning_path_items_cert_idx ON learning_path_items(certification_id);
      `);
      console.log('  [migration] Created learning_path_items table');
    }
  },
},
```

**Step 3: Add migration v18 (migrate GCP ACE learning path from constant)**

Reference `packages/server/src/data/learningPathContent.ts` — 14 items. Copy data inline into migration.

```typescript
{
  version: 18,
  name: 'seed_ace_learning_path_items',
  up: (db) => {
    const aceCert = db.prepare("SELECT id FROM certifications WHERE code = 'ACE'").get() as
      | { id: number }
      | undefined;

    if (!aceCert) {
      console.log('  [migration] ACE certification not found, skipping learning path seed');
      return;
    }

    const existing = db
      .prepare('SELECT COUNT(*) as count FROM learning_path_items WHERE certification_id = ?')
      .get(aceCert.id) as { count: number };

    if (existing.count > 0) {
      console.log('  [migration] ACE learning path items already seeded');
      return;
    }

    // ACE learning path items (migrated from LEARNING_PATH_ITEMS constant in learningPathContent.ts)
    const items = [
      { order: 1, title: 'A Tour of Google Cloud Hands-on Labs', type: 'course', description: 'Introduction to Google Cloud through hands-on labs', topics: JSON.stringify(['Cloud Console', 'Cloud Shell', 'GCP basics']), whyItMatters: 'Builds foundational familiarity with the GCP console and lab environment' },
      { order: 2, title: 'Google Cloud Fundamentals: Core Infrastructure', type: 'course', description: 'Core GCP infrastructure services and concepts', topics: JSON.stringify(['Compute Engine', 'Cloud Storage', 'VPC', 'IAM', 'Cloud Monitoring']), whyItMatters: 'Covers the core services tested heavily on the ACE exam' },
      { order: 3, title: 'Getting Started with Google Kubernetes Engine', type: 'course', description: 'GKE deployment and management basics', topics: JSON.stringify(['GKE', 'Kubernetes', 'Containers', 'kubectl']), whyItMatters: 'GKE questions appear frequently on the ACE exam' },
      { order: 4, title: 'Cloud IAM and Security Fundamentals', type: 'course', description: 'Identity, access management, and security on GCP', topics: JSON.stringify(['IAM', 'Service Accounts', 'Cloud KMS', 'Audit Logs']), whyItMatters: 'IAM is a critical exam domain covering resource access control' },
      { order: 5, title: 'Networking in Google Cloud', type: 'course', description: 'VPC, load balancing, DNS, and hybrid connectivity', topics: JSON.stringify(['VPC', 'Subnets', 'Firewall Rules', 'Cloud Load Balancing', 'Cloud DNS', 'Cloud VPN']), whyItMatters: 'Networking underpins almost every architectural question on the exam' },
      { order: 6, title: 'Reliable Google Cloud Infrastructure', type: 'course', description: 'Design and process for reliable cloud solutions', topics: JSON.stringify(['High Availability', 'Disaster Recovery', 'Monitoring', 'Incident Response']), whyItMatters: 'Tests your ability to design resilient, production-ready architectures' },
      { order: 7, title: 'Cloud Load Balancing Skill Badge', type: 'skill_badge', description: 'Hands-on lab: configure HTTP(S) and TCP load balancing', topics: JSON.stringify(['Cloud Load Balancing', 'Instance Groups', 'Health Checks']), whyItMatters: 'Practical experience with load balancers frequently tested on the exam' },
      { order: 8, title: 'Automating Infrastructure on GCP with Terraform', type: 'course', description: 'Infrastructure as Code with Terraform on GCP', topics: JSON.stringify(['Terraform', 'Cloud Deployment Manager', 'Infrastructure as Code']), whyItMatters: 'IaC is increasingly important for the ACE exam' },
      { order: 9, title: 'Logging, Monitoring and Observability in GCP', type: 'course', description: 'Cloud Operations suite for monitoring and debugging', topics: JSON.stringify(['Cloud Monitoring', 'Cloud Logging', 'Error Reporting', 'Cloud Trace']), whyItMatters: 'Operations questions form a significant portion of the exam' },
      { order: 10, title: 'App Engine and Cloud Functions Skill Badge', type: 'skill_badge', description: 'Hands-on: deploy serverless applications', topics: JSON.stringify(['App Engine', 'Cloud Functions', 'Cloud Run']), whyItMatters: 'Serverless compute is a key topic on the ACE exam' },
      { order: 11, title: 'Data and Storage Services', type: 'course', description: 'Cloud SQL, Spanner, Firestore, BigQuery, and more', topics: JSON.stringify(['Cloud SQL', 'Cloud Spanner', 'Firestore', 'BigQuery', 'Bigtable']), whyItMatters: 'Choosing the right database service is a common exam scenario' },
      { order: 12, title: 'Cloud Pub/Sub and Dataflow', type: 'course', description: 'Messaging and stream processing on GCP', topics: JSON.stringify(['Pub/Sub', 'Dataflow', 'Event-driven Architecture']), whyItMatters: 'Messaging patterns appear in integration-focused exam questions' },
      { order: 13, title: 'Preparing for the ACE Certification', type: 'course', description: 'Exam strategies, review, and practice', topics: JSON.stringify(['Exam Tips', 'Review', 'Practice Questions']), whyItMatters: 'Final review and exam-taking strategies before the real exam' },
      { order: 14, title: 'ACE Certification Exam', type: 'exam', description: 'Take the Associate Cloud Engineer certification exam', topics: JSON.stringify(['All Domains']), whyItMatters: 'The certification exam itself' },
    ];

    const insert = db.prepare(
      'INSERT INTO learning_path_items (certification_id, item_order, title, type, description, topics, why_it_matters) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    for (const item of items) {
      insert.run(aceCert.id, item.order, item.title, item.type, item.description, item.topics, item.whyItMatters);
    }

    console.log(`  [migration] Seeded ${items.length} learning path items for ACE`);
  },
},
```

**Step 4: Run typecheck**

Run: `npm run typecheck -w @ace-prep/server`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/src/db/startupMigrations.ts
git commit -m "feat(schema): create learning_path_items table and seed ACE data (v17-v18)"
```

---

### Task 4: Rename gcpServices → cloudServices on Questions

**Files:**
- Modify: `packages/server/src/db/schema.ts` (line 118)
- Modify: `packages/server/src/db/startupMigrations.ts` (add migration v19)
- Modify: `packages/server/src/routes/progress.ts` (mastery-map references)
- Modify: `packages/server/src/services/questionGenerator.ts` (line 176: `gcpServices` in JSON schema)
- Modify: `packages/shared/src/index.ts` (re-exports)

**Step 1: Add migration v19 to rename column**

```typescript
{
  version: 19,
  name: 'rename_gcp_services_to_cloud_services',
  up: (db) => {
    const columns = db.prepare("PRAGMA table_info('questions')").all() as Array<{ name: string }>;
    const hasGcpServices = columns.some((col) => col.name === 'gcp_services');
    const hasCloudServices = columns.some((col) => col.name === 'cloud_services');

    if (hasGcpServices && !hasCloudServices) {
      db.exec('ALTER TABLE questions RENAME COLUMN gcp_services TO cloud_services');
      console.log('  [migration] Renamed questions.gcp_services → cloud_services');
    }
  },
},
```

**Step 2: Update Drizzle schema**

In `packages/server/src/db/schema.ts` line 118, change:
```typescript
// Before:
gcpServices: text('gcp_services'), // JSON array
// After:
cloudServices: text('cloud_services'), // JSON array of provider services
```

**Step 3: Find and update all references to `gcpServices` / `gcp_services`**

Search the codebase for all usages:
- `packages/server/src/routes/progress.ts` — mastery-map reads `question.gcpServices`
- `packages/server/src/services/questionGenerator.ts` — prompt JSON field `gcpServices`
- `packages/server/src/routes/questions.ts` — question mapping
- `packages/shared/src/index.ts` — re-exports `GCP_SERVICE_CATEGORIES`
- `packages/shared/src/gcpServices.ts` — keep as-is (helper functions still valid)

Update each reference from `gcpServices` → `cloudServices` in Drizzle queries. Keep the question generator prompt field as `"gcpServices"` in the JSON for backward compatibility with existing questions, but store as `cloudServices` in DB. Or update the prompt to say `"cloudServices"`.

**Decision:** Change the LLM prompt JSON field to `"cloudServices"` and add a parsing layer that accepts both `gcpServices` and `cloudServices` from LLM output for robustness.

**Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm run test`
Expected: Some test failures from renamed field — fix them.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename gcpServices → cloudServices on questions table (v19)"
```

---

### Task 5: Update workbookResources and Add certificationId

**Files:**
- Modify: `packages/server/src/db/schema.ts` (workbookResources, line 826-832)
- Modify: `packages/server/src/db/startupMigrations.ts` (add migration v20)
- Modify: `packages/server/src/services/workbookService.ts` (add cert filter)
- Modify: `packages/server/src/routes/workbook.ts` (add cert filter)

**Step 1: Add migration v20**

```typescript
{
  version: 20,
  name: 'update_workbook_resources_provider_agnostic',
  up: (db) => {
    const columns = db.prepare("PRAGMA table_info('workbook_resources')").all() as Array<{ name: string }>;

    // Rename gcp_service → cloud_service
    const hasGcpService = columns.some((col) => col.name === 'gcp_service');
    const hasCloudService = columns.some((col) => col.name === 'cloud_service');
    if (hasGcpService && !hasCloudService) {
      db.exec('ALTER TABLE workbook_resources RENAME COLUMN gcp_service TO cloud_service');
      console.log('  [migration] Renamed workbook_resources.gcp_service → cloud_service');
    }

    // Add certification_id column
    const hasCertId = columns.some((col) => col.name === 'certification_id');
    if (!hasCertId) {
      db.exec('ALTER TABLE workbook_resources ADD COLUMN certification_id INTEGER REFERENCES certifications(id)');
      // Backfill existing rows with ACE cert ID
      const aceCert = db.prepare("SELECT id FROM certifications WHERE code = 'ACE'").get() as
        | { id: number }
        | undefined;
      if (aceCert) {
        db.prepare('UPDATE workbook_resources SET certification_id = ? WHERE certification_id IS NULL').run(aceCert.id);
      }
      console.log('  [migration] Added certification_id to workbook_resources');
    }
  },
},
```

**Step 2: Update Drizzle schema**

```typescript
export const workbookResources = sqliteTable('workbook_resources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  certificationId: integer('certification_id').references(() => certifications.id),
  cloudService: text('cloud_service').notNull(), // e.g., "Compute Engine", "EC2"
  courses: text('courses'), // JSON: [{name: string, module?: string}]
  skillBadges: text('skill_badges'), // JSON: string[]
  documentationLinks: text('documentation_links'), // JSON: [{title: string, url: string}]
});
```

**Step 3: Add certificationId filter to workbook queries**

In `packages/server/src/services/workbookService.ts`, update all queries that filter `eq(questions.source, 'workbook')` to also filter by certificationId:

```typescript
// Add certificationId param to relevant functions
// Filter: and(eq(questions.source, 'workbook'), eq(domains.certificationId, certificationId))
// This requires joining questions → domains to access certificationId
```

In `packages/server/src/routes/workbook.ts`, pass `certificationId` from query params to service functions.

**Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm run test`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: make workbook_resources provider-agnostic with certificationId (v20)"
```

---

### Task 6: Add certificationId to Spaced Repetition

**Files:**
- Modify: `packages/server/src/db/schema.ts` (spacedRepetition, lines 192-211)
- Modify: `packages/server/src/db/startupMigrations.ts` (add migration v21)
- Modify: `packages/server/src/services/spacedRepetition.ts` (add cert filter)
- Modify: `packages/server/src/routes/flashcards.ts` (pass certId to SR queries)

**Step 1: Add migration v21**

```typescript
{
  version: 21,
  name: 'add_certification_id_to_spaced_repetition',
  up: (db) => {
    const columns = db.prepare("PRAGMA table_info('spaced_repetition')").all() as Array<{ name: string }>;
    const hasCertId = columns.some((col) => col.name === 'certification_id');

    if (!hasCertId) {
      db.exec('ALTER TABLE spaced_repetition ADD COLUMN certification_id INTEGER REFERENCES certifications(id)');
      // Backfill: join through questions → domains → certifications
      db.exec(`
        UPDATE spaced_repetition
        SET certification_id = (
          SELECT d.certification_id FROM questions q
          JOIN domains d ON q.domain_id = d.id
          WHERE q.id = spaced_repetition.question_id
        )
        WHERE certification_id IS NULL
      `);
      db.exec('CREATE INDEX IF NOT EXISTS sr_cert_idx ON spaced_repetition(certification_id)');
      console.log('  [migration] Added certification_id to spaced_repetition with backfill');
    }
  },
},
```

**Step 2: Update Drizzle schema**

Add to spacedRepetition table definition (after `questionId`):

```typescript
certificationId: integer('certification_id').references(() => certifications.id),
```

**Step 3: Update spaced repetition queries**

In `packages/server/src/services/spacedRepetition.ts`, add `certificationId` filter to all queries that fetch due cards:

```typescript
// Add eq(spacedRepetition.certificationId, certificationId) to WHERE clauses
```

When inserting new SR records, include `certificationId`.

**Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm run test`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(schema): add certificationId to spaced_repetition with backfill (v21)"
```

---

### Task 7: Insert AWS SAA Certification, Domains, and Topics

**Files:**
- Modify: `packages/server/src/db/startupMigrations.ts` (add migration v22)

**Step 1: Add migration v22 with AWS SAA seed data**

```typescript
{
  version: 22,
  name: 'seed_aws_saa_certification',
  up: (db) => {
    // Check if already exists
    const existing = db.prepare("SELECT id FROM certifications WHERE code = 'AWS-SAA'").get();
    if (existing) {
      console.log('  [migration] AWS-SAA certification already exists');
      return;
    }

    // Insert certification
    const certResult = db.prepare(`
      INSERT INTO certifications (code, name, short_name, description, provider, exam_duration_minutes, total_questions, passing_score_percent, is_active, capabilities, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'AWS-SAA',
      'AWS Solutions Architect Associate',
      'SAA',
      'Design and deploy scalable, highly available, and fault-tolerant systems on AWS',
      'aws',
      130, // SAA-C03 is 130 minutes
      65,  // SAA-C03 is 65 questions
      72,  // 720/1000 passing score ≈ 72%
      1,
      JSON.stringify({ hasCaseStudies: false, hasWorkbook: true, hasMasteryMap: true }),
      Date.now()
    );

    const certId = certResult.lastInsertRowid;

    // Domains with topics
    const domains = [
      {
        code: 'SECURE_ARCH', name: 'Design Secure Architectures', weight: 0.30, order: 1,
        description: 'Design secure access, application tiers, and data security controls',
        topics: [
          { code: 'IAM', name: 'IAM Policies and Roles', description: 'IAM users, groups, roles, policies, federation, and cross-account access' },
          { code: 'VPC_SEC', name: 'VPC Security', description: 'Security groups, NACLs, VPC endpoints, PrivateLink, and network isolation' },
          { code: 'ENCRYPTION', name: 'Encryption and Key Management', description: 'KMS, CloudHSM, ACM, S3 encryption, EBS encryption, and data protection' },
          { code: 'ORG_SCP', name: 'AWS Organizations and SCPs', description: 'Multi-account strategy, Service Control Policies, and organizational units' },
          { code: 'EDGE_SEC', name: 'Edge Security', description: 'WAF, Shield, Shield Advanced, and DDoS mitigation strategies' },
          { code: 'IDENTITY', name: 'Identity Federation', description: 'Cognito, SSO, SAML, and identity provider integration' },
        ],
      },
      {
        code: 'RESILIENT_ARCH', name: 'Design Resilient Architectures', weight: 0.26, order: 2,
        description: 'Design multi-tier, highly available, and fault-tolerant architectures',
        topics: [
          { code: 'HA_DESIGN', name: 'High Availability Design', description: 'Multi-AZ and multi-region patterns, failover strategies' },
          { code: 'SCALING', name: 'Auto Scaling and Load Balancing', description: 'Auto Scaling groups, ALB, NLB, GWLB, target groups, and health checks' },
          { code: 'DNS_ROUTING', name: 'DNS and Routing Policies', description: 'Route 53 routing policies, health checks, and DNS failover' },
          { code: 'DR', name: 'Disaster Recovery', description: 'Backup/restore, pilot light, warm standby, and multi-site DR strategies' },
          { code: 'DECOUPLE', name: 'Decoupling and Messaging', description: 'SQS, SNS, EventBridge, and event-driven architecture patterns' },
          { code: 'WORKFLOWS', name: 'Workflow Orchestration', description: 'Step Functions, SWF, and distributed system coordination' },
        ],
      },
      {
        code: 'PERF_ARCH', name: 'Design High-Performing Architectures', weight: 0.24, order: 3,
        description: 'Select performant storage, compute, database, and networking solutions',
        topics: [
          { code: 'COMPUTE', name: 'Compute Selection', description: 'EC2 instance types, placement groups, ENI, and compute optimization' },
          { code: 'STORAGE', name: 'Storage Solutions', description: 'S3, EBS (gp3, io2, st1), EFS, FSx, and storage performance optimization' },
          { code: 'DATABASE', name: 'Database Solutions', description: 'RDS, Aurora, DynamoDB, ElastiCache, Redshift, and database selection' },
          { code: 'CACHING', name: 'Caching and Content Delivery', description: 'CloudFront, ElastiCache, DAX, and caching strategies' },
          { code: 'SERVERLESS', name: 'Serverless Architecture', description: 'Lambda, API Gateway, Fargate, and serverless design patterns' },
          { code: 'DATA_ANALYTICS', name: 'Data Analytics', description: 'Kinesis, Redshift, Athena, and analytics pipeline design' },
        ],
      },
      {
        code: 'COST_ARCH', name: 'Design Cost-Optimized Architectures', weight: 0.20, order: 4,
        description: 'Design cost-effective storage, compute, and database solutions',
        topics: [
          { code: 'PRICING', name: 'Pricing Models', description: 'Reserved Instances, Savings Plans, Spot Instances, and pricing optimization' },
          { code: 'STORAGE_TIERS', name: 'Storage Cost Optimization', description: 'S3 storage classes, lifecycle policies, and data transfer costs' },
          { code: 'RIGHTSIZING', name: 'Right-Sizing and Monitoring', description: 'Cost Explorer, Trusted Advisor, Compute Optimizer, and resource optimization' },
          { code: 'TRANSFER', name: 'Data Transfer Optimization', description: 'VPC endpoints, Direct Connect pricing, and cross-region transfer strategies' },
          { code: 'SERVERLESS_COST', name: 'Serverless Cost Patterns', description: 'Lambda pricing, API Gateway caching, and pay-per-use optimization' },
          { code: 'TAGGING', name: 'Cost Allocation and Governance', description: 'Tagging strategies, AWS Budgets, and cost allocation reports' },
        ],
      },
    ];

    const insertDomain = db.prepare(
      'INSERT INTO domains (certification_id, code, name, weight, description, order_index) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertTopic = db.prepare(
      'INSERT INTO topics (domain_id, code, name, description) VALUES (?, ?, ?, ?)'
    );

    for (const domain of domains) {
      const domainResult = insertDomain.run(certId, domain.code, domain.name, domain.weight, domain.description, domain.order);
      const domainId = domainResult.lastInsertRowid;
      for (const topic of domain.topics) {
        insertTopic.run(domainId, topic.code, topic.name, topic.description);
      }
    }

    console.log(`  [migration] Seeded AWS-SAA certification with ${domains.length} domains and ${domains.reduce((sum, d) => sum + d.topics.length, 0)} topics`);
  },
},
```

**Step 2: Commit**

```bash
git add packages/server/src/db/startupMigrations.ts
git commit -m "feat(data): seed AWS SAA-C03 certification with domains and topics (v22)"
```

---

### Task 8: Seed AWS Service Categories and Learning Path

**Files:**
- Modify: `packages/server/src/db/startupMigrations.ts` (add migrations v23-v24)

**Step 1: Add migration v23 — AWS service categories**

```typescript
{
  version: 23,
  name: 'seed_aws_service_categories',
  up: (db) => {
    const awsCert = db.prepare("SELECT id FROM certifications WHERE code = 'AWS-SAA'").get() as
      | { id: number }
      | undefined;

    if (!awsCert) {
      console.log('  [migration] AWS-SAA certification not found, skipping');
      return;
    }

    const existing = db
      .prepare('SELECT COUNT(*) as count FROM service_categories WHERE certification_id = ?')
      .get(awsCert.id) as { count: number };

    if (existing.count > 0) {
      console.log('  [migration] AWS service categories already seeded');
      return;
    }

    const categories = [
      { id: 'compute', name: 'Compute', order: 1, services: ['EC2', 'Lambda', 'ECS', 'EKS', 'Fargate', 'Elastic Beanstalk', 'Batch'] },
      { id: 'storage', name: 'Storage', order: 2, services: ['S3', 'EBS', 'EFS', 'FSx', 'Storage Gateway', 'Snow Family'] },
      { id: 'database', name: 'Database', order: 3, services: ['RDS', 'Aurora', 'DynamoDB', 'ElastiCache', 'Redshift', 'Neptune', 'DocumentDB'] },
      { id: 'networking', name: 'Networking & Content Delivery', order: 4, services: ['VPC', 'ELB (ALB/NLB/GWLB)', 'CloudFront', 'Route 53', 'Direct Connect', 'Transit Gateway', 'API Gateway', 'Global Accelerator'] },
      { id: 'security', name: 'Security, Identity & Compliance', order: 5, services: ['IAM', 'KMS', 'CloudHSM', 'WAF', 'Shield', 'Cognito', 'Organizations', 'GuardDuty', 'Inspector', 'Macie'] },
      { id: 'management', name: 'Management & Governance', order: 6, services: ['CloudWatch', 'CloudTrail', 'Config', 'Systems Manager', 'CloudFormation', 'Trusted Advisor', 'Service Catalog'] },
      { id: 'integration', name: 'Application Integration', order: 7, services: ['SQS', 'SNS', 'EventBridge', 'Step Functions', 'Kinesis', 'AppFlow'] },
    ];

    const insertCat = db.prepare(
      'INSERT INTO service_categories (certification_id, category_id, category_name, display_order) VALUES (?, ?, ?, ?)'
    );
    const insertItem = db.prepare(
      'INSERT INTO service_category_items (category_id, service_name) VALUES (?, ?)'
    );

    for (const cat of categories) {
      const result = insertCat.run(awsCert.id, cat.id, cat.name, cat.order);
      const catDbId = result.lastInsertRowid;
      for (const svc of cat.services) {
        insertItem.run(catDbId, svc);
      }
    }

    console.log(`  [migration] Seeded ${categories.length} AWS service categories`);
  },
},
```

**Step 2: Add migration v24 — AWS learning path**

```typescript
{
  version: 24,
  name: 'seed_aws_saa_learning_path',
  up: (db) => {
    const awsCert = db.prepare("SELECT id FROM certifications WHERE code = 'AWS-SAA'").get() as
      | { id: number }
      | undefined;

    if (!awsCert) {
      console.log('  [migration] AWS-SAA certification not found, skipping');
      return;
    }

    const existing = db
      .prepare('SELECT COUNT(*) as count FROM learning_path_items WHERE certification_id = ?')
      .get(awsCert.id) as { count: number };

    if (existing.count > 0) {
      console.log('  [migration] AWS SAA learning path already seeded');
      return;
    }

    const items = [
      { order: 1, title: 'AWS Cloud Practitioner Essentials', type: 'course', description: 'Foundational AWS cloud concepts and services', topics: JSON.stringify(['AWS Global Infrastructure', 'Core Services', 'Pricing']), whyItMatters: 'Builds baseline AWS knowledge required for SAA topics' },
      { order: 2, title: 'Architecting on AWS', type: 'course', description: 'Core architectural patterns and best practices', topics: JSON.stringify(['EC2', 'VPC', 'S3', 'IAM', 'RDS']), whyItMatters: 'Covers the foundational services tested on SAA-C03' },
      { order: 3, title: 'AWS Well-Architected Framework', type: 'reading', description: 'Six pillars of well-architected applications', topics: JSON.stringify(['Operational Excellence', 'Security', 'Reliability', 'Performance', 'Cost Optimization', 'Sustainability']), whyItMatters: 'Well-Architected Framework principles underpin most SAA questions' },
      { order: 4, title: 'AWS Security Fundamentals', type: 'course', description: 'IAM, encryption, VPC security, and compliance', topics: JSON.stringify(['IAM', 'KMS', 'Security Groups', 'NACLs', 'CloudTrail']), whyItMatters: 'Security is the highest-weighted domain at 30%' },
      { order: 5, title: 'VPC and Networking Deep Dive', type: 'course', description: 'VPC design, subnets, routing, and hybrid connectivity', topics: JSON.stringify(['VPC', 'Subnets', 'Route Tables', 'NAT Gateway', 'Direct Connect', 'Transit Gateway']), whyItMatters: 'Networking is critical for both security and resilience domains' },
      { order: 6, title: 'Amazon EC2 and Auto Scaling', type: 'course', description: 'Instance types, placement, scaling policies, and ELB', topics: JSON.stringify(['EC2', 'Auto Scaling', 'ALB', 'NLB', 'Launch Templates']), whyItMatters: 'EC2 and scaling appear in resilience and performance domains' },
      { order: 7, title: 'AWS Storage Services Deep Dive', type: 'course', description: 'S3, EBS, EFS, and storage class selection', topics: JSON.stringify(['S3', 'EBS', 'EFS', 'FSx', 'Storage Gateway', 'Lifecycle Policies']), whyItMatters: 'Storage selection and optimization are heavily tested' },
      { order: 8, title: 'AWS Database Services', type: 'course', description: 'RDS, Aurora, DynamoDB, and database migration', topics: JSON.stringify(['RDS', 'Aurora', 'DynamoDB', 'ElastiCache', 'DMS']), whyItMatters: 'Choosing the right database service is a common exam scenario' },
      { order: 9, title: 'Serverless on AWS', type: 'course', description: 'Lambda, API Gateway, Step Functions, and event-driven design', topics: JSON.stringify(['Lambda', 'API Gateway', 'Step Functions', 'EventBridge', 'SQS']), whyItMatters: 'Serverless patterns appear across performance and cost domains' },
      { order: 10, title: 'AWS Cost Optimization', type: 'course', description: 'Pricing models, Reserved Instances, Savings Plans, and cost tools', topics: JSON.stringify(['Reserved Instances', 'Savings Plans', 'Spot Instances', 'Cost Explorer', 'Budgets']), whyItMatters: 'Cost optimization is 20% of the exam' },
      { order: 11, title: 'Disaster Recovery on AWS', type: 'reading', description: 'DR strategies from backup/restore to multi-site active-active', topics: JSON.stringify(['Backup/Restore', 'Pilot Light', 'Warm Standby', 'Multi-Site']), whyItMatters: 'DR strategy selection is a key topic in resilient architecture' },
      { order: 12, title: 'AWS Monitoring and Observability', type: 'course', description: 'CloudWatch, CloudTrail, Config, and operational tooling', topics: JSON.stringify(['CloudWatch', 'CloudTrail', 'Config', 'Systems Manager']), whyItMatters: 'Monitoring supports security, resilience, and performance domains' },
      { order: 13, title: 'SAA-C03 Exam Preparation', type: 'course', description: 'Practice exams, review, and exam strategies', topics: JSON.stringify(['Exam Tips', 'Review', 'Practice Questions']), whyItMatters: 'Final review and exam-taking strategies' },
      { order: 14, title: 'AWS Solutions Architect Associate Exam', type: 'exam', description: 'Take the SAA-C03 certification exam', topics: JSON.stringify(['All Domains']), whyItMatters: 'The certification exam itself' },
    ];

    const insert = db.prepare(
      'INSERT INTO learning_path_items (certification_id, item_order, title, type, description, topics, why_it_matters) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    for (const item of items) {
      insert.run(awsCert.id, item.order, item.title, item.type, item.description, item.topics, item.whyItMatters);
    }

    console.log(`  [migration] Seeded ${items.length} learning path items for AWS-SAA`);
  },
},
```

**Step 3: Commit**

```bash
git add packages/server/src/db/startupMigrations.ts
git commit -m "feat(data): seed AWS service categories and learning path (v23-v24)"
```

---

### Task 9: Update Certification Capabilities

**Files:**
- Modify: `packages/shared/src/index.ts` (CertificationCapabilities interface, ~lines 6-12)
- Modify: `packages/server/src/db/startupMigrations.ts` (add migration v25)
- Modify: `packages/client/src/components/layout/AppShell.tsx` (capability checks)

**Step 1: Extend CertificationCapabilities type**

In `packages/shared/src/index.ts`:

```typescript
// Before:
export interface CertificationCapabilities {
  hasCaseStudies: boolean;
}

// After:
export interface CertificationCapabilities {
  hasCaseStudies: boolean;
  hasWorkbook: boolean;
  hasMasteryMap: boolean;
}

export const DEFAULT_CERTIFICATION_CAPABILITIES: CertificationCapabilities = {
  hasCaseStudies: false,
  hasWorkbook: false,
  hasMasteryMap: false,
};
```

**Step 2: Add migration v25 to backfill capabilities**

```typescript
{
  version: 25,
  name: 'update_certification_capabilities',
  up: (db) => {
    // ACE: has workbook + mastery map, no case studies
    db.prepare("UPDATE certifications SET capabilities = ? WHERE code = 'ACE'")
      .run(JSON.stringify({ hasCaseStudies: false, hasWorkbook: true, hasMasteryMap: true }));

    // PCA: has case studies + mastery map, no workbook
    db.prepare("UPDATE certifications SET capabilities = ? WHERE code = 'PCA'")
      .run(JSON.stringify({ hasCaseStudies: true, hasWorkbook: false, hasMasteryMap: true }));

    // AWS-SAA: has workbook + mastery map, no case studies
    db.prepare("UPDATE certifications SET capabilities = ? WHERE code = 'AWS-SAA'")
      .run(JSON.stringify({ hasCaseStudies: false, hasWorkbook: true, hasMasteryMap: true }));

    console.log('  [migration] Updated certification capabilities for ACE, PCA, AWS-SAA');
  },
},
```

**Step 3: Update AppShell nav to use new capabilities**

In `packages/client/src/components/layout/AppShell.tsx`, add capability checks:

```typescript
const hasWorkbook = selectedCert?.capabilities?.hasWorkbook ?? false;
const hasMasteryMap = selectedCert?.capabilities?.hasMasteryMap ?? false;
// Filter nav items using these flags
```

**Step 4: Build shared first, then typecheck**

Run: `npm run build -w @ace-prep/shared && npm run typecheck`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): extend CertificationCapabilities with hasWorkbook and hasMasteryMap (v25)"
```

---

## Phase 2: Shared Types

### Task 10: Add New Shared Types

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/gcpServices.ts` (keep, but export generalized types)

**Step 1: Add ServiceCategory and LearningPathItem types**

In `packages/shared/src/index.ts`:

```typescript
// Service Categories (provider-agnostic mastery map)
export interface ServiceCategoryData {
  id: number;
  certificationId: number;
  categoryId: string; // slug: 'compute', 'storage', etc.
  categoryName: string;
  displayOrder: number;
  services: string[];
}

// Learning Path Items (per-certification)
export interface LearningPathItemData {
  id: number;
  certificationId: number;
  itemOrder: number;
  title: string;
  type: 'course' | 'skill_badge' | 'lab' | 'exam' | 'reading';
  url: string | null;
  description: string | null;
  topics: string[];
  whyItMatters: string | null;
  durationEstimate: string | null;
}

// API response for learning path with progress
export interface LearningPathItemWithProgress extends LearningPathItemData {
  isCompleted: boolean;
  completedAt: string | null;
}
```

**Step 2: Keep gcpServices.ts exports**

`gcpServices.ts` helper functions (`toServiceId`, `getMasteryLevel`, `MasteryLevel`, etc.) are provider-agnostic already. Keep them. The `GCP_SERVICE_CATEGORIES` constant can be deprecated but kept for backward compat during migration.

**Step 3: Build shared**

Run: `npm run build -w @ace-prep/shared`

**Step 4: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add ServiceCategoryData and LearningPathItemData types"
```

---

## Phase 3: Server Routes

### Task 11: New Mastery-Map Categories API Endpoint

**Files:**
- Modify: `packages/server/src/routes/progress.ts` (add new endpoint, refactor mastery-map)

**Step 1: Add GET /progress/service-categories endpoint**

Returns service categories from the database for a given certificationId:

```typescript
server.get('/progress/service-categories', { preHandler: [authenticate] }, async (request, reply) => {
  const certId = await parseCertificationIdFromQuery(request.query, reply);
  if (!certId) return;

  const categories = await db
    .select({
      id: serviceCategories.id,
      certificationId: serviceCategories.certificationId,
      categoryId: serviceCategories.categoryId,
      categoryName: serviceCategories.categoryName,
      displayOrder: serviceCategories.displayOrder,
    })
    .from(serviceCategories)
    .where(eq(serviceCategories.certificationId, certId))
    .orderBy(serviceCategories.displayOrder)
    .all();

  // For each category, fetch items
  const result = [];
  for (const cat of categories) {
    const items = await db
      .select({ serviceName: serviceCategoryItems.serviceName })
      .from(serviceCategoryItems)
      .where(eq(serviceCategoryItems.categoryId, cat.id))
      .all();

    result.push({
      ...cat,
      services: items.map((i) => i.serviceName),
    });
  }

  return reply.send(result);
});
```

**Step 2: Refactor mastery-map endpoint to use DB categories**

Replace the import of `GCP_SERVICE_CATEGORIES` with a DB query:

```typescript
// Before: import { GCP_SERVICE_CATEGORIES } from '@ace-prep/shared';
// After: query serviceCategories table
const categories = await db
  .select()
  .from(serviceCategories)
  .where(eq(serviceCategories.certificationId, certId))
  .orderBy(serviceCategories.displayOrder)
  .all();
```

Then iterate over DB categories instead of hardcoded constant.

**Step 3: Run tests**

Run: `npm run test -w @ace-prep/server`

**Step 4: Commit**

```bash
git add packages/server/src/routes/progress.ts
git commit -m "feat(api): add service-categories endpoint, refactor mastery-map to use DB"
```

---

### Task 12: Refactor Learning Path Endpoints to Use Database

**Files:**
- Modify: `packages/server/src/routes/study.ts` (lines 112-190)

**Step 1: Replace LEARNING_PATH_ITEMS import with DB query**

In `GET /study/learning-path`:

```typescript
// Before: import { LEARNING_PATH_ITEMS } from '../data/learningPathContent.js';
// After:
const pathItems = await db
  .select()
  .from(learningPathItems)
  .where(eq(learningPathItems.certificationId, certId))
  .orderBy(learningPathItems.itemOrder)
  .all();

// Join with progress
const progress = await db
  .select()
  .from(learningPathProgress)
  .where(and(
    eq(learningPathProgress.userId, userId),
    eq(learningPathProgress.certificationId, certId),
  ))
  .all();

const progressMap = new Map(progress.map(p => [p.pathItemOrder, p]));

const items = pathItems.map(item => ({
  ...item,
  topics: JSON.parse(item.topics || '[]'),
  isCompleted: !!progressMap.get(item.itemOrder)?.completedAt,
  completedAt: progressMap.get(item.itemOrder)?.completedAt?.toISOString() ?? null,
}));
```

**Step 2: Add new endpoint for learning path total count**

```typescript
// GET /study/learning-path/total
// Returns count of learning path items for a certification
```

**Step 3: Run tests**

Run: `npm run test -w @ace-prep/server`

**Step 4: Commit**

```bash
git add packages/server/src/routes/study.ts
git commit -m "refactor(api): learning path endpoints use database instead of hardcoded constant"
```

---

### Task 13: AWS SAA System Prompt for Question Generator

**Files:**
- Modify: `packages/server/src/services/questionGenerator.ts` (lines 35-80, line 124, line 194)

**Step 1: Add SYSTEM_PROMPT_AWS_SAA**

After the existing PCA prompt:

```typescript
const SYSTEM_PROMPT_AWS_SAA = `You are an expert AWS instructor creating practice questions for the Solutions Architect Associate (SAA-C03) certification exam.

Your questions must:
1. Match the difficulty and style of real SAA-C03 exam questions
2. Test architectural decision-making and scenario-based reasoning
3. Reference AWS Well-Architected Framework principles where relevant
4. Include realistic multi-service integration scenarios
5. Have plausible distractors that test understanding of service trade-offs

Question format requirements:
- Single-select: One correct answer among 4 options
- Multi-select: 2-3 correct answers among 4-5 options (state how many to select)
- Options should be similar in length and structure
- Avoid "all of the above" or "none of the above"
- Avoid negative phrasing ("Which is NOT...")

Each question must include:
1. A realistic scenario or context
2. Clear options labeled A, B, C, D (and E if multi-select)
3. The correct answer(s)
4. A detailed explanation of why the answer is correct
5. Why each incorrect option is wrong
6. Related AWS services being tested`;
```

**Step 2: Replace if/else with lookup map**

```typescript
// Before (line 194):
const systemPrompt = params.certificationCode === 'PCA' ? SYSTEM_PROMPT_PCA : SYSTEM_PROMPT_ACE;

// After:
const SYSTEM_PROMPTS: Record<string, string> = {
  ACE: SYSTEM_PROMPT_ACE,
  PCA: SYSTEM_PROMPT_PCA,
  'AWS-SAA': SYSTEM_PROMPT_AWS_SAA,
};
const systemPrompt = SYSTEM_PROMPTS[params.certificationCode ?? 'ACE'] ?? SYSTEM_PROMPT_ACE;
```

**Step 3: Update createUserPrompt**

```typescript
// Before (line 124):
const certName = params.certificationCode === 'PCA' ? 'PCA' : 'ACE';

// After:
const certName = params.certificationCode ?? 'ACE';
```

**Step 4: Update JSON field in prompt**

In `createUserPrompt` (line 176), change:
```typescript
// Before:
"gcpServices": ["Service1", "Service2"],

// After:
"cloudServices": ["Service1", "Service2"],
```

**Step 5: Update response parsing**

In the response parsing code, accept both `gcpServices` and `cloudServices` for backward compatibility with existing questions:

```typescript
cloudServices: q.cloudServices || q.gcpServices || [],
```

**Step 6: Run typecheck + tests**

Run: `npm run typecheck && npm run test -w @ace-prep/server`

**Step 7: Commit**

```bash
git add packages/server/src/services/questionGenerator.ts
git commit -m "feat(gen): add AWS SAA system prompt, refactor prompt selection to lookup map"
```

---

## Phase 4: Client Updates

### Task 14: Mastery Map from API

**Files:**
- Modify: `packages/client/src/api/client.ts` (add new API call)
- Modify: `packages/client/src/components/progress/ReadinessPage.tsx` or mastery-map component

**Step 1: Add API function**

```typescript
getServiceCategories: (certificationId: number) =>
  fetchApi<ServiceCategoryData[]>(`/progress/service-categories?certificationId=${certificationId}`),
```

**Step 2: Update mastery-map component**

Replace import of `GCP_SERVICE_CATEGORIES` with TanStack Query fetch of `/progress/service-categories`.

**Step 3: Run dev server to verify**

Run: `npm run dev`
Verify: Mastery map loads for both GCP ACE and AWS SAA.

**Step 4: Commit**

```bash
git add packages/client/
git commit -m "feat(ui): mastery map fetches service categories from API"
```

---

### Task 15: Learning Path from API

**Files:**
- Modify: `packages/client/src/api/client.ts`
- Modify: `packages/client/src/components/study/learning-path/*.tsx`

**Step 1: Update API client**

Ensure learning path fetch uses the existing endpoint which now returns DB-backed data.

**Step 2: Remove hardcoded LEARNING_PATH_TOTAL references**

Replace any client-side imports of `LEARNING_PATH_ITEMS` or `LEARNING_PATH_TOTAL` with data from the API response.

**Step 3: Commit**

```bash
git add packages/client/
git commit -m "feat(ui): learning path uses API data instead of hardcoded constant"
```

---

### Task 16: Workbook Dynamic Strings

**Files:**
- Modify: `packages/client/src/components/study/workbook/WorkbookHub.tsx`
- Modify: `packages/client/src/components/study/domains/OfficialQuestionsCard.tsx`

**Step 1: Replace hardcoded "ACE" references**

Use the selected certification's name dynamically:

```typescript
const selectedCert = useCertificationStore((s) => s.getSelectedCertification());
// Replace "ACE Exam Prep Workbook" with `${selectedCert?.shortName} Exam Prep Workbook`
```

**Step 2: Conditionally show workbook based on capability**

```typescript
const hasWorkbook = selectedCert?.capabilities?.hasWorkbook ?? false;
if (!hasWorkbook) return null; // or show "No workbook available" state
```

**Step 3: Commit**

```bash
git add packages/client/
git commit -m "feat(ui): dynamic certification names in workbook, capability-gated display"
```

---

### Task 17: Navigation Capability Flags

**Files:**
- Modify: `packages/client/src/components/layout/AppShell.tsx`

**Step 1: Update nav item filtering**

Add `requiresWorkbook` and `requiresMasteryMap` to nav item definitions:

```typescript
const visibleNavItems = NAV_ITEMS.filter((item) => {
  if (item.requiresCaseStudies && !hasCaseStudies) return false;
  if (item.requiresWorkbook && !hasWorkbook) return false;
  if (item.requiresMasteryMap && !hasMasteryMap) return false;
  return true;
});
```

**Step 2: Commit**

```bash
git add packages/client/src/components/layout/AppShell.tsx
git commit -m "feat(ui): capability-gated nav items for workbook and mastery map"
```

---

## Phase 5: Testing & Cleanup

### Task 18: Write Tests for New Service Categories Endpoint

**Files:**
- Create: `packages/server/src/routes/progress.service-categories.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect } from 'vitest';
// Test GET /progress/service-categories returns categories for a given certificationId
// Test returns empty array for cert with no categories
// Test categories include services array
```

**Step 2: Run test to verify**

Run: `npm run test -w @ace-prep/server -- src/routes/progress.service-categories.test.ts`

**Step 3: Commit**

```bash
git add packages/server/src/routes/progress.service-categories.test.ts
git commit -m "test: add tests for service-categories endpoint"
```

---

### Task 19: Write Tests for AWS Question Generation Prompt

**Files:**
- Modify or create: `packages/server/src/services/questionGenerator.test.ts`

**Step 1: Test prompt selection map**

Verify `AWS-SAA` cert code selects correct system prompt and user prompt references AWS services.

**Step 2: Test cloudServices field parsing**

Verify response parsing handles both `gcpServices` and `cloudServices` fields.

**Step 3: Commit**

```bash
git add packages/server/src/services/questionGenerator.test.ts
git commit -m "test: add tests for AWS SAA prompt selection and cloudServices parsing"
```

---

### Task 20: Integration Test — Full Server Startup

**Step 1: Start server fresh**

Run: `npm run dev:server`
Verify: All migrations (v14-v25) run successfully in console output.

**Step 2: Verify API endpoints**

```bash
# Get certifications — should include AWS-SAA
curl localhost:3001/api/certifications

# Get AWS-SAA domains
curl "localhost:3001/api/study/domains?certificationId=<aws-saa-id>"

# Get AWS-SAA service categories
curl "localhost:3001/api/progress/service-categories?certificationId=<aws-saa-id>"

# Get AWS-SAA learning path
curl "localhost:3001/api/study/learning-path?certificationId=<aws-saa-id>"
```

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from full startup test"
```

---

### Task 21: Cleanup — Deprecate Hardcoded Constants

**Files:**
- Modify: `packages/server/src/data/learningPathContent.ts` (add deprecation comment)
- Modify: `packages/shared/src/gcpServices.ts` (add deprecation comment)

**Step 1: Add deprecation markers**

```typescript
/** @deprecated Use learning_path_items DB table instead. Kept for backward compat. */
export const LEARNING_PATH_ITEMS = [...]

/** @deprecated Use service_categories DB table instead. Kept for backward compat. */
export const GCP_SERVICE_CATEGORIES = [...]
```

**Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

**Step 3: Run full build**

Run: `npm run build`
Expected: Clean build.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: deprecate hardcoded learning path and GCP service constants"
```

---

## Update CLAUDE.md

### Task 22: Update Migration Version in CLAUDE.md

**Step 1: Update CLAUDE.md migration version to 25**

Change: `version: 13` → `version: 25` and update example accordingly.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update migration version to 25 in CLAUDE.md"
```

---

## Summary

| Phase | Tasks | Estimated Steps |
|-------|-------|-----------------|
| Phase 1: Schema & Migrations | Tasks 1-9 | ~45 steps |
| Phase 2: Shared Types | Task 10 | ~4 steps |
| Phase 3: Server Routes | Tasks 11-13 | ~21 steps |
| Phase 4: Client Updates | Tasks 14-17 | ~12 steps |
| Phase 5: Testing & Cleanup | Tasks 18-22 | ~15 steps |
| **Total** | **22 tasks** | **~97 steps** |

**Key files touched:**
- `packages/server/src/db/schema.ts` — new tables
- `packages/server/src/db/startupMigrations.ts` — v14-v25
- `packages/server/src/services/questionGenerator.ts` — AWS prompt
- `packages/server/src/routes/progress.ts` — service categories endpoint
- `packages/server/src/routes/study.ts` — learning path from DB
- `packages/server/src/routes/workbook.ts` — certificationId filter
- `packages/server/src/services/spacedRepetition.ts` — certificationId filter
- `packages/shared/src/index.ts` — new types, extended capabilities
- `packages/client/src/components/layout/AppShell.tsx` — capability nav
- `packages/client/src/components/study/workbook/WorkbookHub.tsx` — dynamic strings
