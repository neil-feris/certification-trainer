import { useState } from 'react';
import { XPHistoryRecord, XP_SOURCE_LABELS } from '@ace-prep/shared';
import styles from './XPHistoryPanel.module.css';

interface XPHistoryPanelProps {
  history: XPHistoryRecord[];
  isLoading?: boolean;
  error?: boolean;
}

// Format relative time from a date
function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 10) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // For older entries, show the date
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Get human-readable label for XP source
function getSourceLabel(source: string): string {
  return XP_SOURCE_LABELS[source] || source.replace(/_/g, ' ').toLowerCase();
}

// Get icon for XP source type
function getSourceIcon(source: string): string {
  if (source.includes('EXAM')) return '📝';
  if (source.includes('DRILL')) return '⚡';
  if (source.includes('STUDY')) return '📚';
  if (source.includes('SR_CARD') || source.includes('REVIEW')) return '🔄';
  if (source.includes('CORRECT')) return '✓';
  if (source.includes('INCORRECT')) return '○';
  return '★';
}

export function XPHistoryPanel({ history, isLoading, error }: XPHistoryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (error) {
    return (
      <div className={styles.panel}>
        <button className={styles.toggleButton} disabled>
          <span className={styles.toggleIcon}>⚠</span>
          <span>XP History unavailable</span>
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.panel}>
        <button className={styles.toggleButton} disabled>
          <span className={styles.loadingDots}>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
          <span>Loading XP History</span>
        </button>
      </div>
    );
  }

  const hasHistory = history && history.length > 0;

  return (
    <div className={`${styles.panel} ${isExpanded ? styles.expanded : ''}`}>
      <button
        className={styles.toggleButton}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="xp-history-list"
      >
        <span className={styles.toggleIcon}>{isExpanded ? '▼' : '▶'}</span>
        <span>{isExpanded ? 'Hide XP History' : 'View XP History'}</span>
        {hasHistory && !isExpanded && (
          <span className={styles.itemCount}>{history.length} recent</span>
        )}
      </button>

      {isExpanded && (
        <div id="xp-history-list" className={styles.historyList}>
          {!hasHistory ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>📊</span>
              <span className={styles.emptyText}>No XP history yet</span>
              <span className={styles.emptyHint}>Complete activities to earn XP!</span>
            </div>
          ) : (
            <ul className={styles.list}>
              {history.map((item) => (
                <li key={item.id} className={styles.historyItem}>
                  <span className={styles.sourceIcon}>{getSourceIcon(item.source)}</span>
                  <span className={styles.sourceLabel}>{getSourceLabel(item.source)}</span>
                  <span className={styles.xpAmount}>+{item.amount} XP</span>
                  <span className={styles.timestamp}>{formatRelativeTime(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
