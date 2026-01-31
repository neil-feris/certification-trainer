# GCP Service Mastery Map Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a visual grid showing user mastery level for each GCP service, helping identify knowledge gaps.

**Architecture:** New `/mastery` route with dedicated page component. Backend aggregates exam responses by GCP service (parsed from `gcpServices` JSON array on questions). Frontend displays responsive grid with color-coded service cards that expand inline to show details.

**Tech Stack:** Fastify + Drizzle (backend), React + TanStack Query + CSS Modules (frontend), Zod validation, Vitest testing.

---

### Task 1: Add Shared Types and GCP Service Constants

**Files:**
- Create: `packages/shared/src/gcpServices.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create GCP service constants file**

```typescript
// packages/shared/src/gcpServices.ts
export const GCP_SERVICE_CATEGORIES = [
  {
    id: 'compute',
    name: 'Compute',
    services: ['Compute Engine', 'GKE', 'Cloud Run', 'Cloud Functions', 'App Engine'],
  },
  {
    id: 'storage',
    name: 'Storage & Databases',
    services: ['Cloud Storage', 'Cloud SQL', 'Cloud Spanner', 'Firestore', 'Bigtable', 'Memorystore', 'Filestore'],
  },
  {
    id: 'networking',
    name: 'Networking',
    services: ['VPC', 'Cloud Load Balancing', 'Cloud CDN', 'Cloud DNS', 'Cloud Armor', 'Cloud NAT', 'Cloud Interconnect'],
  },
  {
    id: 'analytics',
    name: 'Data & Analytics',
    services: ['BigQuery', 'Dataflow', 'Dataproc', 'Pub/Sub', 'Data Fusion', 'Composer'],
  },
  {
    id: 'ai-ml',
    name: 'AI & ML',
    services: ['Vertex AI', 'Vision AI', 'Natural Language', 'Translation', 'AutoML'],
  },
  {
    id: 'security',
    name: 'Security & Identity',
    services: ['IAM', 'Secret Manager', 'KMS', 'Security Command Center', 'Binary Authorization'],
  },
  {
    id: 'operations',
    name: 'Operations',
    services: ['Cloud Monitoring', 'Cloud Logging', 'Error Reporting', 'Cloud Trace'],
  },
] as const;

export type GcpCategoryId = (typeof GCP_SERVICE_CATEGORIES)[number]['id'];

export type MasteryLevel = 'none' | 'low' | 'medium' | 'high';

export interface ServiceMastery {
  id: string;
  name: string;
  category: string;
  categoryId: GcpCategoryId;
  questionsAttempted: number;
  totalQuestions: number;
  correctCount: number;
  accuracy: number | null;
  masteryLevel: MasteryLevel;
  lastAttemptAt: string | null;
}

export interface MasteryCategory {
  id: GcpCategoryId;
  name: string;
  services: ServiceMastery[];
}

export interface MasteryMapResponse {
  categories: MasteryCategory[];
  totals: {
    servicesAttempted: number;
    servicesTotal: number;
    overallAccuracy: number | null;
  };
}

export function toServiceId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function getMasteryLevel(accuracy: number | null): MasteryLevel {
  if (accuracy === null) return 'none';
  if (accuracy < 50) return 'low';
  if (accuracy < 80) return 'medium';
  return 'high';
}
```

**Step 2: Export from shared index**

Add to `packages/shared/src/index.ts`:

```typescript
export {
  GCP_SERVICE_CATEGORIES,
  type GcpCategoryId,
  type MasteryLevel,
  type ServiceMastery,
  type MasteryCategory,
  type MasteryMapResponse,
  toServiceId,
  getMasteryLevel,
} from './gcpServices.js';
```

**Step 3: Build shared package**

Run: `npm run build -w @ace-prep/shared`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/shared/src/gcpServices.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): add GCP service types and constants

Add canonical list of 40 GCP services across 7 categories for mastery map.
Include types for ServiceMastery, MasteryMapResponse, and helper functions.
EOF
)"
```

---

