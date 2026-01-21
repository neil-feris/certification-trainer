# Repository Guidelines

## Project Structure & Module Organization
- Monorepo with npm workspaces under `packages/`.
- `packages/client/` contains the React + Vite frontend (components, stores, API client, styles).
- `packages/server/` contains the Fastify API, Drizzle schema/migrations, and services.
- `packages/shared/` contains shared TypeScript types.
- `data/` stores the local SQLite database (`data/ace-prep.db`, gitignored).

## Architecture Overview
- Client uses Zustand stores (`examStore`, `studyStore`, `settingsStore`, `certificationStore`) and TanStack Query for data fetching.
- Server exposes REST routes in `packages/server/src/routes/` and integrates LLM providers in `services/questionGenerator.ts`.
- Shared types in `packages/shared/` define API contracts used by both client and server.

## Build, Test, and Development Commands
- `npm run dev` starts client (5173) and server (3001) concurrently.
- `npm run dev:client` / `npm run dev:server` run each side independently.
- `npm run build` builds shared → server → client in order.
- `npm run db:setup` initializes and seeds the SQLite database.
- `npm run db:migrate` runs pending migrations.
- `npm run db:seed` seeds data without recreating tables.
- `npm run lint` runs ESLint across `packages/*/src`.
- `npm run format` formats with Prettier.

## Coding Style & Naming Conventions
- TypeScript across client, server, and shared packages.
- Prettier settings: 2-space indentation, single quotes (CSS uses double), 100 char width.
- ESLint rules enforce unused var patterns (`^_`), warn on `any`, and restrict `console` to `warn`/`error`.
- Test files use `*.test.ts` / `*.spec.ts` naming.

## Testing Guidelines
- Framework: Vitest (server package).
- Run all tests with `npm run test` or watch with `npm run test:watch`.
- Coverage: `npm run test:coverage` when verifying changes in core logic.

## Commit & Pull Request Guidelines
- Use Conventional Commit prefixes seen in history: `feat:`, `fix:`, `docs:`.
- Keep commits scoped and descriptive (e.g., `feat: add multi-certification support`).
- PRs should include a clear description, linked issues (if any), and UI screenshots for frontend changes.
- Note any database or migration steps in the PR description.

## Configuration Tips
- API keys are configured in-app under Settings (Anthropic/OpenAI).
- Database lives in `data/`; avoid committing local DB artifacts.
