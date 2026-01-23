import { useEffect, useRef, useCallback } from 'react';
import { LEVEL_THRESHOLDS } from '@ace-prep/shared';
import styles from './LevelUpModal.module.css';

interface LevelUpModalProps {
  oldLevel: number;
  newLevel: number;
  onClose: () => void;
}

export function LevelUpModal({ oldLevel, newLevel, onClose }: LevelUpModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Get level titles from thresholds
  const oldTitle = LEVEL_THRESHOLDS.find((t) => t.level === oldLevel)?.title ?? 'Unknown';
  const newTitle = LEVEL_THRESHOLDS.find((t) => t.level === newLevel)?.title ?? 'Unknown';

  // Focus trap and escape handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap - only the close button is focusable
      if (e.key === 'Tab') {
        e.preventDefault();
        closeButtonRef.current?.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    // Focus the close button on mount
    closeButtonRef.current?.focus();

    // Add keyboard listener
    document.addEventListener('keydown', handleKeyDown);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="levelup-title"
    >
      {/* Confetti particles */}
      <div className={styles.confettiContainer} aria-hidden="true">
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className={styles.confetti}
            style={
              {
                '--delay': `${Math.random() * 3}s`,
                '--x-start': `${Math.random() * 100}vw`,
                '--x-end': `${Math.random() * 100}vw`,
                '--rotation': `${Math.random() * 720 - 360}deg`,
                '--color': `hsl(${Math.random() * 360}, 80%, 60%)`,
                '--size': `${6 + Math.random() * 8}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className={styles.modal} ref={modalRef}>
        {/* Glow effect */}
        <div className={styles.glow} aria-hidden="true" />

        {/* Star burst animation */}
        <div className={styles.starBurst} aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={styles.star}
              style={{ '--rotation': `${i * 45}deg` } as React.CSSProperties}
            />
          ))}
        </div>

        <h2 id="levelup-title" className={styles.title}>
          Level Up!
        </h2>

        <div className={styles.levelTransition}>
          <div className={styles.oldLevel}>
            <span className={styles.levelLabel}>Level {oldLevel}</span>
            <span className={styles.levelTitle}>{oldTitle}</span>
          </div>
          <div className={styles.arrow} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </div>
          <div className={styles.newLevel}>
            <span className={styles.levelBadge}>{newLevel}</span>
            <span className={styles.newTitle}>{newTitle}</span>
          </div>
        </div>

        <p className={styles.message}>You've reached a new milestone!</p>

        <button ref={closeButtonRef} className={styles.continueBtn} onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}
