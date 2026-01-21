# ACE Prep Mobile-Friendly PRD

**Date:** 2026-01-20
**Status:** Draft
**Author:** Claude (with user input)

---

## 1. Overview

### Problem Statement

ACE Prep is non-functional on mobile devices. The sidebar navigation disappears at 768px with no replacement, leaving users unable to navigate. Touch targets are undersized, and there's no offline capability for commute study sessions.

### Target Users

- Certification candidates studying during commutes
- Users checking progress between desktop sessions
- Anyone wanting quick 5-15 minute review sessions on their phone

### Primary Use Cases

1. **Quick study sessions** (5-15 min) - review/practice on commute with fast navigation and offline support
2. **Progress checking** - dashboard/stats glances with quick load times

### Out of Scope (v1)

- Full timed exams on mobile
- React Native app
- Tablet-specific layouts
- Push notifications

---

## 2. Success Metrics

| Metric | Target |
|--------|--------|
| Mobile usability score (Lighthouse) | > 90 |
| Time to first meaningful interaction | < 3 seconds |
| Offline study session completion rate | > 95% |
| Touch target compliance (44px min) | 100% |

---

## 3. Mobile Navigation

### Bottom Tab Bar

Fixed navigation at bottom of viewport with 4 primary tabs:

```
┌─────────────────────────────────────────┐
│                                         │
│            [Content Area]               │
│                                         │
├─────────┬─────────┬─────────┬───────────┤
│  Home   │  Study  │ Review  │  More     │
│   🏠    │   📚    │   🔄    │    ⋯     │
└─────────┴─────────┴─────────┴───────────┘
```

| Tab | Route | Purpose |
|-----|-------|---------|
| Home | `/dashboard` | Stats, progress overview |
| Study | `/study` | Domain/topic practice |
| Review | `/review` | Spaced repetition queue |
| More | Bottom sheet | Settings, Questions, Progress (full) |

### Behavior

