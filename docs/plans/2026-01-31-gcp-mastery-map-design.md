# FEAT-015: GCP Service Mastery Map - Design Document

## Overview

Visual grid showing user mastery level for each GCP service, helping identify knowledge gaps at the service level. Key differentiator vs competitors.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Service tagging | Use existing `gcpServices` JSON array | Already exists, supports multi-service questions |
| Navigation | Dedicated `/mastery` route | Keeps dashboard focused, full-page visualization |
| Click behavior | Inline expansion | Stays in context, avoids jarring navigation |
| Empty state | Show all services (gray for unattempted) | Core value prop is revealing gaps |
| Service list | Hybrid canonical + DB extras | Consistent categories + flexibility |
| Certification filter | Global context from Zustand | Consistent with other pages |

## Data Model

No schema changes required - `gcpServices` field already exists on questions table.

### API Endpoint

`GET /api/progress/mastery-map?certificationId=1`

```typescript
interface ServiceMastery {
  id: string;              // kebab-case: "cloud-run"
  name: string;            // Display: "Cloud Run"
  category: string;        // "Compute"
  questionsAttempted: number;
  totalQuestions: number;  // Questions in DB with this service
  correctCount: number;
  accuracy: number | null; // null if not attempted
  masteryLevel: 'none' | 'low' | 'medium' | 'high';
  lastAttemptAt: string | null;
}

interface MasteryMapResponse {
  categories: {
    name: string;
    services: ServiceMastery[];
  }[];
  totals: {
    servicesAttempted: number;
    servicesTotal: number;
    overallAccuracy: number | null;
  };
}
```

### Mastery Calculation

- Query `examResponses` joined with `questions`
- Parse `gcpServices` JSON, attribute attempt to each service in array
- Aggregate per service: `correctCount / questionsAttempted`
- Mastery levels:
  - `none`: 0 attempts
  - `low`: <50% accuracy
  - `medium`: 50-80% accuracy
  - `high`: >80% accuracy

## GCP Service Categories

Canonical list (~40 services) in `packages/shared/src/gcpServices.ts`:

```typescript
export const GCP_SERVICE_CATEGORIES = [
  {
    name: 'Compute',
    services: ['Compute Engine', 'GKE', 'Cloud Run', 'Cloud Functions', 'App Engine']
  },
  {
    name: 'Storage & Databases',
    services: ['Cloud Storage', 'Cloud SQL', 'Cloud Spanner', 'Firestore', 'Bigtable', 'Memorystore', 'Filestore']
  },
  {
    name: 'Networking',
    services: ['VPC', 'Cloud Load Balancing', 'Cloud CDN', 'Cloud DNS', 'Cloud Armor', 'Cloud NAT', 'Cloud Interconnect']
  },
  {
    name: 'Data & Analytics',
    services: ['BigQuery', 'Dataflow', 'Dataproc', 'Pub/Sub', 'Data Fusion', 'Composer']
  },
  {
    name: 'AI & ML',
    services: ['Vertex AI', 'Vision AI', 'Natural Language', 'Translation', 'AutoML']
  },
  {
    name: 'Security & Identity',
    services: ['IAM', 'Secret Manager', 'KMS', 'Security Command Center', 'Binary Authorization']
  },
  {
    name: 'Operations',
    services: ['Cloud Monitoring', 'Cloud Logging', 'Error Reporting', 'Cloud Trace']
  }
] as const;
```

Services found in questions but not in canonical list are added to an "Other" category.

## Frontend Components

### File Structure

```
packages/client/src/pages/MasteryPage/
├── MasteryPage.tsx          # Page container, data fetching
├── MasteryPage.module.css
└── components/
    ├── MasteryGrid.tsx      # Category sections + service grid
    ├── ServiceCard.tsx      # Individual service tile
    ├── ServiceDetail.tsx    # Expanded view (stats + questions)
    └── MasteryGrid.module.css
```

### ServiceCard States

| State | Color | Display |
|-------|-------|---------|
| `none` | Gray (`--bg-tertiary`) | "Not started" |
| `low` | Red (`--error`) | Percentage |
| `medium` | Yellow (`--warning`) | Percentage |
| `high` | Green (`--success`) | Percentage + checkmark |

### Inline Expansion

Click card to expand and show:
- Accuracy breakdown (correct/total)
- Last practiced date
- 3-5 recent questions with that service
- "Practice this service" button (future enhancement)

### Responsive Grid

- Desktop: 5-6 cards per row
- Tablet: 3-4 cards
- Mobile: 2 cards

## Visual Design

### Colors

```css
--mastery-none: var(--bg-tertiary);     /* #243447 */
--mastery-low: var(--error);            /* #ff5252 */
--mastery-medium: var(--warning);       /* #ffab00 */
--mastery-high: var(--success);         /* #00c853 */
```

### Card Styling

- 120x100px tiles with subtle glow matching mastery color
- Service name centered, percentage below
- Hover: `transform: scale(1.02)` with 150ms ease
- Active/expanded: accent border, arrow indicator

### Page Layout

- Header: "GCP Service Mastery" + summary stats
- Grid: Categories stacked vertically, services in responsive grid
- Background: existing `.bg-grid` pattern

### Animations

- Card hover: scale with 150ms ease
- Expansion: height transition 200ms
- Initial load: staggered fade-in per category

## Testing Strategy

### Backend Tests

- Mastery calculation with mixed service arrays
- Empty state (no attempts)
- Certification filtering
- Edge case: question with service not in canonical list

### Frontend Tests

- Grid renders all categories
- Correct color coding per mastery level
- Card expansion/collapse
- Responsive breakpoints

## Implementation Order

1. Add shared types + canonical service list
2. Backend: mastery-map endpoint + calculation logic
3. Frontend: MasteryPage with static grid (no data)
4. Connect data + interactivity
5. Styling polish + animations
6. Tests
7. Add nav link to router

## Acceptance Criteria

- [ ] API endpoint returns mastery data per service
- [ ] Visual grid displays all services with color coding
- [ ] Clicking service expands inline with details
- [ ] Certification filter works (ACE vs PCA)
- [ ] Responsive design for mobile
- [ ] Tests pass
