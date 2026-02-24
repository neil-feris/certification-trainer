# Codebase Review: 5 Fixes + 5 Features

**Date**: 2026-02-24
**Branch**: `feature/codebase-review-fixes`
**Method**: 5-agent analysis → cross-agent debate → orchestrated implementation

## Implementation Team Structure (Approach A)

4 teammates, route work serialized to avoid file conflicts.

### Teammate 1: "frontend" (parallel)
- **Fix 5**: Replace `outline: none` with `:focus-visible` styles (11 CSS files)
- **Feature 1**: Route-level code splitting with `React.lazy` + `Suspense` (App.tsx)

### Teammate 2: "infra" (parallel)
- **Fix 2**: Force JWT secrets through `requireEnv()` in production (config.ts)
- **Feature 2**: SQLite pragmas + index on `questions.source` (db/index.ts, migration v29)

### Teammate 3: "routes" (sequential tasks)
1. **Fix 1**: Add Zod validation to `/offline-submit` and `/qotd/complete`
2. **Fix 3**: Wrap exam creation in transaction
3. **Feature 3**: Extract userId into Fastify request decorator
4. **Feature 4**: Zod enforcement plugin for Fastify
5. **Fix 4**: Sanitize error messages across all route files

### Teammate 4: "testing" (parallel)
- **Feature 5**: Unit tests for readinessService, xpService, streakService, achievementService, workbookService

## File Ownership Map

| Teammate | Files Owned |
|----------|-------------|
| frontend | `packages/client/src/App.tsx`, `packages/client/src/styles/globals.css`, 10 CSS modules |
| infra | `packages/server/src/config.ts`, `packages/server/src/db/index.ts`, `packages/server/src/db/startupMigrations.ts` |
| routes | ALL `packages/server/src/routes/*.ts`, `packages/server/src/validation/schemas.ts`, `packages/server/src/index.ts`, new plugin file |
| testing | NEW test files in `packages/server/src/services/*.test.ts` |

Zero overlaps between teammates.

## Task Dependencies (routes teammate)

```
Fix 1 (Zod schemas) → Fix 3 (exam transaction) → Feature 3 (userId decorator)
                                                  → Feature 4 (Zod plugin)
                                                  → Fix 4 (error sanitization)
```

Feature 3 must precede Fix 4 because both modify all route files. Feature 3 changes the userId extraction pattern, then Fix 4 sees the final state of each file.

## Detailed Specifications

### Fix 1: Zod Validation for /offline-submit and /qotd/complete
- Add schemas to `validation/schemas.ts`
- Apply `safeParse` + `formatZodError` pattern to both handlers
- `/offline-submit` at `routes/exams.ts:809`
- `/qotd/complete` at `routes/questions.ts:824`

### Fix 2: JWT requireEnv in Production
- In `config.ts:34-39`, change jwt.secret and jwt.refreshSecret to use `requireEnv()` when `isProduction`
- Keep dev fallbacks gated behind `!isProduction`

### Fix 3: Exam Transaction
- Wrap `routes/exams.ts:192-213` (exam INSERT + responses INSERT) in synchronous `db.transaction()`
- Must be atomic: if responses fail, exam record rolls back

### Fix 4: Error Message Sanitization
- Audit all catch blocks in 9 route files
- Replace `error.message` in HTTP responses with generic messages
- Log real error via `fastify.log.error(error)`
- Consider adding a centralized Fastify `onError` hook

### Fix 5: Focus-Visible CSS
- Remove `outline: none` from `globals.css` and 10 CSS modules
- Replace with `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`
- Verify keyboard tab navigation works

### Feature 1: Code Splitting
- Convert all static imports in `App.tsx` to `React.lazy(() => import(...))`
- Wrap route outlets in `<Suspense fallback={<LoadingSkeleton />}>`
- Create a simple `LoadingSkeleton` component if none exists

### Feature 2: SQLite Pragmas + Index
- In `db/index.ts` after WAL mode, add: `busy_timeout = 5000`, `synchronous = NORMAL`, `cache_size = -64000`
- Add migration v29 in `startupMigrations.ts`: `CREATE INDEX IF NOT EXISTS idx_questions_source ON questions(source)`

### Feature 3: userId Fastify Decorator
- Create preHandler hook in `index.ts` (or new plugin file) that parses `request.user!.id` to number
- Attach as `request.userId` (typed via Fastify declaration merging)
- Replace all 87 `parseInt(request.user!.id, 10)` calls across 13 route files

### Feature 4: Zod Enforcement Plugin
- Create `packages/server/src/plugins/zodValidation.ts`
- Plugin registers an `onRoute` hook that warns/rejects routes without validation
- Register in `index.ts`

### Feature 5: Core Service Tests
- Create test files for: readinessService, xpService, streakService, achievementService, workbookService
- Use Vitest with in-memory SQLite
- Reference existing test patterns from `spacedRepetition.test.ts`
- Target: 80%+ branch coverage per service
