# Feature Backlog

Use with: `/ralph-init <feature-id>` or `/ralph-init the next feature from tasks/feature-backlog.md`

**Last Updated**: 2026-01-29
**Status Legend**: `[ ]` Todo | `[~]` In Progress | `[x]` Done

---

## Phase 1: Engagement & Retention

### FEAT-001: Daily Study Streaks
- **Status**: `[x]`
- **Priority**: P0 (High Impact, Low Effort)
- **Category**: Gamification

**Description**: Track consecutive days of study activity. Display current streak on dashboard. Show streak freeze option (skip 1 day without breaking). Streaks drive daily engagement - 89% of students report higher motivation with gamification.

**Requirements**:
- Track last activity date per user
- Calculate current streak and longest streak
- Display streak counter prominently on dashboard
- Optional: streak freeze (1 free per week)
- Celebrate milestones (7 days, 30 days, 100 days)

**Technical Notes**:
- Add `user_streaks` table: `user_id, current_streak, longest_streak, last_activity_date, freeze_available`
- Update streak on any study activity (exam, practice, review, drill)
- Reset if `last_activity_date` is more than 1 day ago (unless freeze used)

---

### FEAT-002: XP & Leveling System
- **Status**: `[x]`
- **Priority**: P0 (High Impact, Low Effort)
- **Category**: Gamification

**Description**: Award experience points for study activities. Users level up and earn titles. Creates progression feel and rewards consistent effort.

**Requirements**:
- Award XP: answer question (+5), complete exam (+50), perfect exam (+100), review card (+3), complete drill (+20)
- Level thresholds: 0-100 (Novice), 100-500 (Apprentice), 500-1500 (Practitioner), 1500-4000 (Expert), 4000+ (Master)
- Display current level, XP, and progress to next level on dashboard
- Show level badge next to username

**Technical Notes**:
- Add `user_xp` table: `user_id, total_xp, current_level`
- Create XP award service called from exam/study/review handlers
- Level calculation is pure function of total XP

---

### FEAT-003: Achievement Badges
- **Status**: `[x]`
- **Priority**: P1 (High Impact, Medium Effort)
- **Category**: Gamification

**Description**: Award badges for milestones and accomplishments. Visual recognition of progress. Displayed on profile and shareable.

**Requirements**:
- Initial badges (10-15):
  - "First Steps" - Complete first exam
  - "Perfect Score" - 100% on any exam
  - "Consistent" - 7-day streak
  - "Dedicated" - 30-day streak
  - "Domain Expert: [Domain]" - 90%+ accuracy in domain (5+ attempts)
  - "Speed Demon" - Complete timed drill with 100%
  - "Night Owl" - Study after 10pm
  - "Early Bird" - Study before 7am
  - "Completionist" - Finish all learning path items
  - "Reviewer" - Review 100 spaced repetition cards
- Badge gallery page showing earned and locked badges
- Toast notification when badge unlocked

**Technical Notes**:
- Add `achievements` table: `code, name, description, icon, criteria_json`
- Add `user_achievements` table: `user_id, achievement_code, unlocked_at`
- Achievement checker service runs after relevant activities
- Criteria can be: streak count, exam score, domain accuracy, time of day, etc.

---

### FEAT-004: Notes & Bookmarks
- **Status**: `[x]`
- **Priority**: P0 (High Impact, Low Effort)
- **Category**: Study Tools

**Description**: Let users bookmark questions for later review and add personal notes. Essential study feature missing vs all competitors.

**Requirements**:
- Bookmark icon on every question (filled = bookmarked)
- Notes textarea on question detail (auto-save)
- "Bookmarked Questions" filter in Question Bank
- "My Notes" page listing all annotated questions
- Notes sync across devices

**Technical Notes**:
- Add `user_bookmarks` table: `user_id, question_id, created_at`
- Add `user_notes` table: `user_id, question_id, note_text, updated_at`
- Add bookmark/note endpoints to questions routes
- Add filter param to questions list endpoint

---

### FEAT-005: Question of the Day
- **Status**: `[x]`
- **Priority**: P1 (Medium Impact, Low Effort)
- **Category**: Engagement

**Description**: Surface one random question daily. Drives daily app opens without requiring full study session. Can optionally push via notification.

**Requirements**:
- Dashboard widget showing "Question of the Day"
- Same question for all users each day (or per-certification)
- Quick answer inline, shows explanation after
- Track if user answered today's question
- Optional: email digest with QOTD

