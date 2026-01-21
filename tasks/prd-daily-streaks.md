# PRD: Daily Study Streaks

## Introduction

Track consecutive days of study activity to drive daily engagement. Display current streak prominently on dashboard and in the nav bar. Celebrate milestones with toast notifications. Studies show 89% of students report higher motivation with gamification elements like streaks.

## Goals

- Track consecutive days where user completes any study activity
- Display current streak and longest streak on dashboard
- Show streak in nav bar for constant visibility
- Celebrate milestone achievements (7, 30, 100 days) with toast notifications
- Persist streak data server-side for cross-device sync

## Non-Goals

- Streak freeze/grace period (future iteration)
- Streak leaderboards (separate feature)
- XP rewards for streaks (separate FEAT-002)
- Retroactive streak calculation from historical data (start fresh)

## User Stories

### US-001: Shared Streak Types
**Description:** As a developer, I need TypeScript types for streak data so frontend and backend share contracts.

**Acceptance Criteria:**
- [ ] `UserStreak` type with `currentStreak`, `longestStreak`, `lastActivityDate`
- [ ] `StreakMilestone` type for milestone definitions
- [ ] Export from `@ace-prep/shared`
- [ ] Typecheck passes

---

### US-002: Database Schema for Streaks
**Description:** As a developer, I need a database table to persist user streak data.

**Acceptance Criteria:**
- [ ] `userStreaks` table with: `id`, `userId`, `currentStreak`, `longestStreak`, `lastActivityDate`, `updatedAt`
- [ ] Unique index on `userId`
- [ ] Foreign key to `users` table with cascade delete
- [ ] Migration file created
- [ ] `npm run db:migrate` succeeds
- [ ] Typecheck passes

---

### US-003: Streak Service Logic
**Description:** As a developer, I need a service to calculate and update streaks when activities occur.

**Acceptance Criteria:**
- [ ] `updateStreak(userId: number)` function in `services/streakService.ts`
- [ ] Creates streak record if not exists (initializes to 1)
- [ ] Increments streak if last activity was yesterday
- [ ] Resets streak to 1 if last activity was 2+ days ago
- [ ] Maintains streak if activity already recorded today
- [ ] Updates `longestStreak` when `currentStreak` exceeds it
- [ ] Returns updated streak data and whether milestone was hit
- [ ] Uses date-only comparison (YYYY-MM-DD) for timezone safety
- [ ] Typecheck passes

---

### US-004: Streak API Endpoint
**Description:** As a user, I need an API endpoint to fetch my current streak data.

**Acceptance Criteria:**
- [ ] `GET /api/progress/streak` returns `UserStreak` data
- [ ] Returns `{ currentStreak: 0, longestStreak: 0, lastActivityDate: null }` if no record
- [ ] Requires authentication
- [ ] Typecheck passes

---

### US-005: Trigger Streak Update on Exam Completion
**Description:** As a user, when I complete an exam my streak should update.

**Acceptance Criteria:**
- [ ] `PATCH /api/exams/:id/complete` calls `updateStreak(userId)`
- [ ] Streak updated within same transaction
- [ ] Response includes `streakUpdate?: { current: number, milestone?: number }`
- [ ] Typecheck passes

---

### US-006: Trigger Streak Update on Study Session Completion
**Description:** As a user, when I complete a study session my streak should update.

**Acceptance Criteria:**
- [ ] `PATCH /api/study/sessions/:id/complete` calls `updateStreak(userId)`
- [ ] Streak updated within same transaction
- [ ] Response includes `streakUpdate?: { current: number, milestone?: number }`
- [ ] Typecheck passes

---

### US-007: Trigger Streak Update on Learning Path Completion
**Description:** As a user, when I complete a learning path item my streak should update.

**Acceptance Criteria:**
- [ ] `PATCH /api/study/learning-path/:order/complete` calls `updateStreak(userId)`
- [ ] Only triggers on completion (not on toggle-off)
- [ ] Response includes `streakUpdate?: { current: number, milestone?: number }`
- [ ] Typecheck passes

---

### US-008: Trigger Streak Update on Spaced Repetition Review
**Description:** As a user, when I complete a spaced repetition review my streak should update.

**Acceptance Criteria:**
- [ ] `POST /api/questions/review` calls `updateStreak(userId)`
- [ ] Response includes `streakUpdate?: { current: number, milestone?: number }`
- [ ] Typecheck passes

---

