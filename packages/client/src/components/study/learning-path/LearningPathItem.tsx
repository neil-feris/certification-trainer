import type { LearningPathItem as LearningPathItemType } from '@ace-prep/shared';
import styles from './LearningPath.module.css';

interface LearningPathItemProps {
  item: LearningPathItemType;
  onToggle: () => void;
  isToggling: boolean;
}

export function LearningPathItem({ item, onToggle, isToggling }: LearningPathItemProps) {
  const typeColors: Record<string, string> = {
    course: 'var(--accent-secondary)',
    skill_badge: 'var(--accent-primary)',
    exam: 'var(--success)',
  };

  const typeLabels: Record<string, string> = {
    course: 'Course',
    skill_badge: 'Skill Badge',
    exam: 'Certification',
  };

  return (
    <div className={`${styles.pathItem} ${item.isCompleted ? styles.completed : ''}`}>
      <button
        className={styles.checkbox}
        onClick={onToggle}
        disabled={isToggling}
        aria-label={item.isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {item.isCompleted ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect width="20" height="20" rx="4" fill="var(--accent-primary)" />
            <path
              d="M6 10L9 13L14 7"
              stroke="var(--bg-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect
              x="1"
              y="1"
              width="18"
              height="18"
              rx="3"
              stroke="var(--border-color)"
              strokeWidth="2"
            />
          </svg>
        )}
      </button>

      <div className={styles.pathNumber}>{item.order}</div>

      <div className={styles.pathContent}>
        <div className={styles.pathHeader}>
          <h3 className={styles.pathTitle}>{item.title}</h3>
          <span
            className={styles.typeBadge}
            style={{ background: typeColors[item.type] || 'var(--bg-tertiary)' }}
          >
            {typeLabels[item.type] || item.type}
          </span>
        </div>

        <p className={styles.pathDescription}>{item.description}</p>

        <div className={styles.pathTopics}>
          <strong>Topics:</strong> {item.topics.join(' • ')}
        </div>

        <div className={styles.pathWhy}>
          <strong>Why it matters:</strong> {item.whyItMatters}
        </div>
      </div>
    </div>
  );
}
