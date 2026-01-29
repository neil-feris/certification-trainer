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
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Run migrations
npm run db:seed          # Seed data only

# Build (order matters: shared → server → client)
npm run build

# Testing
npm run test             # Run all tests once
npm run test:watch       # Watch mode
```

## Architecture

Monorepo with npm workspaces: `packages/{client,server,shared}`

### Client (`@ace-prep/client`)
- React 19 + Vite + TypeScript
- **State**: Zustand stores with persistence (`examStore`, `studyStore`, `settingsStore`)
- **Data fetching**: TanStack Query with typed API client
- **Styling**: CSS Modules + CSS Variables (from `globals.css`)
- **Routing**: React Router v7 (`/dashboard`, `/exam/:id`, `/study`, `/review`, `/settings`)

### Server (`@ace-prep/server`)
- Fastify + Drizzle ORM + better-sqlite3
- **Routes**: `routes/{exams,questions,progress,study,settings,certifications}.ts`
- **Services**: `services/{questionGenerator,readinessService,streakService,xpService}.ts`
- **Validation**: Zod schemas in `validation/schemas.ts`

### Shared (`@ace-prep/shared`)
- TypeScript types for API contracts
- Constants (`EXAM_SIZE_OPTIONS`, `DRILL_QUESTION_COUNTS`)
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

Key tables in `packages/server/src/db/schema.ts`:
- `certifications` - ACE, PCA with metadata
- `domains` / `topics` - Certification structure with weights
- `questions` - Question bank (JSON `options`/`correctAnswers`)
- `exams` / `examResponses` - Exam tracking
- `spacedRepetition` - SM-2 scheduling
- `performanceStats` - Domain/topic aggregates
- `readinessSnapshots` - Historical readiness scores

## Data Flow

1. **Question Generation**: Settings → LLM provider → `questionGenerator.ts` → validate → sanitize (strip difficulty prefix) → insert
2. **Exam Flow**: Create exam → shuffle questions → track responses → verify answers server-side → update stats
3. **Readiness Score**: Query `performanceStats` → calculate coverage/accuracy/recency/volume → cache 5min

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
feature/xxx  ──PR──►  uat  ──PR──►  main
bugfix/xxx   ──PR──►  uat  ──PR──►  main
```

1. Create branch from `uat`: `git checkout -b feature/xxx origin/uat`
2. Make changes and commit
3. Create PR to `uat` (CI runs, review)
4. After merge to `uat`, create PR from `uat` to `main` for production
5. After `uat→main` merge, sync back: PR from `main` to `uat`

**Branch naming**: `feature/<name>`, `bugfix/<name>`, `hotfix/<name>`

**Never**:
- Merge feature/bugfix branches directly to `main`
- Commit directly to `uat` or `main`
- Force-push to `uat` or `main`
