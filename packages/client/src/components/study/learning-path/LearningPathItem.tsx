import { Link } from 'react-router-dom';
import type { LearningPathItem as LearningPathItemType } from '@ace-prep/shared';
import styles from './LearningPath.module.css';

interface LearningPathItemProps {
  item: LearningPathItemType;
}

export function LearningPathItem({ item }: LearningPathItemProps) {
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
    <Link
      to={`/study/learning-path/${item.order}`}
      className={`${styles.pathItem} ${styles.pathItemLink} ${item.isCompleted ? styles.completed : ''}`}
    >
      {/* Completion indicator */}
      <div
        className={`${styles.completionIndicator} ${item.isCompleted ? styles.indicatorComplete : ''}`}
      >
        {item.isCompleted ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 8L7 11L12 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span className={styles.indicatorDot} />
        )}
      </div>

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

      <div className={styles.pathArrow}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M7 4L13 10L7 16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Link>
  );
}
