# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start client (5173) + server (3001) concurrently
npm run dev:server       # Server only
npm run dev:client       # Client only

# Database
npm run db:setup         # Create tables + seed (domains, topics, sample questions)
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Run migrations
npm run db:seed          # Seed data only

# Build
npm run build            # Build shared → server → client (order matters)
```

## Architecture

Monorepo with npm workspaces: `packages/{client,server,shared}`

### Client (`@ace-prep/client`)
- React 18 + Vite + TypeScript
- Zustand for state (stores/), TanStack Query for data fetching
- Routes: `/dashboard`, `/exam`, `/exam/:id`, `/exam/:id/review`, `/study`, `/settings`
- CSS Modules + CSS Variables for styling

### Server (`@ace-prep/server`)
- Fastify with CORS configured for localhost:5173
- Drizzle ORM + better-sqlite3 (database at `data/ace-prep.db`)
- Routes: exams, questions, progress, study, settings
- LLM integration: `services/questionGenerator.ts` supports both Anthropic Claude and OpenAI GPT-4o

### Shared (`@ace-prep/shared`)
- TypeScript types for API contracts between client/server
- Must build first (`npm run build -w @ace-prep/shared`) before other packages

## Database Schema

Key tables in `packages/server/src/db/schema.ts`:
- `domains` - 5 ACE exam domains with weights
- `topics` - 23 topics linked to domains
- `questions` - Question bank with JSON options/correctAnswers
- `exams` / `examResponses` - Exam tracking
- `spacedRepetition` - SM-2 algorithm data
- `settings` - API keys and config

## LLM Question Generation

`questionGenerator.ts` generates ACE-style questions. Supports switching between providers via Settings page. Questions are validated for structure before insertion.
