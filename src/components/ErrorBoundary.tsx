import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Fallback } from './Fallback';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      componentStack: null,
    };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private retry = () => {
    this.setState({ error: null, componentStack: null });
  };

  render() {
    if (this.state.error) {
      return (
        <Fallback
          error={this.state.error}
          componentStack={this.state.componentStack}
          onRetry={this.retry}
        />
      );
    }
    return this.props.children;
  }
}
