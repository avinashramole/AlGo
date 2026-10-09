import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { isNativeHybrid } from "./lib/hybrid";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { MarketProvider } from "./context/MarketContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";
import "./login.css";

const Router = isNativeHybrid() ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Router>
        <ThemeProvider>
          <AuthProvider>
            <MarketProvider>
              <App />
            </MarketProvider>
          </AuthProvider>
        </ThemeProvider>
      </Router>
    </ErrorBoundary>
  </StrictMode>,
);
