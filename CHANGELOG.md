# Changelog

All notable changes to the ACE Exam Prep application are documented in this file.

## [Unreleased]

### Added

#### Timed Domain Drills
- New quick-fire practice mode for focused domain study
- Configurable drill settings: 5/10/15/20 questions, 1/2/5/10 minute timers
- "Weak Areas" mode targets domains below 70% accuracy
- Immediate feedback after each answer
- Drill summary with time-per-question stats
- Incorrect answers automatically added to spaced repetition queue
- Session recovery for interrupted drills

#### Exam Resume Modal
- Detects incomplete exams on navigation
- Shows progress (questions answered, time remaining)
- Options to resume or start fresh
- Abandoned exams properly tracked in database

#### Keyboard Navigation for Exams
- `1-9` - Select answer option by index
- `Arrow Left/Up` - Previous question
- `Arrow Right/Down` - Next question
- `F` - Flag/unflag current question
- `Enter` - Next question or submit on last
- `Escape` - Open submit dialog or close modals
- `?` - Toggle keyboard shortcuts overlay

#### Question Deduplication
- Jaccard similarity detection (70% threshold)
- Prevents LLM from generating near-duplicate questions
- Checks both existing questions and within-batch duplicates
- Logging for skipped duplicates

#### API Pagination
- GET `/questions` now supports `limit` (default 50, max 200) and `offset` params
- Returns `PaginatedResponse<T>` with `items`, `total`, `hasMore`
- New `questionApi.getCount()` for efficient count-only queries

#### Unit Testing
- Vitest test framework configured
- 164 tests across 4 test suites:
  - `spacedRepetition.test.ts` - SM-2 algorithm (35 tests)
  - `scoring.test.ts` - Exam scoring logic (37 tests)
  - `schemas.test.ts` - Zod validation (68 tests)
  - `similarity.test.ts` - Deduplication (24 tests)
- New `npm run test` and `npm run test:coverage` scripts

#### Error Boundaries
- `ErrorBoundary` component for global crash isolation
- `RouteErrorBoundary` for route-specific error handling
- Retry and navigation options on error screens

### Changed

#### Security Improvements
- API keys no longer exposed in Settings UI (now shows "configured" status)
- Server returns `hasOpenaiKey` / `hasAnthropicKey` booleans instead of masked keys
- Rate limiting on LLM endpoints:
  - Question generation: 5 requests/minute
  - Study sessions: 20 requests/minute
  - Drills: 20 requests/minute

#### Performance Optimizations
- Dashboard queries rewritten to use SQL aggregations
- Reduced from O(n) queries to 4 fixed queries for stats
- Domain performance calculated in single GROUP BY query
- Recent activity optimized with LIMIT clause

#### Code Quality
- Zod validation schemas for all API request bodies
- Centralized validation in `validation/schemas.ts`
- Type-safe API responses using shared types
- Extracted scoring utilities to `utils/scoring.ts`

### Fixed

- N+1 query problem in dashboard/progress endpoints
- Timer not accounting for browser close (now uses localStorage)
- Settings page showing masked API key characters

## [1.0.0] - Initial Release

### Features
- Full exam simulation with 50-question tests
- 5 ACE exam domains with weighted question distribution
- LLM-powered question generation (Claude/GPT-4)
- Spaced repetition review system (SM-2 algorithm)
- Study sessions with topic-focused practice
- Learning path progress tracking
- Performance analytics dashboard
- Dark theme UI
