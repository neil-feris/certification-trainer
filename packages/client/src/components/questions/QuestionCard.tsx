import type { QuestionWithDomain } from '@ace-prep/shared';
import styles from './QuestionBrowser.module.css';

interface QuestionCardProps {
  question: QuestionWithDomain;
  onClick: () => void;
}

export function QuestionCard({ question, onClick }: QuestionCardProps) {
  const truncatedText =
    question.questionText.length > 150
      ? question.questionText.slice(0, 150) + '...'
      : question.questionText;

  return (
    <div className={styles.card} onClick={onClick}>
      <p className={styles.questionText}>{truncatedText}</p>
      <div className={styles.meta}>
        <span className={styles.domain}>{question.domain.name}</span>
        <span className={`${styles.difficulty} ${styles[question.difficulty]}`}>
          {question.difficulty}
        </span>
      </div>
    </div>
  );
}
