import { useEffect, useState } from 'react';
import styles from './Toast.module.css';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastConfig {
  message: string;
  type?: ToastType;
  duration?: number;
}

// Global toast state management
let toastListener: ((toast: ToastConfig | null) => void) | null = null;

export function showToast(config: ToastConfig): void {
  if (toastListener) {
    toastListener(config);
  }
}

export function Toast() {
  const [toast, setToast] = useState<ToastConfig | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    toastListener = (newToast) => {
      if (newToast) {
        setToast(newToast);
        setIsVisible(true);

        const duration = newToast.duration ?? 3000;
        setTimeout(() => {
          setIsVisible(false);
          setTimeout(() => setToast(null), 300); // Wait for fade out animation
        }, duration);
      }
    };

    return () => {
      toastListener = null;
    };
  }, []);

  if (!toast) return null;

  const typeClass = styles[toast.type ?? 'info'];

  return (
    <div className={`${styles.toast} ${typeClass} ${isVisible ? styles.visible : ''}`}>
      <div className={styles.icon}>
        {toast.type === 'error' && (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {toast.type === 'warning' && (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {toast.type === 'success' && (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {(toast.type === 'info' || !toast.type) && (
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
      <span className={styles.message}>{toast.message}</span>
    </div>
  );
}