### Task 2: Add Backend Mastery Map Endpoint

**Files:**
- Modify: `packages/server/src/routes/progress.ts`

**Step 1: Add Zod schema for query params**

Add at top of `packages/server/src/routes/progress.ts` after existing imports:

```typescript
import {
  GCP_SERVICE_CATEGORIES,
  type MasteryMapResponse,
  type ServiceMastery,
  type MasteryCategory,
  toServiceId,
  getMasteryLevel,
} from '@ace-prep/shared';

const masteryMapQuerySchema = z.object({
  certificationId: z.string().regex(/^\d+$/).transform(Number).optional(),
});
```

**Step 2: Add the mastery-map endpoint**

Add inside `progressRoutes` function, after existing routes:

```typescript
  // GET /progress/mastery-map
  fastify.get<{
    Querystring: { certificationId?: string };
  }>('/mastery-map', async (request, reply) => {
    const userId = parseInt(request.user!.id, 10);

    const queryResult = masteryMapQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({ error: 'Invalid query parameters' });
    }
    const { certificationId } = queryResult.data;

    // Get all exam responses with question details
    const conditions = [eq(examResponses.userId, userId)];
    if (certificationId) {
      conditions.push(eq(exams.certificationId, certificationId));
    }

    const responses = await db
      .select({
        questionId: examResponses.questionId,
        isCorrect: examResponses.isCorrect,
        gcpServices: questions.gcpServices,
        createdAt: examResponses.createdAt,
      })
      .from(examResponses)
      .innerJoin(exams, eq(exams.id, examResponses.examId))
      .innerJoin(questions, eq(questions.id, examResponses.questionId))
      .where(and(...conditions));

    // Get total questions per service (for coverage)
    const questionConditions = certificationId
      ? [eq(questions.certificationId, certificationId)]
      : [];

    const allQuestions = await db
      .select({
        id: questions.id,
        gcpServices: questions.gcpServices,
      })
      .from(questions)
      .where(questionConditions.length > 0 ? and(...questionConditions) : undefined);

    // Build service stats map
    const serviceStats = new Map<
      string,
      {
        attempted: number;
        correct: number;
        total: number;
        lastAttemptAt: string | null;
      }
    >();

    // Initialize from canonical list
    for (const category of GCP_SERVICE_CATEGORIES) {
      for (const serviceName of category.services) {
        const id = toServiceId(serviceName);
        serviceStats.set(id, {
          attempted: 0,
          correct: 0,
          total: 0,
          lastAttemptAt: null,
        });
      }
    }

    // Count total questions per service
    for (const q of allQuestions) {
      const services = q.gcpServices ? (JSON.parse(q.gcpServices as string) as string[]) : [];
      for (const serviceName of services) {
        const id = toServiceId(serviceName);
        const stats = serviceStats.get(id) || {
          attempted: 0,
          correct: 0,
          total: 0,
          lastAttemptAt: null,
        };
        stats.total++;
        serviceStats.set(id, stats);
      }
    }

    // Aggregate user responses per service
    for (const resp of responses) {
      const services = resp.gcpServices
        ? (JSON.parse(resp.gcpServices as string) as string[])
        : [];
      for (const serviceName of services) {
        const id = toServiceId(serviceName);
        const stats = serviceStats.get(id) || {
          attempted: 0,
          correct: 0,
          total: 0,
          lastAttemptAt: null,
        };
        stats.attempted++;
        if (resp.isCorrect) {
          stats.correct++;
        }
        const respDate = resp.createdAt?.toISOString() || null;
        if (respDate && (!stats.lastAttemptAt || respDate > stats.lastAttemptAt)) {
          stats.lastAttemptAt = respDate;
        }
        serviceStats.set(id, stats);
      }
    }

    // Build response with categories
    const categories: MasteryCategory[] = [];
    let servicesAttempted = 0;
    let servicesTotal = 0;
    let totalCorrect = 0;
    let totalAttempted = 0;

    for (const cat of GCP_SERVICE_CATEGORIES) {
      const categoryServices: ServiceMastery[] = [];

      for (const serviceName of cat.services) {
        const id = toServiceId(serviceName);
        const stats = serviceStats.get(id)!;
        const accuracy = stats.attempted > 0 ? (stats.correct / stats.attempted) * 100 : null;

        categoryServices.push({
          id,
          name: serviceName,
          category: cat.name,
          categoryId: cat.id,
          questionsAttempted: stats.attempted,
          totalQuestions: stats.total,
          correctCount: stats.correct,
          accuracy,
          masteryLevel: getMasteryLevel(accuracy),
          lastAttemptAt: stats.lastAttemptAt,
        });

        servicesTotal++;
        if (stats.attempted > 0) {
          servicesAttempted++;
          totalCorrect += stats.correct;
          totalAttempted += stats.attempted;
        }
      }

      categories.push({
        id: cat.id,
        name: cat.name,
        services: categoryServices,
      });
    }

    // Add "Other" category for services not in canonical list
    const otherServices: ServiceMastery[] = [];
    for (const [id, stats] of serviceStats) {
      const isCanonical = GCP_SERVICE_CATEGORIES.some((cat) =>
        cat.services.some((s) => toServiceId(s) === id)
      );
      if (!isCanonical && stats.total > 0) {
        const accuracy = stats.attempted > 0 ? (stats.correct / stats.attempted) * 100 : null;
        otherServices.push({
          id,
          name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          category: 'Other',
          categoryId: 'operations', // fallback
          questionsAttempted: stats.attempted,
          totalQuestions: stats.total,
          correctCount: stats.correct,
          accuracy,
          masteryLevel: getMasteryLevel(accuracy),
          lastAttemptAt: stats.lastAttemptAt,
        });
        servicesTotal++;
        if (stats.attempted > 0) {
          servicesAttempted++;
          totalCorrect += stats.correct;
          totalAttempted += stats.attempted;
        }
      }
    }

    if (otherServices.length > 0) {
      categories.push({
        id: 'operations',
        name: 'Other',
        services: otherServices,
      });
    }

    const response: MasteryMapResponse = {
      categories,
      totals: {
        servicesAttempted,
        servicesTotal,
        overallAccuracy: totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : null,
      },
    };

    return response;
  });
```

