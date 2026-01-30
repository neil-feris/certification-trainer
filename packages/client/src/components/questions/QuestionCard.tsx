import type { QuestionWithDomain } from '@ace-prep/shared';
import { BookmarkButton } from '../common';
import styles from './QuestionBrowser.module.css';

interface QuestionCardProps {
  question: QuestionWithDomain;
  hasNote?: boolean;
  onClick: () => void;
}

export function QuestionCard({ question, hasNote, onClick }: QuestionCardProps) {
  const truncatedText =
    question.questionText.length > 150
      ? question.questionText.slice(0, 150) + '...'
      : question.questionText;

  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.cardHeader}>
        <p className={styles.questionText}>{truncatedText}</p>
        <BookmarkButton targetType="question" targetId={question.id} size="sm" />
      </div>
      <div className={styles.meta}>
        <span className={styles.domain}>{question.domain?.name ?? 'Unknown'}</span>
        <span className={`${styles.difficulty} ${styles[question.difficulty]}`}>
          {question.difficulty}
        </span>
        {hasNote && (
          <span className={styles.noteIndicator} title="Has notes">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
