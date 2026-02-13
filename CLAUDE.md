# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start client (5173) + server (3001) concurrently
npm run dev:server       # Server only (tsx watch)
npm run dev:client       # Client only (vite)

# Database
npm run db:setup         # Create tables + seed (domains, topics, sample questions)
npm run db:seed          # Seed data only
npm run db:add-pca       # Add PCA certification data
# Migrations run automatically on server startup via startupMigrations.ts

# Build (order matters: shared → server → client)
npm run build

# Testing (Vitest)
npm run test             # Run all tests once
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
# Single test file:
npm run test -w @ace-prep/server -- src/services/spacedRepetition.test.ts

# Quality
npm run lint             # ESLint across all packages
npm run lint:fix         # ESLint with auto-fix
npm run format           # Prettier write
npm run format:check     # Prettier check
npm run typecheck        # TypeScript check (server + client)
```

## Architecture

Monorepo with npm workspaces: `packages/{client,server,shared}`

### Client (`@ace-prep/client`)
- React 19 + Vite + TypeScript
- **State**: Zustand stores with persistence (`examStore`, `studyStore`, `settingsStore`, `authStore`, `certificationStore`, `drillStore`, `flashcardStore`, `studyPlanStore`, `workbookStore`)
- **Data fetching**: TanStack Query with typed API client
- **Styling**: CSS Modules + CSS Variables (from `globals.css`)
- **Routing**: React Router v7 — key routes include `/dashboard`, `/exam/:id`, `/study`, `/mastery`, `/progress`, `/readiness`, `/achievements`, `/workbook`, `/case-studies`, `/study-plan`, `/questions`, `/bookmarks`, `/notes`
- **Auth**: Google OAuth flow → `/login` → `/auth/callback` → JWT stored in authStore

### Server (`@ace-prep/server`)
- Fastify + Drizzle ORM + better-sqlite3
- **Routes**: `routes/{exams,questions,progress,study,settings,certifications,auth,drills,achievements,bookmarks,notes,flashcards,studyPlans,workbook,caseStudies,certificates,notifications,share}.ts`
- **Services**: `services/{questionGenerator,readinessService,streakService,xpService,spacedRepetition,achievementService,workbookService,planGenerator,certificateGenerator,feedbackService,pushNotificationService,jwt,shareHtml,learningPathGenerator,studyGenerator,dataMigration}.ts`
- **Validation**: Zod schemas in `validation/schemas.ts`

### Shared (`@ace-prep/shared`)
- TypeScript types for all API contracts (1600+ lines)
- Constants (`EXAM_SIZE_OPTIONS`, `DRILL_QUESTION_COUNTS`, `XP_AWARDS`, `LEVEL_THRESHOLDS`)
- GCP service mastery map data (`gcpServices.ts`)
- LLM model definitions (`ANTHROPIC_MODELS`, `OPENAI_MODELS`)
- **Must build first** before other packages

## Critical Patterns

### better-sqlite3 Transactions (Synchronous)
**CRITICAL**: Transactions must be synchronous - cannot use `async/await`:

```typescript
// ✅ CORRECT - Synchronous transaction
db.transaction((tx) => {
  const [result] = tx.select().from(table).where(...).all();
  tx.insert(table).values({...}).run();
  tx.update(table).set({...}).where(...).run();
});

// ❌ WRONG - Will throw "Transaction function cannot return a promise"
await db.transaction(async (tx) => {
  const [result] = await tx.select()...
});
```

### JSON Field Handling
Database stores arrays as JSON strings - always parse/stringify:

```typescript
// Reading
const correctAnswers = JSON.parse(question.correctAnswers as string) as number[];

// Writing
await db.insert(examResponses).values({
  selectedAnswers: JSON.stringify(selectedAnswers),
});
```

### Zod Validation with Transforms
When using `.transform(Number)`, defaults must match the output type:

```typescript
// ✅ CORRECT - default is number after transform
.transform(Number)
.optional()
.default(100)

