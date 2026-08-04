import React from "react";
import { createRoot } from "react-dom/client";
import ProjectTracker from "./ProjectTracker.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ProjectTracker />
  </React.StrictMode>
);
