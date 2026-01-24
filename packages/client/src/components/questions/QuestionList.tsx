import type { QuestionWithDomain } from '@ace-prep/shared';
import { QuestionCard } from './QuestionCard';
import styles from './QuestionBrowser.module.css';

interface QuestionListProps {
  questions: QuestionWithDomain[];
  isLoading: boolean;
  error: Error | null;
  noteStatusMap: Map<number, boolean>;
  onQuestionClick: (question: QuestionWithDomain) => void;
}

export function QuestionList({
  questions,
  isLoading,
  error,
  noteStatusMap,
  onQuestionClick,
}: QuestionListProps) {
  if (isLoading) {
    return (
      <div className={styles.loading}>
        <p>Loading questions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>Failed to load questions</p>
        <p>{error.message}</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No questions found</p>
        <p>Try adjusting your filters or search terms</p>
      </div>
    );
  }

  return (
    <div className={styles.questionGrid}>
      {questions.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          hasNote={noteStatusMap.get(question.id) ?? false}
          onClick={() => onQuestionClick(question)}
        />
      ))}
    </div>
  );
}
