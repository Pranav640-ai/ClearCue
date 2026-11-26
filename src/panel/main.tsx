import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PanelApp } from "./PanelApp";
import "./panel.css";

const container = document.getElementById("root");
if (!container) throw new Error("ClearCue panel: #root container is missing.");

createRoot(container).render(
  <StrictMode>
    <PanelApp />
  </StrictMode>,
);
