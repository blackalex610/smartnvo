import React from 'react';
import { logError } from '../utils/errorLogger';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logError(error, {
      source: 'react-error-boundary',
      level: 'error',
      componentStack: errorInfo.componentStack,
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Нещо се обърка</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Възникна неочаквана грешка. Екипът е уведомен автоматично.
            </p>
            <button
              type="button"
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              onClick={() => window.location.reload()}
            >
              Презареди
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
