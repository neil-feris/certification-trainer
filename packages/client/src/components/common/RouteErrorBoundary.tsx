import { Component, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './ErrorBoundary.module.css';

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[RouteErrorBoundary] Route crashed:', error);
    console.error('[RouteErrorBoundary] Component stack:', errorInfo.componentStack);
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
      return (
        <div className={`${styles.container} ${styles.routeContainer}`}>
          <div className={`${styles.icon} ${styles.routeIcon}`}>&#10060;</div>
          <h2 className={styles.title}>Page Failed to Load</h2>
          <p className={styles.message}>
            This page encountered an error and couldn't be displayed.
            You can try again or return to the dashboard.
          </p>
          <div className={styles.actions}>
            <button className={styles.retryBtn} onClick={this.handleReset}>
              Try Again
            </button>
            <Link to="/dashboard" className={styles.dashboardBtn} onClick={this.handleReset}>
              Go to Dashboard
            </Link>
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
