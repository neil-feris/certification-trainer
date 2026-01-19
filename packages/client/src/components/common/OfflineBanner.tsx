import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import styles from './OfflineBanner.module.css';

interface OfflineBannerProps {
  cachedQuestionCount: number;
}

export function OfflineBanner({ cachedQuestionCount }: OfflineBannerProps) {
  const { isOnline } = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className={styles.banner}>
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728m12.728 0L5.636 18.364m4.95-4.95a3 3 0 104.243-4.243m-4.243 4.243L14.828 9.12"
        />
      </svg>
      <span className={styles.message}>
        Offline mode — {cachedQuestionCount} questions available
      </span>
    </div>
  );
}
