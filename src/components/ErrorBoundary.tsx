import React, { type ReactNode } from "react";

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const { error } = this.state;
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-background p-8 text-foreground">
        <div className="flex max-w-lg flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-8 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              Nexum encountered an unexpected error. Reloading will restore the app to a working state.
            </p>
          </div>

          {error.message && (
            <pre className="w-full overflow-x-auto rounded-md border border-border/60 bg-muted/50 px-4 py-3 text-left font-mono text-xs text-muted-foreground">
              {error.message}
            </pre>
          )}

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Reload Nexum
          </button>
        </div>
      </div>
    );
  }
}
