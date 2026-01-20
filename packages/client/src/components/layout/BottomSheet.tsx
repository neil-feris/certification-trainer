import { useEffect, useCallback } from 'react';
import { useSwipeable } from 'react-swipeable';
import styles from './BottomSheet.module.css';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // Swipe down to close
  const swipeHandlers = useSwipeable({
    onSwipedDown: () => onClose(),
    delta: 50,
    trackTouch: true,
    trackMouse: false,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'bottom-sheet-title' : undefined}
        {...swipeHandlers}
      >
        <div className={styles.handle} />
        {title && (
          <div className={styles.header}>
            <h2 id="bottom-sheet-title" className={styles.title}>
              {title}
            </h2>
          </div>
        )}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
