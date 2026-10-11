import React from "react";
import ReactDOM from "react-dom/client";
import { EnhancedApp } from "./EnhancedApp";

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <EnhancedApp />
  </React.StrictMode>
);
