/**
 * Network error detection utilities
 */

/**
 * Check if an error is a network-related error (fetch failed, offline, etc.)
 */
export function isNetworkError(error: unknown): boolean {
  // TypeError: Failed to fetch - common network failure
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // NetworkError name
  if (error instanceof Error && error.name === 'NetworkError') {
    return true;
  }

  // AbortError from timeout or cancelled request
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  // Check for common network error messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('offline') ||
      message.includes('connection') ||
      message.includes('internet')
    ) {
      return true;
    }
  }

  return false;
}
