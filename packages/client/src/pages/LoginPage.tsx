import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import styles from './LoginPage.module.css';

const API_BASE = '/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for error params from OAuth callback
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      switch (errorParam) {
        case 'session_expired':
          setError('Your session has expired. Please sign in again.');
          break;
        case 'auth_failed':
          setError('Authentication failed. Please try again.');
          break;
        case 'cancelled':
          setError('Sign in was cancelled.');
          break;
        default:
          setError('An error occurred. Please try again.');
      }
    }
  }, [searchParams]);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/auth/google-url`);
      if (!response.ok) {
        throw new Error('Failed to get sign in URL');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch {
      setError('Unable to initiate sign in. Please try again.');
      setIsLoading(false);
    }
  };

  // Show loading while checking initial auth state
  if (authLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Checking authentication...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.backgroundPattern} />

      <div className={styles.loginCard}>
        <div className={styles.logoSection}>
          <div className={styles.logoIcon}>
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="4" width="40" height="40" rx="8" fill="url(#logoGradient)" />
              <path
                d="M16 24L22 30L32 18"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="logoGradient" x1="4" y1="4" x2="44" y2="44">
                  <stop stopColor="#00d4aa" />
                  <stop offset="1" stopColor="#0099cc" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className={styles.appTitle}>Certification Trainer</h1>
          <p className={styles.tagline}>Master your certification exams with AI-powered practice</p>
        </div>

        {error && (
          <div className={styles.errorBanner}>
            <svg className={styles.errorIcon} viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <button className={styles.googleButton} onClick={handleGoogleSignIn} disabled={isLoading}>
          {isLoading ? (
            <div className={styles.buttonSpinner} />
          ) : (
            <svg className={styles.googleIcon} viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          <span>{isLoading ? 'Signing in...' : 'Sign in with Google'}</span>
        </button>

        <div className={styles.features}>
          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>📚</span>
            <span>Practice exams with spaced repetition</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>🎯</span>
            <span>AI-generated questions by topic</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>📊</span>
            <span>Track progress across devices</span>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <span>Sync your progress across all devices</span>
      </footer>
    </div>
  );
}
