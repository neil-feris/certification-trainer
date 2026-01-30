# FEAT-014: Study Time Tracking - Design

**Date:** 2026-01-30
**Status:** Approved
**Priority:** P2

## Overview

Add a dedicated Study Activity section to the dashboard displaying:
1. Weekly study time total with week-over-week comparison
2. Activity heatmap (day of week × hour, last 4 weeks)
3. Progress chart (daily totals for 30 days, dual metric: time + questions)

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Study Activity                                             │
├─────────────────┬───────────────────────────────────────────┤
│  Weekly Total   │         Activity Heatmap                  │
│  ┌───────────┐  │    (Day of Week × Hour, Last 4 weeks)    │
│  │  12.5 hrs │  │                                           │
│  │  this week│  │   M  ░░▓▓░░░░░░░░▓▓▓░░░░░░░░░░░░        │
│  │  +2.3 hrs │  │   T  ░░░░░░░░░░░░▓▓░░░░░░░░░░░░░        │
│  │  vs last  │  │   W  ░░░░░░░░░░░░▓░░░░░░░░▓▓░░░░        │
│  └───────────┘  │      6am        12pm        6pm   10pm   │
├─────────────────┴───────────────────────────────────────────┤
│              Progress Chart (Last 30 Days)                  │
│   hrs │    ╭──╮      ╭─╮                        questions   │
│    4  │   ╱    ╲    ╱   ╲    ╭──╮                     100   │
│    2  │──╱      ╲──╱     ╲──╱    ╲──                   50   │
│        ── Study Time    ── Questions Answered               │
└─────────────────────────────────────────────────────────────┘
```

**Placement:** New section below stats grid, above XP History Panel.

## API Design

### Endpoint

`GET /api/progress/study-time`

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| certificationId | number | No | Filter by certification |

### Response

```typescript
interface StudyTimeResponse {
  // Weekly summary
  weeklyTotalSeconds: number;
  previousWeekTotalSeconds: number;

  // Heatmap data (last 4 weeks)
  heatmap: {
    dayOfWeek: number;  // 0=Sun, 6=Sat
    hour: number;       // 0-23
    totalSeconds: number;
    sessionCount: number;
  }[];

  // Daily chart data (last 30 days)
  daily: {
    date: string;           // "2026-01-15"
    totalSeconds: number;
    questionsAnswered: number;
  }[];
}
```

## Data Sources

Aggregate `timeSpentSeconds` from all activity types:

| Table | Time Field | Questions Field |
|-------|------------|-----------------|
| exams | timeSpentSeconds | totalQuestions |
| examResponses | timeSpentSeconds | 1 per row |
| studySessions | timeSpentSeconds | via responses |
| flashcardSessions | timeSpentSeconds | cardsReviewed |

**Note:** Use exam-level time (not per-response) to avoid double-counting.

## Database Queries

### Heatmap Query (Last 4 Weeks)

```sql
SELECT
  CAST(strftime('%w', datetime(completedAt, 'unixepoch')) AS INTEGER) as dayOfWeek,
  CAST(strftime('%H', datetime(completedAt, 'unixepoch')) AS INTEGER) as hour,
  SUM(timeSpentSeconds) as totalSeconds,
  COUNT(*) as sessionCount
FROM (
  SELECT completedAt, timeSpentSeconds
  FROM exams
  WHERE userId = ? AND completedAt > ? AND timeSpentSeconds IS NOT NULL
  UNION ALL
  SELECT completedAt, timeSpentSeconds
  FROM study_sessions
  WHERE userId = ? AND completedAt > ? AND timeSpentSeconds IS NOT NULL
  UNION ALL
  SELECT completedAt, timeSpentSeconds
  FROM flashcard_sessions
  WHERE userId = ? AND completedAt > ? AND timeSpentSeconds IS NOT NULL
)
GROUP BY dayOfWeek, hour
```

### Daily Query (Last 30 Days)

```sql
SELECT
  date(completedAt, 'unixepoch') as date,
  SUM(timeSpentSeconds) as totalSeconds,
  SUM(questionsCount) as questionsAnswered
FROM (
  SELECT completedAt, timeSpentSeconds, totalQuestions as questionsCount
  FROM exams
  WHERE userId = ? AND completedAt > ?
  UNION ALL
  SELECT completedAt, timeSpentSeconds,
    (SELECT COUNT(*) FROM study_session_responses WHERE sessionId = s.id) as questionsCount
  FROM study_sessions s
  WHERE userId = ? AND completedAt > ?
  UNION ALL
  SELECT completedAt, timeSpentSeconds, cardsReviewed as questionsCount
  FROM flashcard_sessions
  WHERE userId = ? AND completedAt > ?
)
GROUP BY date
ORDER BY date
```

### Weekly Totals

```sql
-- Current week (Monday start)
SELECT COALESCE(SUM(timeSpentSeconds), 0) as total
FROM (...union query...)
WHERE completedAt >= strftime('%s', 'now', 'weekday 0', '-6 days', 'start of day')

-- Previous week
WHERE completedAt >= strftime('%s', 'now', 'weekday 0', '-13 days', 'start of day')
  AND completedAt < strftime('%s', 'now', 'weekday 0', '-6 days', 'start of day')
```

## Frontend Components

### File Structure

```
packages/client/src/components/dashboard/
├── StudyActivitySection.tsx      # Container, data fetching
├── StudyActivitySection.module.css
├── WeeklyTotalCard.tsx           # Stat card with comparison
├── ActivityHeatmap.tsx           # CSS grid heatmap
└── StudyProgressChart.tsx        # Recharts dual-axis
```

### StudyActivitySection

- Fetches data via `useQuery` hook
- Renders header + three child components
- Handles loading/error states

### WeeklyTotalCard

- Displays formatted hours (e.g., "12.5 hrs")
- Shows delta vs previous week with arrow icon
- Green up arrow for increase, red down for decrease

### ActivityHeatmap

- Pure CSS Grid: 7 rows (days) × 24 columns (hours)
- Color scale: gray (0) → light blue → dark blue (max)
- Intensity based on percentile within dataset
- Tooltip on hover showing exact time
- Row labels: M T W T F S S
- Column labels: 6am, 12pm, 6pm, 10pm (sparse)

### StudyProgressChart

- Uses `recharts` (existing dependency)
- `ComposedChart` with `Line` for time, `Line` for questions
- Left Y-axis: hours (formatted from seconds)
- Right Y-axis: question count
- X-axis: dates (last 30 days)
- Legend at bottom
- Responsive container

## Visual Design

### Colors

- Heatmap empty: `var(--bg-tertiary)` (subtle gray)
- Heatmap gradient: `--accent-muted` → `--accent)`
- Time line: `var(--accent)`
- Questions line: `var(--success)`

### Responsive

- Mobile: Stack weekly card above heatmap (full width each)
- Tablet+: Side by side as shown in layout
- Chart: Full width, reduced height on mobile

## Implementation Order

1. Backend: Add `/api/progress/study-time` endpoint
2. Shared: Add `StudyTimeResponse` type
3. Client API: Add `progressApi.getStudyTime()`
4. Components: WeeklyTotalCard → ActivityHeatmap → StudyProgressChart
5. Integration: Add StudyActivitySection to Dashboard
6. Styling: CSS modules + responsive adjustments

## Testing

- Unit: Time formatting utilities
- Integration: API returns correct aggregations
- Visual: Heatmap renders correctly with various data densities
