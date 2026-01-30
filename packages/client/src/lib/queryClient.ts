import { QueryClient } from '@tanstack/react-query';
import { RateLimitError, AuthError } from '../api/client';

/**
 * Custom retry function that prevents retrying auth and rate limit errors.
 * These errors should not be retried as they won't succeed and will only
 * contribute to rate limit exhaustion.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  // Never retry auth errors - session is expired, user needs to re-login
  if (error instanceof AuthError) {
    return false;
  }

  // Never retry rate limit errors - will only make things worse
  if (error instanceof RateLimitError) {
    return false;
  }

  // For other errors, retry once (consistent with previous behavior)
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: shouldRetry,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: shouldRetry,
      networkMode: 'offlineFirst',
    },
  },
});
