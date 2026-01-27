# FEAT-011: Question Quality Feedback - Design Document

**Date**: 2026-01-26
**Status**: Approved
**Author**: Claude (with user input)

## Overview

Let users rate question quality with thumbs up/down and report specific issues. This feedback improves content over time by identifying problematic questions.

## Requirements Summary

- Thumbs up/down on questions after answering
- Report issue option with categories: wrong answer, unclear, outdated, other
- Optional comment field for issue reports
- One vote per user per question (changeable)
- Auto-flag questions with >30% thumbs down (min 5 votes) OR 3+ reports
- No admin view in this feature (deferred to FEAT-022)

## Data Model

### New Table: `question_feedback`

| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK, auto-increment |
| user_id | integer | FK → users (cascade delete), NOT NULL |
| question_id | integer | FK → questions (cascade delete), NOT NULL |
| rating | text | 'up' \| 'down', nullable (null if only reported) |
| created_at | timestamp | NOT NULL |
| updated_at | timestamp | NOT NULL |

**Indexes:**
- `UNIQUE(user_id, question_id)` - one feedback per user per question
- `INDEX(question_id)` - for aggregate queries

### New Table: `question_reports`

| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK, auto-increment |
| user_id | integer | FK → users (cascade delete), NOT NULL |
| question_id | integer | FK → questions (cascade delete), NOT NULL |
| issue_type | text | 'wrong_answer' \| 'unclear' \| 'outdated' \| 'other', NOT NULL |
| comment | text | nullable |
| status | text | 'pending' \| 'reviewed' \| 'resolved', default 'pending' |
| created_at | timestamp | NOT NULL |

**Indexes:**
- `UNIQUE(user_id, question_id)` - one report per user per question
- `INDEX(question_id)` - for aggregate queries
- `INDEX(status)` - for admin filtering (future)

### Existing Table: `questions` (new columns)

| Column | Type | Default |
|--------|------|---------|
| thumbs_up_count | integer | 0 |
| thumbs_down_count | integer | 0 |
| report_count | integer | 0 |
| is_flagged | boolean | false |

## API Endpoints

### POST /api/questions/:id/feedback

Submit or update rating for a question.

**Request:**
```json
{ "rating": "up" | "down" }
```

**Response:**
```json
{
  "success": true,
  "userRating": "up",
  "aggregates": {
    "thumbsUp": 42,
    "thumbsDown": 3,
    "isFlagged": false
  }
}
```

### DELETE /api/questions/:id/feedback

Remove user's rating.

**Response:**
```json
{
  "success": true,
  "aggregates": {
    "thumbsUp": 41,
    "thumbsDown": 3,
    "isFlagged": false
  }
}
```

### POST /api/questions/:id/report

Report an issue with a question.

**Request:**
```json
{
  "issueType": "wrong_answer" | "unclear" | "outdated" | "other",
  "comment": "Optional details about the issue"
}
```

**Response:**
```json
{
  "success": true,
  "aggregates": {
    "reportCount": 2,
    "isFlagged": false
  }
}
```

### GET /api/questions/:id/feedback

Get current user's feedback state.

**Response:**
```json
{
  "rating": "up" | "down" | null,
  "report": {
    "issueType": "unclear",
    "comment": "The wording is ambiguous"
  } | null
}
```

## Flagging Logic

```typescript
function shouldFlag(thumbsUp: number, thumbsDown: number, reportCount: number): boolean {
  const totalVotes = thumbsUp + thumbsDown;
  const thumbsDownRate = totalVotes >= 5 ? thumbsDown / totalVotes : 0;

  return thumbsDownRate > 0.30 || reportCount >= 3;
}
```

Recalculated after every rating or report change.

## UI Components

### QuestionFeedback

Small inline component shown after answer is revealed.

**Props:**
```typescript
interface QuestionFeedbackProps {
  questionId: number;
  className?: string;
}
```

**Behavior:**
- Shows thumbs up/down buttons + "Report issue" link
- Buttons show filled/outline state based on user's current vote
- Clicking same thumb again removes the vote (toggle)
- Clicking opposite thumb switches the vote

### ReportIssueModal

Modal for reporting issues.

**Props:**
```typescript
interface ReportIssueModalProps {
  questionId: number;
  isOpen: boolean;
  onClose: () => void;
  existingReport?: { issueType: string; comment?: string };
}
```

**Content:**
- Radio buttons for issue type
- Optional textarea for details
- Submit and Cancel buttons

## Integration Points

Add `<QuestionFeedback questionId={question.id} />` to:

1. **ExamReview.tsx** - Below explanation in each question item
2. **TopicPractice.tsx** - After revealing answer, below explanation
3. **FlashcardStudy.tsx** - On card back, after explanation
4. **Review.tsx** - Below question after SR rating

## Out of Scope

- Admin view for flagged questions (FEAT-022)
- Email notifications for flagged questions
- XP rewards for feedback
- Bulk feedback operations

## Implementation Order

1. Database schema changes (migration)
2. Server-side API endpoints
3. Shared types
4. Client components (QuestionFeedback, ReportIssueModal)
5. Integration into existing question views
6. Testing

## File Changes

**Server:**
- `packages/server/src/db/schema.ts` - Add tables and columns
- `packages/server/src/routes/questions.ts` - Add endpoints
- `packages/server/src/validation/schemas.ts` - Add Zod schemas

**Shared:**
- `packages/shared/src/types.ts` - Add TypeScript types

**Client:**
- `packages/client/src/components/common/QuestionFeedback.tsx` - New
- `packages/client/src/components/common/QuestionFeedback.module.css` - New
- `packages/client/src/components/common/ReportIssueModal.tsx` - New
- `packages/client/src/components/common/ReportIssueModal.module.css` - New
- `packages/client/src/api/client.ts` - Add API methods
- `packages/client/src/components/exam/ExamReview.tsx` - Integration
- `packages/client/src/components/study/practice/TopicPractice.tsx` - Integration
- `packages/client/src/components/study/flashcards/FlashcardStudy.tsx` - Integration
- `packages/client/src/components/review/Review.tsx` - Integration
