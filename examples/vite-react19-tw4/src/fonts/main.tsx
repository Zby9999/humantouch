import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FontsPage } from "./FontsPage";
import "./fonts.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FontsPage />
  </StrictMode>,
);