**Technical Notes**:
- Deterministic question selection: `questionId = (dateHash % totalQuestions)`
- Add `qotd_responses` table or flag on regular responses
- Dashboard component fetches QOTD endpoint

---

### FEAT-006: Flashcard Mode
- **Status**: `[x]`
- **Priority**: P0 (High Impact, Low Effort)
- **Category**: Study Tools

**Description**: Convert questions into flashcard format. Show question on front, answer + explanation on back. Swipe or keyboard navigation.

**Requirements**:
- New study mode: "Flashcards" tab in Study Hub
- Select topic/domain or use bookmarked questions
- Card shows question text, tap/click to flip
- Back shows correct answer(s) highlighted + explanation
- Swipe left (hard) / right (easy) or keyboard arrows
- Integrates with spaced repetition ratings

**Technical Notes**:
- Reuse existing question data, just different UI
- FlashcardSession component with flip animation
- Can piggyback on existing SR rating system

---

## Phase 2: Feature Parity & Intelligence

### FEAT-007: Exam Readiness Score
- **Status**: `[x]`
- **Priority**: P0 (High Impact, Medium Effort)
- **Category**: Analytics

**Description**: Predict likelihood of passing the real exam based on practice performance. Shows which domains need more work.

**Requirements**:
- Calculate readiness score (0-100%) based on:
  - Domain coverage (have you practiced all domains?)
  - Domain accuracy (weighted by exam weight %)
  - Recency (recent practice weighted higher)
  - Volume (minimum attempts threshold)
- Display on dashboard with breakdown
- "You're X% ready for the exam"
- Recommendations: "Focus on [Domain] to improve score"

**Technical Notes**:
- Algorithm weights: coverage (20%), accuracy (50%), recency (20%), volume (10%)
- Decay function for recency: `e^(-days/30)`
- Threshold: need 10+ questions per domain for confidence
- Endpoint: `GET /api/progress/readiness`

---

### FEAT-008: Study Plan Generator
- **Status**: `[x]`
- **Priority**: P1 (High Impact, Medium Effort)
- **Category**: Study Tools

**Description**: Generate personalized study schedule based on exam date and current readiness. "I have 4 weeks until my exam" → daily tasks.

**Requirements**:
- Input: target exam date
- Output: day-by-day study plan
- Allocate time to domains based on weight and current weakness
- Include: learning path items, practice questions, drills, reviews
- Adjusts as user progresses (dynamic replanning)
- Calendar view or daily checklist

**Technical Notes**:
- Use readiness score per domain to prioritize weak areas
- Distribute learning path items across early days
- Increase practice intensity closer to exam date
- Store plan in `study_plans` table with daily breakdown
- Can use LLM for natural language plan description

---

### FEAT-009: Share Exam Results
- **Status**: `[x]`
- **Priority**: P2 (Medium Impact, Low Effort)
- **Category**: Social/Growth

**Description**: Let users share practice exam results to social media. Viral growth driver and sense of accomplishment.

**Requirements**:
- "Share Results" button on exam completion screen
- Generate shareable image/card with:
  - Score percentage
  - Certification name
  - Domain breakdown (optional)
  - App branding
- Share to: Twitter/X, LinkedIn, copy link
- Optional: public results page with unique URL

**Technical Notes**:
- Server-side image generation (canvas/sharp) or client-side html2canvas
- Share URL: `/share/exam/{examId}` with OG meta tags
- Twitter Card / LinkedIn preview support

---

### FEAT-010: Completion Certificates
- **Status**: `[x]`
- **Priority**: P2 (Medium Impact, Low Effort)
- **Category**: Social/Growth

**Description**: Generate printable/shareable certificates for practice exam completion. Users love displaying accomplishments.

**Requirements**:
- Certificate generated for exams with 70%+ score
- Includes: user name, certification, score, date, unique ID
- PDF download option
- Shareable link with verification
- Professional design with app branding

**Technical Notes**:
- PDF generation: `pdfkit` or `puppeteer` with HTML template
- Certificate ID for verification: hash of `examId + score + date`
- Store in `certificates` table for verification endpoint

---

### FEAT-011: Question Quality Feedback
- **Status**: `[x]`
- **Priority**: P2 (Medium Impact, Low Effort)
- **Category**: Content

**Description**: Let users rate question quality. "Was this question helpful?" Improves content over time.