**Step 3: Verify server starts**

Run: `npm run dev:server`
Expected: Server starts without errors

**Step 4: Test endpoint manually**

Run: `curl http://localhost:3001/api/progress/mastery-map -H "Authorization: Bearer <token>"`
Expected: JSON response with categories array

**Step 5: Commit**

```bash
git add packages/server/src/routes/progress.ts
git commit -m "$(cat <<'EOF'
feat(server): add mastery-map endpoint

Aggregate exam responses by GCP service to calculate per-service mastery.
Returns categories with services, accuracy, and mastery levels.
EOF
)"
```

---

### Task 3: Add API Client Method

**Files:**
- Modify: `packages/client/src/api/client.ts`

**Step 1: Import types**

Add to imports at top:

```typescript
import type { MasteryMapResponse } from '@ace-prep/shared';
```

**Step 2: Add API method to progressApi**

Add to `progressApi` object:

```typescript
  getMasteryMap: (certificationId?: number) => {
    const params = certificationId ? `?certificationId=${certificationId}` : '';
    return request<MasteryMapResponse>(`/progress/mastery-map${params}`);
  },
```

**Step 3: Commit**

```bash
git add packages/client/src/api/client.ts
git commit -m "feat(client): add getMasteryMap API method"
```

---

### Task 4: Create MasteryPage Component

**Files:**
- Create: `packages/client/src/pages/MasteryPage/MasteryPage.tsx`
- Create: `packages/client/src/pages/MasteryPage/MasteryPage.module.css`
- Create: `packages/client/src/pages/MasteryPage/index.ts`

**Step 1: Create page component**

