import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import type { AuthResponse } from '@ace-prep/shared';
import styles from './AuthCallbackPage.module.css';

const API_BASE = '/api';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double execution in strict mode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    // Handle OAuth errors from Google
    if (errorParam) {
      const errorMessage = errorParam === 'access_denied' ? 'cancelled' : 'auth_failed';
      navigate(`/login?error=${errorMessage}`, { replace: true });
      return;
    }

    // No code present - redirect to login
    if (!code) {
      navigate('/login?error=auth_failed', { replace: true });
      return;
    }

    // Exchange code for tokens
    async function exchangeCode() {
      try {
        const response = await fetch(`${API_BASE}/auth/google-callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // For httpOnly cookie
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Authentication failed');
        }

        const data: AuthResponse = await response.json();

        // Store user and token in auth store
        login(data.user, data.tokens.accessToken);

        // Redirect to dashboard
        navigate('/dashboard', { replace: true });
      } catch (err) {
        console.error('OAuth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        // Delay redirect to show error briefly
        setTimeout(() => {
          navigate('/login?error=auth_failed', { replace: true });
        }, 2000);
      }
    }

    exchangeCode();
  }, [searchParams, login, navigate]);

  // Show error state if exchange failed
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.backgroundPattern} />
        <div className={styles.content}>
          <div className={styles.errorIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className={styles.errorText}>{error}</p>
          <p className={styles.redirectText}>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Default: loading state
  return (
    <div className={styles.container}>
      <div className={styles.backgroundPattern} />
      <div className={styles.content}>
        <div className={styles.spinner} />
        <p className={styles.statusText}>Signing you in...</p>
      </div>
    </div>
  );
}
