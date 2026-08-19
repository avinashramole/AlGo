import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: "" };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || "The desk failed to load." };
  }

  render() {
    if (!this.state.message) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", padding: 24, fontFamily: "sans-serif", background: "#fff7ed", color: "#9a3412" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>T2S could not load</h1>
        <p style={{ marginTop: 12, lineHeight: 1.5 }}>{this.state.message}</p>
        <p style={{ marginTop: 12, lineHeight: 1.5 }}>
          In Chrome type <b>http://localhost:5173</b> and press Enter. Keep npm start open. Then refresh.
        </p>
      </div>
    );
  }
}
