import type { WorkbookQuestion as WorkbookQuestionType } from '@ace-prep/shared';
import styles from './WorkbookQuestion.module.css';

/** Accepts any question variant - only uses base fields (questionText, options, questionType) */
interface Props {
  question: Pick<WorkbookQuestionType, 'questionText' | 'options' | 'questionType'>;
  selectedAnswers: number[];
  onSelect: (answers: number[]) => void;
  disabled?: boolean;
  showCorrectAnswers?: number[];
}

export function WorkbookQuestion({
  question,
  selectedAnswers,
  onSelect,
  disabled = false,
  showCorrectAnswers,
}: Props) {
  const isMultiple = question.questionType === 'multiple';

  const handleOptionClick = (index: number) => {
    if (disabled) return;

    if (isMultiple) {
      // Toggle selection for multiple choice
      const newAnswers = selectedAnswers.includes(index)
        ? selectedAnswers.filter((a) => a !== index)
        : [...selectedAnswers, index];
      onSelect(newAnswers);
    } else {
      // Single selection
      onSelect([index]);
    }
  };

  const getOptionClass = (index: number) => {
    const classes = [styles.option];

    if (selectedAnswers.includes(index)) {
      classes.push(styles.selected);
    }

    if (showCorrectAnswers) {
      if (showCorrectAnswers.includes(index)) {
        classes.push(styles.correct);
      } else if (selectedAnswers.includes(index)) {
        classes.push(styles.incorrect);
      }
    }

    if (disabled) {
      classes.push(styles.disabled);
    }

    return classes.join(' ');
  };

  return (
    <div className={styles.container}>
      <div className={styles.questionText}>{question.questionText}</div>

      {isMultiple && <div className={styles.hint}>Select all that apply</div>}

      <div className={styles.options}>
        {question.options.map((option, index) => (
          <button
            key={index}
            className={getOptionClass(index)}
            onClick={() => handleOptionClick(index)}
            disabled={disabled}
            type="button"
          >
            <span className={styles.optionLetter}>{String.fromCharCode(65 + index)}</span>
            <span className={styles.optionText}>{option}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