**Requirements**:
- Thumbs up/down on question after answering
- Optional: report issue (wrong answer, unclear, outdated)
- Track ratings per question
- Admin view of poorly-rated questions
- Auto-flag questions below threshold for review

**Technical Notes**:
- Add `question_feedback` table: `user_id, question_id, rating, issue_type, comment, created_at`
- Add feedback endpoint to questions routes
- Aggregate rating on questions table or materialized view

---

## Phase 3: PWA & Offline

### FEAT-012: Complete PWA Offline Mode
- **Status**: `[~]`
- **Priority**: P1 (High Impact, Medium Effort)
- **Category**: Mobile/Offline

**Description**: Full offline support - take exams offline, auto-sync when back online. Currently partial (caches questions but can't complete exams offline).

**Requirements**:
- Pre-cache questions for selected certification/topics
- Full exam flow works offline (stored locally, synced later)
- Background sync when connectivity restored
- Clear offline indicator in UI
- Push notifications for review reminders (with permission)

**Technical Notes**:
- Implement Background Sync API for queue flush
- Expand `syncQueue.ts` to handle full exam submissions
- Add service worker push notification handlers
- PWA install prompt handling
- Pre-cache strategy: on certification select, cache 100 questions

---

### FEAT-013: Push Notifications
- **Status**: `[ ]`
- **Priority**: P2 (Medium Impact, Medium Effort)
- **Category**: Engagement

**Description**: Browser push notifications for review reminders, streak warnings, and daily questions.

**Requirements**:
- Permission request flow (non-intrusive)
- Notification types:
  - "You have X cards due for review"
  - "Don't break your streak! Study today"
  - "Question of the Day is ready"
- User preference to enable/disable each type
- Works when app not open (service worker)

**Technical Notes**:
- Web Push API with service worker
- Store push subscriptions in `push_subscriptions` table
- Server-side push via `web-push` npm package
- Scheduled job for daily notifications

---

## Phase 4: Analytics & Insights

### FEAT-014: Study Time Tracking
- **Status**: `[~]`
- **Priority**: P2 (Medium Impact, Low Effort)
- **Category**: Analytics

**Description**: Track time spent studying. Show daily/weekly totals, study heatmap by time of day.

**Partial Implementation**: `timeSpentSeconds` tracked on exam/drill responses. Missing: dashboard widget, aggregation, heatmap.

**Requirements**:
- Track session duration (already have `timeSpentSeconds` on responses)
- Aggregate into daily/weekly totals
- Dashboard widget: "X hours studied this week"
- Heatmap: study activity by day of week / hour
- Progress over time chart

**Technical Notes**:
- Already tracking time per response - aggregate in `performanceStats` or new `study_time` table
- Heatmap data: `SELECT hour, day_of_week, SUM(time)` grouped

---

### FEAT-015: GCP Service Mastery Map
- **Status**: `[ ]`
- **Priority**: P2 (Medium Impact, Medium Effort)
- **Category**: Analytics

**Description**: Visual grid of all GCP services showing mastery level for each. Unique differentiator vs competitors.

**Requirements**:
- Grid/map of GCP services organized by category
- Color-coded by mastery: gray (not attempted), red (<50%), yellow (50-80%), green (>80%)
- Click to see questions for that service
- Filter by certification (PCA vs ACE topics differ)

**Technical Notes**:
- Requires tagging questions with GCP service (new field or derived from topic)
- Service list: Compute Engine, GKE, Cloud Run, BigQuery, Pub/Sub, etc.
- Aggregate accuracy per service from responses

---

### FEAT-016: Performance Comparison (Peer Benchmarking)
- **Status**: `[ ]`
- **Priority**: P3 (Lower Impact, Medium Effort)
- **Category**: Analytics

**Description**: Show how user compares to other learners. "You're in the top 20% for Networking."

**Requirements**:
- Aggregate anonymized stats across all users
- Percentile rank per domain
- Overall percentile rank
- Opt-in only (privacy)

**Technical Notes**:
- Background job calculates percentiles periodically
- Store in `benchmark_stats` table
- Requires minimum user base for meaningful comparison

---

## Phase 5: Social & Community

### FEAT-017: Leaderboards
- **Status**: `[ ]`
- **Priority**: P3 (Medium Impact, Medium Effort)
- **Category**: Social

**Description**: Weekly/monthly rankings for XP earned. Opt-in competitive motivation.

**Requirements**:
- Weekly leaderboard: top 50 by XP earned this week
- Monthly leaderboard: top 50 by XP earned this month
- All-time leaderboard: top 50 by total XP
- Opt-in: users choose to appear or stay anonymous
- Show user's rank even if not in top 50

**Technical Notes**:
- Leaderboard calculation: aggregate XP by time period
- Cache leaderboard, refresh hourly
- `leaderboard_opt_in` flag on users table

---

### FEAT-018: Challenge a Friend
- **Status**: `[ ]`
- **Priority**: P3 (Medium Impact, High Effort)
- **Category**: Social

**Description**: Create a challenge with same question set, invite friend via link, compare scores.

**Requirements**:
- Create challenge: select question count, topics
- Generate shareable invite link
- Friend takes same questions (order randomized)
- Compare results side-by-side
- Challenge history

**Technical Notes**:
- `challenges` table: creator, question_ids, settings
- `challenge_participants` table: user, challenge, score, completed_at
- Invite via unique code/link

---

### FEAT-019: Question Discussions
- **Status**: `[ ]`
- **Priority**: P3 (Lower Impact, High Effort)
- **Category**: Community

**Description**: Comment threads on questions. Community explanations and discussion.

**Requirements**:
- Comments section below each question
- Upvote/downvote comments
- Report inappropriate comments
- Sort by: newest, top-voted
- Notify when someone replies

**Technical Notes**:
- `question_comments` table with nested replies
- `comment_votes` table for up/downvotes
- Moderation queue for reported comments

---

## Phase 6: Operational & Technical

### FEAT-020: Error Tracking (Sentry)
- **Status**: `[x]`
- **Priority**: P0 (Critical for Production)
- **Category**: Operations

**Description**: Integrate Sentry for error tracking on frontend and backend. Currently blind to production errors.

**Requirements**:
- Capture uncaught exceptions (client + server)
- Capture console.error
- User context attached to errors
- Source maps for readable stack traces
- Performance monitoring (Core Web Vitals)

**Technical Notes**:
- `@sentry/react` for client with ErrorBoundary
- `@sentry/node` for Fastify server
- Environment-based DSN configuration
- Upload source maps in build step

---

### FEAT-021: Data Import
- **Status**: `[ ]`
- **Priority**: P2 (Complete existing feature)
- **Category**: Technical Debt

**Description**: Export exists but import returns 501 Not Implemented. Complete the data portability cycle.

**Requirements**:
- Import JSON file matching export format
- Validate data structure
- Handle conflicts (merge vs overwrite option)
- Progress indicator for large imports
- Rollback on failure

**Technical Notes**:
- `POST /api/progress/import` currently stubbed
- Validate against Zod schema
- Transaction wrap for atomicity
- Consider: import from other platforms (Anki, Quizlet)

---

### FEAT-022: Admin Dashboard
- **Status**: `[ ]`
- **Priority**: P3 (Future)
- **Category**: Operations

**Description**: Admin interface for content management, user management, and analytics.

**Requirements**:
- Question review queue (flagged, low-rated)
- User management (view, disable)
- Content stats (questions per topic, coverage gaps)
- LLM usage analytics
- System health dashboard

**Technical Notes**:
- Separate admin routes with role check
- Could be separate SPA or integrated with role-based nav
- Requires admin role on users table

---

## Backlog Summary

| Status | Count | Features |
|--------|-------|----------|
| **Done** | 12 | FEAT-001-011, FEAT-020 |
| **In Progress** | 2 | FEAT-012 (PWA), FEAT-014 (Time Tracking) |
| **Remaining** | 8 | FEAT-013, 015-019, 021-022 |

| Phase | Features | Status |
|-------|----------|--------|
| **1: Engagement** | FEAT-001 to FEAT-006 | ✅ Complete |
| **2: Intelligence** | FEAT-007 to FEAT-011 | ✅ Complete |
| **3: PWA/Offline** | FEAT-012 to FEAT-013 | 🔄 Partial (PWA in progress, Push not started) |
| **4: Analytics** | FEAT-014 to FEAT-016 | 🔄 Partial (Time tracking partial, others not started) |
| **5: Social** | FEAT-017 to FEAT-019 | ❌ Not started |
| **6: Technical** | FEAT-020 to FEAT-022 | 🔄 Partial (Sentry done, Import/Admin not started) |

**Recommended Next**: FEAT-012 (Complete PWA Offline) or FEAT-013 (Push Notifications) to finish Phase 3.
