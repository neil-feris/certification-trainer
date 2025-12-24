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

# Build
npm run build            # Build shared → server → client (order matters)

# Individual package builds
npm run build -w @ace-prep/shared   # Must build first
npm run build -w @ace-prep/server
npm run build -w @ace-prep/client
```

## Architecture

Monorepo with npm workspaces: `packages/{client,server,shared}`

### Client (`@ace-prep/client`)
- React 18 + Vite + TypeScript
- **State**: Zustand stores (`examStore`, `studyStore`, `settingsStore`)
- **Data fetching**: TanStack Query
- **Routes**: `/dashboard`, `/exam`, `/exam/:id`, `/exam/:id/review`, `/study`, `/review`, `/settings`
- **Styling**: CSS Modules + CSS Variables
- **Charts**: Recharts for progress visualization

### Server (`@ace-prep/server`)
- Fastify with CORS configured for localhost:5173
- Drizzle ORM + better-sqlite3 (database at `data/ace-prep.db`)
- **Routes**: `routes/{exams,questions,progress,study,settings}.ts`
- **LLM**: `services/questionGenerator.ts` - Claude 3.5 Sonnet or GPT-4o

### Shared (`@ace-prep/shared`)
- TypeScript types for API contracts
- Must build first before other packages

## Database Schema

Key tables in `packages/server/src/db/schema.ts`:
- `domains` - 5 ACE exam domains with percentage weights
- `topics` - 23 topics linked to domains
- `questions` - Question bank (JSON `options`/`correctAnswers` fields)
- `exams` / `examResponses` - Full exam tracking
- `studySessions` / `studySessionResponses` - Topic practice sessions
- `spacedRepetition` - SM-2 algorithm for review scheduling
- `learningPathProgress` - Learning path completion tracking
- `performanceStats` - Domain/topic performance aggregates
- `settings` - API keys (`llmProvider`, `anthropicApiKey`, `openaiApiKey`)

## Data Flow

1. **Question Generation**: Settings → LLM provider → `questionGenerator.ts` → validate → insert to `questions`
2. **Exam Flow**: Create exam → shuffle questions → track responses → calculate score → update stats
3. **Spaced Repetition**: Wrong answers → SM-2 calculation → schedule in `spacedRepetition` → surface in Review page
