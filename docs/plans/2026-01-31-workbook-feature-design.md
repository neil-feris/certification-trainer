# Workbook Feature Design

> Official Google Questions Integration with Guided Learning & Readiness Tracking

## Overview

Integrate the 41 official Google ACE workbook questions into a dedicated learning experience with:
- Sequential guided study with rich feedback
- Multiple assessment modes (quick quiz, full exam)
- Mastery tracking integrated into readiness score
- Learning resource links (courses, docs, skill badges)

## Entry Points

- **Primary**: New "Workbook" tab in Study Hub (between Drills and Flashcards)
- **Secondary**: "Official Questions" card in Practice/Domains tab linking to Workbook

## Data Model

### New Table: `workbookProgress`

```typescript
{
  id: integer,
  visitorId: text,               // FK to visitors
  questionId: integer,           // FK to questions where source='workbook'
  firstAttemptCorrect: boolean,  // null until attempted
  attempts: integer,             // total attempts
  lastAttemptCorrect: boolean,
  masteryLevel: 'unattempted' | 'needs_work' | 'learned' | 'mastered',
  firstAttemptAt: timestamp,
  lastAttemptAt: timestamp
}
```

### Mastery Level Rules

| Level | Condition |
|-------|-----------|
| `mastered` | Correct on first attempt |
| `learned` | Incorrect first, correct on retry |
| `needs_work` | Last attempt incorrect |
| `unattempted` | Never answered |

### Resource Schema Extension

```typescript
// Per-domain learning resources (extracted from workbook PDF)
{
  domainCode: string,
  courses: [
    { name: string, module: string }  // e.g., "Core Infrastructure", "M2"
  ],
  skillBadges: string[],
  documentationLinks: [
    { title: string, url: string }
  ]
}
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/workbook/progress` | All 41 questions with user progress |
| POST | `/api/workbook/answer` | Submit answer, returns feedback, updates progress |
| POST | `/api/workbook/reset` | Clear progress for full retest |
| GET | `/api/workbook/assessment?count=15` | Random questions for quick test |

## UI Components

### WorkbookHub (Main Container)

Three sub-tabs:
1. **Guided Study** - Sequential 1→41 walkthrough
2. **Quick Assessment** - Random 10-15 questions, timed
3. **Full Exam** - All 41, randomized, timed

Progress overview card shows:
- X/41 completed with mastery breakdown
- Per-domain progress bars
- Comparison benchmark vs generated questions

### Guided Study Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Question 12 of 41                      [▓▓▓▓▓▓░░░░░░] 29% │
│  Section 5.1: Managing IAM                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You need to configure access to Spanner from the GKE      │
│  cluster that is supporting Cymbal Superstore's ecommerce  │
│  microservices application...                               │
│                                                             │
│  ○ A. Assign permissions to a Google account               │
│  ○ B. Assign permissions through Google Workspace          │
│  ● C. Assign permissions through service account           │
│  ○ D. Assign permissions through Cloud Identity            │
│                                                             │
│                                        [Check Answer]       │
└─────────────────────────────────────────────────────────────┘
```

### Feedback Panel (Post-Answer)

```
┌─────────────────────────────────────────────────────────────┐
│  ✓ Correct!                                                │
├─────────────────────────────────────────────────────────────┤
│  Your answer: C                                             │
│  Correct: C - Service account referenced by the application │
├─────────────────────────────────────────────────────────────┤
│  Explanation:                                               │
│  Service accounts are the recommended way to authenticate   │
│  applications running on GCP to other GCP services. Unlike  │
│  user accounts, service accounts are not tied to individual │
│  people and can be used by applications...                  │
├─────────────────────────────────────────────────────────────┤
│  GCP Services: IAM, GKE, Spanner                           │
├─────────────────────────────────────────────────────────────┤
│  📚 Learn More:                                             │
│  • Authenticating as a service account (docs)               │
│  • Google Cloud Fundamentals: Core Infrastructure - M2      │
│  • Architecting with Google Compute Engine - M4             │
│  • Skill Badge: Develop your Google Cloud Network           │
└─────────────────────────────────────────────────────────────┘
```

### Quick Assessment Mode

- 10-15 random questions (configurable)
- 1.5 minutes per question timer
- Weights toward non-mastered questions
- Separate from guided study (doesn't affect mastery)
- End screen: score + comparison to previous attempts

### Full Exam Mode

- All 41 questions, randomized order
- 60-minute timer
- Requires "Reset Progress" confirmation
- Results: overall score, per-domain breakdown, time analysis
- Records attempt history for trend tracking

## Readiness Score Integration

### Weight Adjustment

```typescript
// Add to readiness calculation
const workbookFactor = {
  weight: 0.20,  // 20% of total readiness score
  value: (masteredCount / 41) * 100
};
```

### Benchmark Comparison

```typescript
const benchmark = {
  workbookAccuracy: number,    // % on official questions
  generatedAccuracy: number,   // % on AI-generated
  delta: number,               // difference
  interpretation: string       // contextual message
};
```

Positive delta (workbook > generated) = strong readiness indicator.

## Dashboard Widget

```
┌──────────────────────────────────────┐
│ 📘 Official Questions                │
│ 18/41 Mastered                       │
│ [▓▓▓▓▓▓▓▓░░░░] 44%                  │
│                                      │
│ vs Generated: +13% better accuracy   │
│ [Continue Workbook →]                │
└──────────────────────────────────────┘
```

## File Structure

```
packages/server/
├── src/
│   ├── db/
│   │   └── schema.ts                    # Add workbookProgress table
│   ├── routes/
│   │   └── workbook.ts                  # New route file
│   └── services/
│       └── workbookService.ts           # Progress, assessment logic

packages/client/
├── src/
│   ├── api/
│   │   └── client.ts                    # Add workbookApi methods
│   ├── components/
│   │   └── study/
│   │       └── workbook/
│   │           ├── WorkbookHub.tsx      # Main container
│   │           ├── WorkbookProgress.tsx # Progress card
│   │           ├── GuidedStudy.tsx      # Sequential flow
│   │           ├── WorkbookQuestion.tsx # Question display
│   │           ├── FeedbackPanel.tsx    # Rich explanation
│   │           ├── QuickAssessment.tsx  # Timed quiz
│   │           ├── FullExam.tsx         # Full 41-question test
│   │           └── WorkbookHub.module.css
│   ├── stores/
│   │   └── workbookStore.ts             # Zustand state
│   └── components/
│       └── dashboard/
│           └── WorkbookWidget.tsx       # Dashboard card
```

## Implementation Phases

| Phase | Scope | Deliverables |
|-------|-------|--------------|
| **1** | Foundation | Schema migration, API endpoints, basic WorkbookHub with progress |
| **2** | Guided Study | Sequential flow, feedback panel, mastery tracking |
| **3** | Assessments | Quick assessment + full exam modes with timing |
| **4** | Integration | Readiness score weighting, dashboard widget, benchmark |
| **5** | Resources | Extract course/doc links from PDF, enhance feedback panel |

## Dependencies

- Workbook questions already imported via `0021_add_workbook_questions.ts`
- Existing visitor/session authentication
- Existing readinessService for score integration