- **Fixed position**: Always visible except during active practice sessions
- **Safe area**: Respects iPhone notch/home indicator (`env(safe-area-inset-bottom)`)
- **Active state**: Teal accent color (#00d4aa) on active tab
- **Badge support**: Review tab shows count of due cards

### "More" Menu (Bottom Sheet)

Tapping "More" opens a bottom sheet with secondary navigation:

```
┌─────────────────────────────────────────┐
│  ──────  (drag handle)                  │
├─────────────────────────────────────────┤
│  📊  Progress Details                   │
│  ❓  Question Browser                   │
│  ⚙️  Settings                           │
│  ───────────────────                    │
│  🔌  Offline: 142 questions cached      │
└─────────────────────────────────────────┘
```

### Navigation During Practice

During active study/review sessions:
- Bottom nav hidden to maximize question space
- Minimal top bar with back arrow + progress indicator
- Swipe gestures for question navigation

---

## 4. Study & Review Flow

### Study Hub (Mobile)

Domain list with accordion-style expansion:

```
┌─────────────────────────────────────────┐
│  ← Study                    [offline ●] │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │ Domain 1: Planning          32% │    │
│  │ ████████░░░░░░░░  12/38 topics  │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ Domain 2: Instruction       67% │    │
│  │ █████████████░░░  8/12 topics   │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

- Tap domain → expands inline to show topics
- Tap topic → starts practice session

### Practice Session

Full-screen question view optimized for touch:

```
┌─────────────────────────────────────────┐
│  ←  Question 3 of 10        ⏱️ 2:34    │
├─────────────────────────────────────────┤
│                                         │
│  Which assessment strategy best         │
│  measures student understanding of      │
│  complex motor skills?                  │
│                                         │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │ ○  Written examination          │ 56px
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ ○  Performance rubric           │ 56px
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ ○  Multiple choice quiz         │ 56px
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ ○  Peer evaluation              │ 56px
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│      [Previous]        [Next →]         │
└─────────────────────────────────────────┘
```

**Mobile optimizations:**
- Touch targets: 56px minimum height per option
- Swipe navigation: Swipe left/right between questions
- No bottom nav during practice
- Tap feedback: Scale + background change on press

### Review Session (Spaced Repetition)

Card-style interface with 2x2 rating grid:

```
┌─────────────────────────────────────────┐
│  ←  Review (12 due)                     │
├─────────────────────────────────────────┤
│                                         │
│  [Question text displayed here]         │
│                                         │
│           [ Show Answer ]               │
│                                         │
├─────────────────────────────────────────┤
│  After revealing:                       │
│  ┌────────┐ ┌────────┐                  │
│  │ Again  │ │  Hard  │                  │
│  └────────┘ └────────┘                  │
│  ┌────────┐ ┌────────┐                  │
│  │  Good  │ │  Easy  │                  │
│  └────────┘ └────────┘                  │
└─────────────────────────────────────────┘
```

- 2x2 rating grid (vs horizontal row on desktop)
- Each button 48px+ height
- Swipe up to reveal answer (alternative to tap)

---

## 5. Dashboard & Stats

### Mobile Layout

Compact stats-first design:

```
┌─────────────────────────────────────────┐
│  Good morning! 🎯                       │
│  3 reviews due · 67% overall            │
├─────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐                │
│  │ 67%     │ │ 142     │                │
│  │ Mastery │ │Questions│                │
│  └─────────┘ └─────────┘                │
│  ┌─────────┐ ┌─────────┐                │
│  │ 12      │ │ 5 day   │                │
│  │ Due     │ │ Streak  │                │
│  └─────────┘ └─────────┘                │
├─────────────────────────────────────────┤
│  Quick Actions                          │
│  ┌─────────────────────────────────┐    │
│  │  🔄  Start Review (12 due)      │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  📚  Continue: Domain 2         │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  Domain Progress                        │
│  Planning        ████████░░  32%        │
│  Instruction     █████████████░  67%    │
│  Assessment      ██████░░░░  45%        │
└─────────────────────────────────────────┘
```

### Desktop vs Mobile Comparison

| Element | Desktop | Mobile |
|---------|---------|--------|
| Stats grid | 4 columns | 2x2 grid |
| Stat value size | 36px | 28px |
| Domain progress | Full chart | Horizontal bars |
| Quick actions | Sidebar | Prominent buttons |
| Recent activity | Full table | Hidden (in "More") |

### Glanceable Priority

1. Review due count - most actionable
2. Overall mastery % - quick health check
3. Streak - motivation reinforcement
4. Domain bars - identify weak areas

---

## 6. Offline Support

### Architecture

```
┌─────────────────────────────────────────┐
│              React App                  │
├─────────────────────────────────────────┤
│         TanStack Query Cache            │
├──────────────────┬──────────────────────┤
│  Service Worker  │    IndexedDB         │
│  (asset caching) │  (question storage)  │
└──────────────────┴──────────────────────┘
```

### Cached Data

| Data | Storage | Sync Strategy |
|------|---------|---------------|
| App shell (HTML/CSS/JS) | Service Worker | Cache-first |
| Questions (by topic) | IndexedDB | Background sync daily |
| User progress | IndexedDB | Sync on reconnect |
| Study session responses | IndexedDB queue | Flush when online |
| Images/assets | Service Worker | Cache-first |

### Offline Behavior

**When offline:**
- Banner: "Offline mode - 142 questions available"
- Study/Review fully functional with cached questions
- Responses queued locally
- Dashboard shows cached stats (may be stale)
- Settings page disabled (needs API)

**When back online:**
- Sync queued responses automatically
- Refresh question cache in background
- Update stats
- Toast: "Synced 5 responses"

### Storage Limits

- Target: ~500 questions cached (~5MB)
- User can choose topics to prioritize in Settings
- Auto-prune oldest unused questions if near quota

### PWA Manifest

```json
{
  "name": "ACE Prep",
  "short_name": "ACE Prep",
  "start_url": "/dashboard",
  "display": "standalone",
  "theme_color": "#0f1419",
  "background_color": "#0f1419",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192" },
    { "src": "/icon-512.png", "sizes": "512x512" }
  ]
}
```

---

## 7. Technical Implementation

### New Components

| Component | Purpose |
|-----------|---------|
| `MobileNavBar` | Bottom tab navigation |
| `BottomSheet` | "More" menu, confirmations |
| `MobileQuestionCard` | Touch-optimized question display |
| `OfflineBanner` | Connection status indicator |
| `SwipeContainer` | Swipe gesture wrapper |

### CSS Breakpoint Strategy

```css
/* Base: Mobile-first (< 768px) */
.component { /* mobile styles */ }

