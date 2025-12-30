import { Component, ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      showDetails: false,
    });
  };

  toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={styles.container}>
          <div className={styles.icon}>&#9888;</div>
          <h2 className={styles.title}>Something went wrong</h2>
          <p className={styles.message}>
            An unexpected error occurred. Click the button below to try again.
            If the problem persists, try refreshing the page.
          </p>
          <div className={styles.actions}>
            <button className={styles.retryBtn} onClick={this.handleReset}>
              Try Again
            </button>
          </div>

          {this.state.error && (
            <div className={styles.details}>
              <button
                className={styles.detailsToggle}
                onClick={this.toggleDetails}
              >
                {this.state.showDetails ? '▼' : '▶'} Error Details
              </button>
              {this.state.showDetails && (
                <div className={styles.detailsContent}>
                  <div className={styles.errorName}>{this.state.error.name}</div>
                  <div className={styles.errorMessage}>{this.state.error.message}</div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
