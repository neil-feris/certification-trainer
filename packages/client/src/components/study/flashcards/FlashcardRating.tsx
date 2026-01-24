import { useState } from 'react';
import type { ReviewQuality } from '@ace-prep/shared';
import styles from './FlashcardRating.module.css';

interface FlashcardRatingProps {
  visible: boolean;
  onRate: (rating: ReviewQuality) => void;
}

const RATING_OPTIONS: { value: ReviewQuality; label: string; key: string; description: string }[] =
  [
    { value: 'again', label: 'Again', key: '1', description: 'Forgot completely' },
    { value: 'hard', label: 'Hard', key: '2', description: 'Struggled to recall' },
    { value: 'good', label: 'Good', key: '3', description: 'Recalled with effort' },
    { value: 'easy', label: 'Easy', key: '4', description: 'Instant recall' },
  ];

export function FlashcardRating({ visible, onRate }: FlashcardRatingProps) {
  const [selectedRating, setSelectedRating] = useState<ReviewQuality | null>(null);

  if (!visible) return null;

  const handleRate = (rating: ReviewQuality) => {
    setSelectedRating(rating);
    onRate(rating);
    // Reset after animation
    setTimeout(() => setSelectedRating(null), 400);
  };

  return (
    <div className={styles.ratingContainer}>
      <span className={styles.prompt}>How well did you know this?</span>
      <div className={styles.ratingButtons}>
        {RATING_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={`${styles.ratingBtn} ${styles[option.value]} ${selectedRating === option.value ? styles.selected : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleRate(option.value);
            }}
            title={`${option.description} (${option.key})`}
          >
            <span className={styles.ratingKey}>{option.key}</span>
            <span className={styles.ratingLabel}>{option.label}</span>
            <span className={styles.ratingDesc}>{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
