import { useEffect } from 'react';
import type { QuestionWithDomain } from '@ace-prep/shared';
import { BookmarkButton, NotesPanel } from '../common';
import styles from './QuestionDetailModal.module.css';

interface QuestionDetailModalProps {
  question: QuestionWithDomain;
  onClose: () => void;
}

export function QuestionDetailModal({ question, onClose }: QuestionDetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const options = question.options;
  const correctAnswers = question.correctAnswers;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          x
        </button>

        <div className={styles.header}>
          <span className={styles.domain}>{question.domain.name}</span>
          <span className={`${styles.difficulty} ${styles[question.difficulty]}`}>
            {question.difficulty}
          </span>
          <BookmarkButton
            targetType="question"
            targetId={question.id}
            size="sm"
            className={styles.bookmarkBtn}
          />
        </div>

        <p className={styles.questionText}>{question.questionText}</p>

        <div className={styles.options}>
          {options.map((opt, idx) => (
            <div
              key={idx}
              className={`${styles.option} ${correctAnswers.includes(idx) ? styles.correct : ''}`}
            >
              <span className={styles.optionLabel}>{String.fromCharCode(65 + idx)}</span>
              <span>{opt}</span>
              {correctAnswers.includes(idx) && <span className={styles.checkmark}>✓</span>}
            </div>
          ))}
        </div>

        {question.explanation && (
          <div className={styles.explanation}>
            <h4>Explanation</h4>
            <p>{question.explanation}</p>
          </div>
        )}

        <NotesPanel questionId={question.id} className={styles.notesPanel} />
      </div>
    </div>
  );
}
