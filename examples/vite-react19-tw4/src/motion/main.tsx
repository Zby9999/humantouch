import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionPage } from "./MotionPage";
import "./motion.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionPage />
  </StrictMode>,
);