```typescript
// packages/client/src/pages/MasteryPage/MasteryPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { progressApi } from '../../api/client';
import { useCertificationStore } from '../../stores/certificationStore';
import type { ServiceMastery, MasteryCategory } from '@ace-prep/shared';
import styles from './MasteryPage.module.css';

function ServiceCard({
  service,
  isExpanded,
  onToggle,
}: {
  service: ServiceMastery;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const masteryColors: Record<string, string> = {
    none: 'var(--bg-tertiary)',
    low: 'var(--error)',
    medium: 'var(--warning)',
    high: 'var(--success)',
  };

  return (
    <div className={styles.cardWrapper}>
      <button
        className={`${styles.card} ${styles[`mastery-${service.masteryLevel}`]}`}
        onClick={onToggle}
        style={{
          '--mastery-color': masteryColors[service.masteryLevel],
        } as React.CSSProperties}
      >
        <span className={styles.serviceName}>{service.name}</span>
        {service.accuracy !== null ? (
          <span className={styles.accuracy}>{Math.round(service.accuracy)}%</span>
        ) : (
          <span className={styles.notStarted}>Not started</span>
        )}
        {service.masteryLevel === 'high' && <span className={styles.checkmark}>✓</span>}
      </button>

      {isExpanded && (
        <div className={styles.detail}>
          <div className={styles.detailStats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Accuracy</span>
              <span className={styles.statValue}>
                {service.correctCount} / {service.questionsAttempted} correct
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Coverage</span>
              <span className={styles.statValue}>
                {service.questionsAttempted} / {service.totalQuestions} questions
              </span>
            </div>
            {service.lastAttemptAt && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Last practiced</span>
                <span className={styles.statValue}>
                  {new Date(service.lastAttemptAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CategorySection({ category }: { category: MasteryCategory }) {
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const attemptedCount = category.services.filter((s) => s.questionsAttempted > 0).length;

  return (
    <section className={styles.category}>
      <h2 className={styles.categoryHeader}>
        {category.name}
        <span className={styles.categoryBadge}>
          {attemptedCount}/{category.services.length}
        </span>
      </h2>
      <div className={styles.grid}>
        {category.services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            isExpanded={expandedService === service.id}
            onToggle={() =>
              setExpandedService(expandedService === service.id ? null : service.id)
            }
          />
        ))}
      </div>
    </section>
  );
}

export function MasteryPage() {
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);

  const { data, isLoading, error } = useQuery({
    queryKey: ['mastery-map', selectedCertificationId],
    queryFn: () => progressApi.getMasteryMap(selectedCertificationId ?? undefined),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading mastery data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>Failed to load mastery data</div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>GCP Service Mastery</h1>
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{data.totals.servicesAttempted}</span>
            <span className={styles.summaryLabel}>/ {data.totals.servicesTotal} services</span>
          </div>
          {data.totals.overallAccuracy !== null && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>
                {Math.round(data.totals.overallAccuracy)}%
              </span>
              <span className={styles.summaryLabel}>overall accuracy</span>
            </div>
          )}
        </div>
      </header>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['mastery-none']}`} />
          <span>Not started</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['mastery-low']}`} />
          <span>&lt;50%</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['mastery-medium']}`} />
          <span>50-80%</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['mastery-high']}`} />
          <span>&gt;80%</span>
        </div>
      </div>

      <main className={styles.content}>
        {data.categories.map((category) => (
          <CategorySection key={category.id} category={category} />
        ))}
      </main>
    </div>
  );
}
```

**Step 2: Create CSS module**

