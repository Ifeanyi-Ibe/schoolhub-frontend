"use client";

import { Component, type ReactNode } from "react";

/**
 * Renders its children, or nothing if they fail to load or render. For optional pieces (such as the offline banner):
 * a piece that cannot load must not take the rest of the page down with it.
 */
export class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
