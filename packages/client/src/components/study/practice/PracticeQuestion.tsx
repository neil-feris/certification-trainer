import styles from './Practice.module.css';

interface PracticeQuestionProps {
  question: {
    id: number;
    questionText: string;
    questionType: 'single' | 'multiple';
    options: string[];
    correctAnswers: number[];
  };
  selectedAnswers: number[];
  onAnswerChange: (answers: number[]) => void;
  isRevealed: boolean;
}

export function PracticeQuestion({
  question,
  selectedAnswers,
  onAnswerChange,
  isRevealed,
}: PracticeQuestionProps) {
  const handleOptionClick = (index: number) => {
    if (isRevealed) return;

    if (question.questionType === 'single') {
      onAnswerChange([index]);
    } else {
      if (selectedAnswers.includes(index)) {
        onAnswerChange(selectedAnswers.filter((i) => i !== index));
      } else {
        onAnswerChange([...selectedAnswers, index]);
      }
    }
  };

  const getOptionClass = (index: number) => {
    const classes = [styles.option];

    if (selectedAnswers.includes(index)) {
      classes.push(styles.selected);
    }

    if (isRevealed) {
      if (question.correctAnswers.includes(index)) {
        classes.push(styles.correct);
      } else if (selectedAnswers.includes(index)) {
        classes.push(styles.incorrect);
      }
    }

    return classes.join(' ');
  };

  return (
    <div className={styles.questionCard}>
      <div className={styles.questionType}>
        {question.questionType === 'multiple' ? 'Select all that apply' : 'Select one answer'}
      </div>

      <div className={styles.questionText}>{question.questionText}</div>

      <div className={styles.options}>
        {question.options.map((option, index) => (
          <button
            key={index}
            className={getOptionClass(index)}
            onClick={() => handleOptionClick(index)}
            disabled={isRevealed}
          >
            <span className={styles.optionIndicator}>
              {question.questionType === 'single' ? (
                <span className={styles.radio}>
                  {selectedAnswers.includes(index) && <span className={styles.radioFill} />}
                </span>
              ) : (
                <span className={styles.checkbox}>
                  {selectedAnswers.includes(index) && <span className={styles.checkmark}>✓</span>}
                </span>
              )}
            </span>
            <span className={styles.optionText}>{option}</span>
            {isRevealed && question.correctAnswers.includes(index) && (
              <span className={styles.correctMark}>✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
