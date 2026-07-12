import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./styles/lobby-screens.css";
import "./styles/game-table.css";
import "./styles/game-opponents.css";
import "./styles/result-screen.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
