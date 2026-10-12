// Local art review only. This entry is not imported by the production application.
import React from "react";
import { createRoot } from "react-dom/client";
import EggGame from "../src/egg/EggGame";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><EggGame onClose={() => window.location.reload()} /></React.StrictMode>
);
