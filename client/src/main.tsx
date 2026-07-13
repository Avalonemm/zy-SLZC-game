import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./styles/visual-tokens.css";
import "./styles/lobby-screens.css";
import "./styles/game-table.css";
import "./styles/game-opponents.css";
import "./styles/game-ui-tuning.css";
import "./styles/game-skill-presentations.css";
import "./styles/game-role-call.css";
import "./styles/game-compact.css";
import "./styles/result-screen.css";
import "./styles/onboarding.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
