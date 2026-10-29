import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BigPage } from "./BigPage";
import "../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BigPage />
  </StrictMode>,
);