### US-009: Frontend API Client for Streaks
**Description:** As a frontend developer, I need API client methods to fetch streak data.

**Acceptance Criteria:**
- [ ] `progressApi.getStreak()` method returns `Promise<UserStreak>`
- [ ] Proper error handling
- [ ] Typecheck passes

---

### US-010: Streak Display Component
**Description:** As a user, I need a reusable component that displays my streak with a flame icon.

**Acceptance Criteria:**
- [ ] `StreakDisplay` component shows flame icon + current streak number
- [ ] Shows "🔥 X days" format
- [ ] Compact variant for nav bar (icon + number only)
- [ ] Full variant for dashboard (includes longest streak)
- [ ] Visual distinction when streak is 0 (gray/muted)
- [ ] CSS Module styling consistent with app
- [ ] Typecheck passes

---

### US-011: Streak Widget on Dashboard
**Description:** As a user, I want to see my streak prominently on the dashboard.

**Acceptance Criteria:**
- [ ] Streak card in dashboard stats grid
- [ ] Shows current streak with flame icon
- [ ] Shows "Longest: X days" below
- [ ] Fetches via `useQuery` with `['streak']` key
- [ ] Loading state while fetching
- [ ] Typecheck passes

---

### US-012: Streak Display in Navigation
**Description:** As a user, I want to see my streak in the nav bar so it's always visible.

**Acceptance Criteria:**
- [ ] Compact streak display in sidebar footer (desktop)
- [ ] Compact streak display in mobile nav header
- [ ] Updates when streak changes (query invalidation)
- [ ] Typecheck passes

---

### US-013: Milestone Toast Notifications
**Description:** As a user, when I hit a streak milestone I want to be celebrated with a toast.

**Acceptance Criteria:**
- [ ] Milestones: 7, 30, 100, 365 days
- [ ] Toast shows: "🔥 {N}-Day Streak!" with congratulatory message
- [ ] Toast auto-dismisses after 5 seconds
- [ ] Toast triggered when API response includes milestone
- [ ] Works on exam completion, study completion, learning path, SR review
- [ ] Typecheck passes

---

### US-014: Query Invalidation on Streak Update
**Description:** As a user, when my streak updates, all streak displays should refresh.

**Acceptance Criteria:**
- [ ] Activity completion mutations invalidate `['streak']` query
- [ ] Dashboard and nav both update without page refresh
- [ ] Typecheck passes

---

## Technical Considerations

**Discovered from codebase exploration:**

- **Database**: SQLite with Drizzle ORM. Use `integer` for counts, `text` for dates (YYYY-MM-DD format for timezone-safe comparison)
- **Auth**: All routes use `authenticate` middleware, access `request.user!.id`
- **Transactions**: Drizzle supports `db.transaction()` for atomic updates
- **State**: Use TanStack Query, not Zustand, for server-fetched streak data
- **API Client**: Extend `progressApi` in `packages/client/src/api/client.ts`
- **Dashboard**: Extend stats grid in `Dashboard.tsx`, data via `useQuery`
- **Toast**: Will need toast system - check if exists or add simple one

**Date handling:**
```typescript
// Get today's date in YYYY-MM-DD format (local timezone)
const today = new Date().toISOString().split('T')[0];

// Check if dates are consecutive
const isConsecutive = (lastDate: string, today: string) => {
  const last = new Date(lastDate);
  const now = new Date(today);
  const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays === 1;
};
```

**Files to modify/create:**

| Action | Path |
|--------|------|
| Add types | `packages/shared/src/index.ts` |
| Add schema | `packages/server/src/db/schema.ts` |
| Add migration | `packages/server/src/db/migrations/0007_add_user_streaks.sql` |
| Add service | `packages/server/src/services/streakService.ts` |
| Update routes | `packages/server/src/routes/progress.ts` |
| Update routes | `packages/server/src/routes/exams.ts` |
| Update routes | `packages/server/src/routes/study.ts` |
| Update routes | `packages/server/src/routes/questions.ts` |
| Update API client | `packages/client/src/api/client.ts` |
| Add component | `packages/client/src/components/common/StreakDisplay.tsx` |
| Add styles | `packages/client/src/components/common/StreakDisplay.module.css` |
| Update dashboard | `packages/client/src/components/dashboard/Dashboard.tsx` |
| Update nav | `packages/client/src/components/layout/AppShell.tsx` |
| Add toast (if needed) | `packages/client/src/components/common/Toast.tsx` |
