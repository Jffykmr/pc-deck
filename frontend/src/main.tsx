import { MotionConfig } from "motion/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { startDiagnostics } from "./lib/diag";
import { DeckProvider } from "./store";

startDiagnostics();
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <DeckProvider>
          <App />
        </DeckProvider>
      </HashRouter>
    </MotionConfig>
  </React.StrictMode>,
);
