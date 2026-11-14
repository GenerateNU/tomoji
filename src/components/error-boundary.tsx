"use client";

import { Component, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Rendered in place of `children` once they throw. */
  fallback: (error: unknown) => ReactNode;
};

type ErrorBoundaryState = { error: unknown };

/**
 * Catches a throwing render so it takes down a section rather than the page.
 *
 * Convex's `useQuery` throws during render when the backend refuses the read,
 * which is routine: a row closes or stops being visible while someone has it
 * on screen. Without a boundary that reaches the route's `error.tsx` and
 * replaces everything.
 *
 * A boundary never resets itself. Give it a `key` that changes with whatever
 * it is showing, or unmount it, so the error clears on the next attempt.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown): void {
    console.error(error);
  }

  render(): ReactNode {
    return this.state.error === null ? this.props.children : this.props.fallback(this.state.error);
  }
}