// ❌ WRONG - default is string but transform outputs number
.transform(Number)
.optional()
.default('100')
```

### Route Validation Pattern
Always validate with Zod schemas before processing:

```typescript
const paramResult = idParamSchema.safeParse(request.params);
if (!paramResult.success) {
  return reply.status(400).send(formatZodError(paramResult.error));
}
const examId = paramResult.data.id;
```

## Database Schema

Key tables in `packages/server/src/db/schema.ts` (~47 tables):

**Core exam system**: `certifications`, `domains`, `topics`, `questions`, `exams`, `examResponses`
**Spaced repetition**: `spacedRepetition`, `performanceStats`, `readinessSnapshots`
**Auth**: `users` (Google OAuth profiles)
**Gamification**: `userXp`, `xpHistory`, `userStreaks`, `achievements`, `userAchievements`
**Study features**: `studySummaries`, `studySessions`, `studySessionResponses`, `learningPathSummaries`, `learningPathProgress`, `flashcardSessions`, `flashcardSessionRatings`, `studyPlans`, `studyPlanDays`, `studyPlanTasks`
**Workbook**: `workbookProgress`, `workbookAssessments`, `workbookResources`
**Content management**: `bookmarks`, `userNotes`, `questionFeedback`, `questionReports`
**PCA**: `caseStudies`
**Other**: `certificates`, `examShares`, `settings`, `userSettings`, `pushSubscriptions`, `notificationPreferences`, `qotdSelections`, `qotdResponses`

## Database Migrations

**CRITICAL**: All schema changes must go through `startupMigrations.ts` - they run automatically on deploy.

### Adding a New Migration

1. **Edit** `packages/server/src/db/startupMigrations.ts`
2. **Add** a new migration object to the `migrations` array with:
   - `version`: Next sequential number (current latest: **28**)
   - `name`: Descriptive snake_case name
   - `up`: Function that performs the migration

```typescript
{
  version: 29,  // Increment from last version (28)
  name: 'add_user_preferences_table',
  up: (db) => {
    // Check if already exists (idempotent)
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'")
      .get();

    if (!exists) {
      db.exec(`
        CREATE TABLE user_preferences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          theme TEXT DEFAULT 'dark'
        );
      `);
      console.log('  [migration] Created user_preferences table');
    }
  },
},
```

3. **Update** `packages/server/src/db/schema.ts` with the Drizzle schema definition
4. **Export** types from schema.ts if needed

### Migration Rules

- **Idempotent**: Always check if table/column exists before creating
- **No async**: Use synchronous better-sqlite3 operations only
- **Additive**: Prefer adding tables/columns over modifying existing ones
- **Logged**: Include `console.log` statements for visibility

### How It Works

- `runStartupMigrations()` runs at server startup (before accepting requests)
- Tracks applied migrations in `_startup_migrations` table
- Only runs migrations with versions not yet recorded
- Logs which migrations were applied

### DO NOT

- Create standalone migration files in `migrations/` folder
- Run migrations manually in production
- Skip the version number sequence
- Use `async/await` in migration functions

## Data Flow

1. **Question Generation**: Settings → LLM provider → `questionGenerator.ts` → validate → sanitize (strip difficulty prefix) → insert. Questions can also come from official Google workbook (`source: 'google_sample'`).
2. **Exam Flow**: Create exam → shuffle questions → track responses → verify answers server-side → update stats → award XP → check achievement unlocks
3. **Readiness Score**: Query `performanceStats` → calculate coverage/accuracy/recency/volume → cache 5min
4. **Workbook Flow**: Official Google questions → track mastery per question (unattempted → needs_work → learned → mastered) → quick/full assessments → link to GCP learning resources
5. **Gamification**: Actions trigger XP awards → level-up checks → streak updates → achievement unlock evaluation

## Sentry Integration

Use `Sentry.captureException(error)` for error tracking. For spans:

```typescript
Sentry.startSpan({ op: "ui.click", name: "Button Click" }, (span) => {
  span.setAttribute("key", value);
  doSomething();
});
```

## Git Workflow

**CRITICAL**: Never merge any branch directly into `main`. All changes flow through `uat` first.

```
feature/xxx  ──PR──►  uat  ──PR + ff-merge──►  main
bugfix/xxx   ──PR──►  uat  ──PR + ff-merge──►  main
```

1. Create branch from `uat`: `git checkout -b feature/xxx origin/uat`
2. Make changes and commit
3. Create PR to `uat` (CI runs, review)
4. After merge to `uat`, deploy to `main`:
   ```bash
   # Create PR for visibility and CI checks
   gh pr create --base main --head uat --title "Release: <description>"

   # Wait for CI to pass, then fast-forward merge locally
   git checkout main && git pull
   git merge --ff-only origin/uat
   git push
   # GitHub auto-closes the PR as "merged"
   ```

**Why this workflow?**
- PR provides visibility, CI checks, and audit trail
- Fast-forward merge avoids merge commits that cause `main` to diverge from `uat`
- No sync-back PRs needed - branches stay identical

**Branch naming**: `feature/<name>`, `bugfix/<name>`, `hotfix/<name>`

**Never**:
- Merge feature/bugfix branches directly to `main`
- Commit directly to `uat` or `main`
- Force-push to `uat` or `main`
- Click GitHub's "Merge" button for `uat→main` PRs (creates merge commits)
