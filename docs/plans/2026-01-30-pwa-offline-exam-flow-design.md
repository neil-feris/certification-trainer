# FEAT-012: Complete PWA Offline Mode - Design

**Date**: 2026-01-30
**Status**: Approved
**Author**: Claude

## Summary

Improve the offline exam experience by making the existing offline infrastructure more discoverable and providing graceful fallbacks when network connectivity is lost.

## Current State

The PWA infrastructure is ~80% complete:
- Service worker with Workbox precaching
- IndexedDB storage for offline exams, sync queue, cached questions
- Question caching per certification (manual download in Settings)
- Offline exam creation from cached questions
- Sync queue with exponential backoff and deduplication
- Server endpoint `POST /api/exams/offline-submit` exists

## Gap Analysis

| Component | Status | Gap |
|-----------|--------|-----|
| Question caching | Works | Manual only - user must visit Settings |
| Create offline exam | Works | No automatic fallback if online fails |
| Take exam offline | Works | - |
| Submit offline exam | Works | - |
| Sync queue processing | Works | - |
| **Offline indicator in exam setup** | Missing | User doesn't know offline is available |
| **Graceful degradation** | Missing | No fallback when online exam creation fails |
| **Sync status visibility** | Missing | User doesn't know if results synced |

## Solution

### 1. Offline Fallback Modal

When user clicks "Start Exam" and the API call fails due to network error:

**With cached questions:**
```
┌─────────────────────────────────────────────────────┐
│  You appear to be offline                           │
│                                                     │
│  Good news! You have 127 questions cached for ACE.  │
│                                                     │
│  [Start Offline Exam]    [Cancel]                   │
└─────────────────────────────────────────────────────┘
```

**Without cached questions:**
```
┌─────────────────────────────────────────────────────┐
│  You appear to be offline                           │
│                                                     │
│  No questions cached for offline use.               │
│  Connect to the internet or download questions      │
│  in Settings → Offline Mode.                        │
│                                                     │
│  [Go to Settings]    [Cancel]                       │
└─────────────────────────────────────────────────────┘
```

### 2. Offline Ready Badge

Show cached question count on exam setup page:

```
┌─────────────────────────────────────────────────┐
│ 📶 Offline Ready: 127 questions cached          │
│    Works without internet                       │
└─────────────────────────────────────────────────┘
```

Only visible when questions are cached for the selected certification.

### 3. Sync Status Indicator

After completing an offline exam, show sync status on results page:

- **Pending**: "Results pending sync - will sync automatically when online"
- **Synced**: "Results synced to your account"
- **Failed**: "Sync failed - will retry automatically"

## Implementation

### Files to Create

| File | Purpose |
|------|---------|
| `components/exam/OfflineFallbackModal.tsx` | Modal for offline fallback prompt |
| `components/exam/OfflineFallbackModal.module.css` | Styles |
| `components/exam/OfflineReadyBadge.tsx` | Shows cached question count |
| `components/exam/OfflineReadyBadge.module.css` | Styles |
| `components/exam/SyncStatusIndicator.tsx` | Shows pending/synced status |
| `components/exam/SyncStatusIndicator.module.css` | Styles |

### Files to Modify

| File | Changes |
|------|---------|
| `components/exam/ExamSetup.tsx` | Add offline detection, fallback modal, ready badge |
| `components/exam/ExamResults.tsx` | Add sync status indicator for offline exams |
| `stores/examStore.ts` | Expose `isOfflineExam` for results page |

### ExamSetup.tsx Changes

```typescript
// New imports
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { getCachedQuestionCount } from '../../services/offlineDb';
import { OfflineFallbackModal } from './OfflineFallbackModal';
import { OfflineReadyBadge } from './OfflineReadyBadge';

// New state
const { isOnline } = useOnlineStatus();
const [cachedQuestionCount, setCachedQuestionCount] = useState(0);
const [showOfflineFallback, setShowOfflineFallback] = useState(false);

// Load cached count when certification changes
useEffect(() => {
  if (selectedCertification) {
    getCachedQuestionCount(selectedCertification.id)
      .then(setCachedQuestionCount);
  }
}, [selectedCertification]);

// Modified start exam handler
const handleStartExam = async () => {
  try {
    const exam = await examApi.create({ ... });
    navigate(`/exam/${exam.id}`);
  } catch (error) {
    if (!navigator.onLine || isNetworkError(error)) {
      setShowOfflineFallback(true);
      return;
    }
    throw error;
  }
};

// In render - add badge and modal
<OfflineReadyBadge
  certificationId={selectedCertification?.id}
  count={cachedQuestionCount}
/>

<OfflineFallbackModal
  isOpen={showOfflineFallback}
  onClose={() => setShowOfflineFallback(false)}
  onStartOffline={handleStartOfflineExam}
  cachedQuestionCount={cachedQuestionCount}
  requiredCount={questionCount}
/>
```

### Helper Function

```typescript
// utils/networkError.ts
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return true;
  }
  if (error instanceof Error && error.name === 'NetworkError') {
    return true;
  }
  return false;
}
```

## Testing

### Manual Test Cases

1. **Start exam offline with cache**: Fallback modal → Start Offline Exam → Complete → Sync
2. **Start exam offline without cache**: Fallback modal → Go to Settings link
3. **Badge visibility**: Shows count when cached, hidden when not
4. **Sync status**: Pending → Synced transition after network restore
5. **Mid-exam network drop**: Exam continues, progress persists

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Network drops mid-exam | Exam continues, progress in IndexedDB |
| Browser closed during exam | Recovery modal on next visit |
| Sync fails 5x | Dead letter queue, error shown |
| Duplicate sync | Server returns `alreadySynced`, handled gracefully |

## Out of Scope

- Auto-caching on certification select (future enhancement)
- Push notifications for sync status (FEAT-013)
- Offline study sessions/flashcards (only exams for now)

## Rollout

1. Implement behind existing infrastructure
2. No feature flag needed - enhances existing flow
3. Monitor Sentry for offline-related errors post-deploy
