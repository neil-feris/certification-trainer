import styles from './AuthLoader.module.css';

interface AuthLoaderProps {
  message?: string;
}

/**
 * Full-screen loading component for authentication state verification.
 * Used at app level to show loading while initial auth state is being determined.
 */
export function AuthLoader({ message = 'Loading...' }: AuthLoaderProps) {
  return (
    <div className={styles.container}>
      <div className={styles.backgroundPattern} />
      <div className={styles.content}>
        <div className={styles.logoIcon}>
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="40" height="40" rx="8" fill="url(#authLoaderGradient)" />
            <path
              d="M16 24L22 30L32 18"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="authLoaderGradient" x1="4" y1="4" x2="44" y2="44">
                <stop stopColor="#00d4aa" />
                <stop offset="1" stopColor="#0099cc" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className={styles.spinnerContainer}>
          <div className={styles.spinner} />
        </div>
        <p className={styles.message}>{message}</p>
      </div>
    </div>
  );
}