/* Tablet/Desktop */
@media (min-width: 768px) {
  .component { /* desktop overrides */ }
}
```

### Touch Target Standards

```css
.touchable {
  min-height: 48px;
  min-width: 48px;
  padding: 12px 16px;
}

@media (hover: none) {
  .touchable:active {
    transform: scale(0.98);
    background: var(--bg-elevated);
  }
}
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `workbox` | Service worker tooling |
| `idb-keyval` | Simple IndexedDB wrapper |
| `react-swipeable` | Swipe gesture detection |

### File Changes

```
packages/client/
├── public/
│   ├── manifest.json              (new)
│   ├── sw.js                      (new)
│   └── icons/                     (new)
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── MobileNavBar.tsx         (new)
│   │   │   ├── MobileNavBar.module.css  (new)
│   │   │   ├── BottomSheet.tsx          (new)
│   │   │   └── AppShell.module.css      (modify)
│   │   ├── common/
│   │   │   ├── OfflineBanner.tsx        (new)
│   │   │   └── SwipeContainer.tsx       (new)
│   │   ├── study/
│   │   │   └── *.module.css             (modify)
│   │   ├── review/
│   │   │   └── *.module.css             (modify)
│   │   └── dashboard/
│   │       └── *.module.css             (modify)
│   ├── hooks/
│   │   ├── useOnlineStatus.ts           (new)
│   │   └── useSwipeNavigation.ts        (new)
│   ├── services/
│   │   ├── offlineStorage.ts            (new)
│   │   └── syncQueue.ts                 (new)
│   └── styles/
│       └── globals.css                  (modify)
└── index.html                           (modify)
```

---

## 8. Implementation Phases

| Phase | Scope | Priority |
|-------|-------|----------|
| **Phase 1** | Bottom nav + touch targets + basic responsive | P0 |
| **Phase 2** | Study/Review flow optimization | P0 |
| **Phase 3** | Dashboard mobile layout | P1 |
| **Phase 4** | Offline support (Service Worker + IndexedDB) | P1 |
| **Phase 5** | PWA manifest + install prompt | P2 |

---

## 9. Testing Strategy

### Tools
- Chrome DevTools device emulation
- Real device testing (iPhone SE, iPhone 14, Pixel 5)
- Lighthouse mobile audit (target >90)
- Offline simulation testing

### Test Cases

**Navigation:**
- [ ] Bottom nav visible on mobile (<768px)
- [ ] Bottom nav hidden on desktop (>=768px)
- [ ] All tabs navigate correctly
- [ ] "More" sheet opens/closes
- [ ] Nav hidden during active practice

**Touch:**
- [ ] All interactive elements >= 48px touch target
- [ ] Tap feedback visible on press
- [ ] Swipe navigation works for questions
- [ ] No accidental taps on adjacent elements

**Offline:**
- [ ] App loads when offline
- [ ] Cached questions accessible
- [ ] Responses queue and sync
- [ ] Offline banner displays correctly
- [ ] PWA install prompt works

**Responsive:**
- [ ] Content readable on 375px width
- [ ] No horizontal scroll
- [ ] Images/charts scale appropriately
- [ ] Text remains legible

---

## 10. Appendix: Current State Analysis

### Critical Issues Found

1. **No mobile navigation** - Sidebar hidden at 768px with no replacement
2. **Single breakpoint** - Only 768px, missing phone/tablet optimization
3. **Small touch targets** - Some buttons 32px (need 48px minimum)
4. **Fixed font sizes** - Uses px, doesn't scale with viewport
5. **No offline support** - Unusable during commute

### Current Mobile Readiness Score: 4/10

| Dimension | Score |
|-----------|-------|
| Viewport Config | Good |
| CSS Structure | Good |
| Breakpoints | Partial |
| Navigation | Critical fail |
| Typography | Partial |
| Touch targets | Partial |
| Offline | None |

---

## Approval

- [ ] Product Owner
- [ ] Engineering Lead
- [ ] Design Review