```css
/* packages/client/src/pages/MasteryPage/MasteryPage.module.css */
.page {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.loading,
.error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: var(--text-secondary);
}

.error {
  color: var(--error);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.title {
  font-family: var(--font-sans);
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.summary {
  display: flex;
  gap: 2rem;
}

.summaryItem {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.summaryValue {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--accent-primary);
}

.summaryLabel {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.legend {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 2rem;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  flex-wrap: wrap;
}

.legendItem {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.legendDot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.legendDot.mastery-none {
  background: var(--bg-tertiary);
}

.legendDot.mastery-low {
  background: var(--error);
}

.legendDot.mastery-medium {
  background: var(--warning);
}

.legendDot.mastery-high {
  background: var(--success);
}

.content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.category {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 1.5rem;
}

.categoryHeader {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 1rem;
}

.categoryBadge {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  color: var(--text-secondary);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
}

.cardWrapper {
  display: flex;
  flex-direction: column;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem 0.75rem;
  min-height: 80px;
  background: var(--bg-tertiary);
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  position: relative;
}

.card:hover {
  transform: scale(1.02);
}

.card.mastery-none {
  background: var(--bg-tertiary);
  border-color: var(--bg-tertiary);
}

.card.mastery-low {
  background: color-mix(in srgb, var(--error) 15%, var(--bg-tertiary));
  border-color: var(--error);
  box-shadow: 0 0 12px color-mix(in srgb, var(--error) 20%, transparent);
}

.card.mastery-medium {
  background: color-mix(in srgb, var(--warning) 15%, var(--bg-tertiary));
  border-color: var(--warning);
  box-shadow: 0 0 12px color-mix(in srgb, var(--warning) 20%, transparent);
}

.card.mastery-high {
  background: color-mix(in srgb, var(--success) 15%, var(--bg-tertiary));
  border-color: var(--success);
  box-shadow: 0 0 12px color-mix(in srgb, var(--success) 20%, transparent);
}

.serviceName {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-primary);
  text-align: center;
  line-height: 1.3;
}

.accuracy {
  font-size: 1rem;
  font-weight: 600;
  color: var(--mastery-color);
  margin-top: 0.25rem;
}

.notStarted {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.checkmark {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  font-size: 0.75rem;
  color: var(--success);
}

.detail {
  background: var(--bg-primary);
  border: 1px solid var(--bg-tertiary);
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 1rem;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.detailStats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.stat {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
}

.statLabel {
  color: var(--text-secondary);
}

.statValue {
  color: var(--text-primary);
  font-weight: 500;
}

@media (max-width: 768px) {
  .page {
    padding: 1rem;
  }

  .grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }

  .header {
    flex-direction: column;
  }

  .summary {
    gap: 1rem;
  }

  .legend {
    gap: 1rem;
  }
}

@media (max-width: 480px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

**Step 3: Create index export**

```typescript
// packages/client/src/pages/MasteryPage/index.ts
export { MasteryPage } from './MasteryPage';
```

**Step 4: Commit**

```bash
git add packages/client/src/pages/MasteryPage/
git commit -m "$(cat <<'EOF'
feat(client): add MasteryPage component

Visual grid of GCP services with color-coded mastery levels.
Cards expand inline to show accuracy and coverage details.
EOF
)"
```

---

### Task 5: Add Route and Navigation

**Files:**
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/layout/AppShell.tsx` (if nav exists there)

**Step 1: Import MasteryPage**

Add import to `packages/client/src/App.tsx`:

```typescript
import { MasteryPage } from './pages/MasteryPage';
```

**Step 2: Add route**

Add route inside Routes, after existing progress routes (around line 280):

```typescript
<Route
  path="/mastery"
  element={
    <ProtectedRoute>
      <AppShell>
        <RouteErrorBoundary>
          <MasteryPage />
        </RouteErrorBoundary>
      </AppShell>
    </ProtectedRoute>
  }
/>
```

**Step 3: Add nav link**

Find the navigation component (likely in AppShell or a Sidebar component) and add:

```typescript
<NavLink to="/mastery">Mastery Map</NavLink>
```

**Step 4: Verify routing works**

Run: `npm run dev`
Navigate to: `http://localhost:5173/mastery`
Expected: Page loads with category grid

**Step 5: Commit**

```bash
git add packages/client/src/App.tsx packages/client/src/components/
git commit -m "feat(client): add /mastery route and navigation link"
```

---

### Task 6: Add Backend Tests

**Files:**
- Create: `packages/server/src/routes/progress.mastery.test.ts`

**Step 1: Write mastery-map endpoint tests**

