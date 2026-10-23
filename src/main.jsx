import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./noteey.css";
import "./codex-sidebar.css";
import "./editor-properties.css";
import "./top-chrome.css";
import "./article-manager.css";
import "./media-library.css";
import "./blog-source-overrides.css";
import "./home.css";
import "./design-system.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
