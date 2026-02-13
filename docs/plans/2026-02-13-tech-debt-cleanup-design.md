# Tech Debt Cleanup: Post Multi-Cert Release

**Date**: 2026-02-13
**Branch**: `feature/tech-debt-cleanup`
**Base**: `uat`
**Scope**: 6 fixes from brutal review (M1-M3, M6-M7, M9)

## Context

After shipping AWS SAA multi-cert support (#132), a brutal code review identified 9 medium-priority issues. Investigation confirmed 6 are real, 2 were false positives (M4 capabilities parser already exists, M8 tests are solid), and 1 is deferred (M5 mastery map load — cached, no user impact).

## Fixes

### Fix 1: M6 — Migration v25 overwrites capabilities JSON

**Problem**: Migration v25 uses `SET capabilities = ?` which replaces the entire JSON blob. If re-run after manual DB edits, those edits are lost.

**File**: `packages/server/src/db/startupMigrations.ts` (migration v25, ~line 1978)

**Fix**: Read existing capabilities, merge new keys, write back:
```typescript
const updateCapabilities = (code, updates) => {
  const current = db.prepare('SELECT capabilities FROM certifications WHERE code = ?').get(code);
  const existing = current?.capabilities ? JSON.parse(current.capabilities) : {};
  const merged = { ...existing, ...updates };
  db.prepare('UPDATE certifications SET capabilities = ? WHERE code = ?').run(JSON.stringify(merged), code);
};
```

**Risk**: Moderate — touches migration, but idempotent merge is safer than overwrite.

---

### Fix 2: M2 — planGenerator SR queries lack certificationId filter

**Problem**: `generateStudyPlan` and `regenerateStudyPlan` count due SR cards without filtering by certification. Cross-cert contamination in study plan generation.

**File**: `packages/server/src/services/planGenerator.ts` (lines ~110, ~504)

**Fix**: Add `eq(spacedRepetition.certificationId, certificationId)` to both WHERE clauses. `certificationId` is already available in function scope.

**Risk**: Safe — additive filter, no data migration.

---

### Fix 3: M3 — Missing composite index on spaced_repetition

**Problem**: After M2 fix, queries filter on `(user_id, certification_id, next_review_at)` but only single-column `user_id` index exists. Performance degrades as SR table grows.

**Files**:
- `startupMigrations.ts` — new migration v27
- `schema.ts` — add index to Drizzle schema

**Fix**: `CREATE INDEX IF NOT EXISTS sr_user_cert_idx ON spaced_repetition(user_id, certification_id)`

**Risk**: Safe — adding indexes never breaks anything.

---

### Fix 4: M1 — planGenerator uses deprecated LEARNING_PATH_ITEMS

**Problem**: `planGenerator.ts` imports hardcoded `LEARNING_PATH_ITEMS` constant (marked `@deprecated`). DB table `learning_path_items` exists with cert-scoped data but isn't used.

**File**: `packages/server/src/services/planGenerator.ts` (lines ~30, ~104, ~500)

**Fix**: Replace constant import with DB query:
```typescript
const learningItems = await db
  .select({ order: learningPathItems.itemOrder })
  .from(learningPathItems)
  .where(eq(learningPathItems.certificationId, certificationId));
```

Remove import of deprecated constant. Apply in both `generateStudyPlan` and `regenerateStudyPlan`.

**Risk**: Safe — direct replacement, same data shape.

---

### Fix 5: M7 — Date.now() vs Drizzle timestamp mode

**Problem**: Schema uses `integer('created_at', { mode: 'timestamp' })` which expects `Date` objects, but code passes `Date.now()` (numeric milliseconds). Works at runtime due to auto-conversion but TypeScript types are wrong.

**Files** (8 instances):
- `db/setup.ts` (3 instances)
- `routes/workbook.ts` (1 instance)
- `db/seedCaseStudies.ts` (1 instance)
- `routes/questions.ts` (1 instance)
- `routes/progress.ts` (1 instance)

**Fix**: Replace `Date.now()` with `new Date()` at each site. Skip:
- Migration files (already executed)
- Cache/expiry calculations (correct usage of numeric timestamps)

**Risk**: Safe — both work at runtime, fix aligns types.

---

### Fix 6: M9 — hasWorkbook mismatch

**Problem**: Design doc says AWS SAA should have `hasWorkbook: true`, but migration v25 sets it to `false`. Need to verify ACE workbook content exists and capabilities match reality.

**Files**: `startupMigrations.ts`, design doc

**Fix**: Verify workbook questions exist for ACE cert, ensure capabilities JSON matches actual content availability. Update design doc if aspirational vs actual differs.

**Risk**: Safe — verification and documentation.

## Execution Order

1. M6 (data loss prevention — highest priority)
2. M2 (query correctness)
3. M3 (performance, depends on M2 for meaningful impact)
4. M1 (deprecated constant removal)
5. M7 (type correctness)
6. M9 (verification)

Each fix gets its own commit via fix-sequence pattern.

## Out of Scope

- M4: Already resolved (capabilities parser exists)
- M5: Deferred (mastery map cached, premature optimization)
- M8: False positive (tests are well-structured)
- Low-priority issues (L1-L5) from review