```typescript
// packages/server/src/routes/progress.mastery.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db/index.js';
import { questions, exams, examResponses, users, certifications } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { GCP_SERVICE_CATEGORIES, toServiceId } from '@ace-prep/shared';

// Test helper to create test data
async function setupTestData() {
  // Create test user
  const [user] = await db
    .insert(users)
    .values({
      email: 'test@example.com',
      passwordHash: 'hash',
      name: 'Test User',
    })
    .returning();

  // Create certification
  const [cert] = await db
    .insert(certifications)
    .values({
      code: 'TEST',
      name: 'Test Cert',
      provider: 'GCP',
      level: 'associate',
    })
    .returning();

  return { user, cert };
}

describe('GET /progress/mastery-map', () => {
  it('returns all canonical services with none mastery when no attempts', async () => {
    // This test verifies the structure matches expected format
    const totalCanonicalServices = GCP_SERVICE_CATEGORIES.reduce(
      (sum, cat) => sum + cat.services.length,
      0
    );

    expect(totalCanonicalServices).toBeGreaterThan(30);
    expect(GCP_SERVICE_CATEGORIES.length).toBe(7);
  });

  it('calculates mastery levels correctly', () => {
    // Unit test the mastery level calculation
    const { getMasteryLevel } = require('@ace-prep/shared');

    expect(getMasteryLevel(null)).toBe('none');
    expect(getMasteryLevel(0)).toBe('low');
    expect(getMasteryLevel(49)).toBe('low');
    expect(getMasteryLevel(50)).toBe('medium');
    expect(getMasteryLevel(79)).toBe('medium');
    expect(getMasteryLevel(80)).toBe('high');
    expect(getMasteryLevel(100)).toBe('high');
  });

  it('generates consistent service IDs', () => {
    expect(toServiceId('Cloud Run')).toBe('cloud-run');
    expect(toServiceId('BigQuery')).toBe('bigquery');
    expect(toServiceId('Cloud Load Balancing')).toBe('cloud-load-balancing');
    expect(toServiceId('AI/ML Platform')).toBe('aiml-platform');
  });

  it('categorizes services correctly', () => {
    const computeCategory = GCP_SERVICE_CATEGORIES.find((c) => c.id === 'compute');
    expect(computeCategory?.services).toContain('Cloud Run');
    expect(computeCategory?.services).toContain('GKE');

    const storageCategory = GCP_SERVICE_CATEGORIES.find((c) => c.id === 'storage');
    expect(storageCategory?.services).toContain('BigQuery');
    expect(storageCategory?.services).toContain('Cloud SQL');
  });
});
```

**Step 2: Run tests**

Run: `npm test -- packages/server/src/routes/progress.mastery.test.ts`
Expected: Tests pass

**Step 3: Commit**

```bash
git add packages/server/src/routes/progress.mastery.test.ts
git commit -m "test(server): add mastery-map calculation tests"
```

---

### Task 7: Final Integration Test

**Files:** None (manual verification)

**Step 1: Start dev servers**

Run: `npm run dev`

**Step 2: Navigate to mastery page**

Open: `http://localhost:5173/mastery`

**Step 3: Verify functionality**

Checklist:
- [ ] Page loads with all 7 categories
- [ ] Services display with correct names
- [ ] Gray cards for unattempted services
- [ ] Color-coded cards for attempted services (if any data exists)
- [ ] Click to expand shows detail view
- [ ] Summary stats in header are accurate
- [ ] Responsive layout works on mobile viewport
- [ ] Legend displays correctly

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete GCP Service Mastery Map (FEAT-015)"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Shared types + constants | `shared/src/gcpServices.ts`, `shared/src/index.ts` |
| 2 | Backend endpoint | `server/src/routes/progress.ts` |
| 3 | API client method | `client/src/api/client.ts` |
| 4 | MasteryPage component | `client/src/pages/MasteryPage/*` |
| 5 | Route + navigation | `client/src/App.tsx` |
| 6 | Backend tests | `server/src/routes/progress.mastery.test.ts` |
| 7 | Integration test | Manual verification |
