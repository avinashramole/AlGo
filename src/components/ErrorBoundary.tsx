import { Component, type ReactNode } from "react";
import { deskLoadHelp, publicDeskError } from "../lib/liveSite";

export class ErrorBoundary extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: "" };

  static getDerivedStateFromError(error: Error) {
    const message = error.message || "The desk failed to load.";
    if (/ResizeObserver loop/i.test(message)) return { message: "" };
    return { message };
  }

  render() {
    if (!this.state.message) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", padding: 24, fontFamily: "sans-serif", background: "#fff7ed", color: "#9a3412" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>T2S could not load</h1>
        <p style={{ marginTop: 12, lineHeight: 1.5 }}>{publicDeskError(this.state.message)}</p>
        <p style={{ marginTop: 12, lineHeight: 1.5 }}>{deskLoadHelp(this.state.message)}</p>
      </div>
    );
  }
}
