import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// At `/shadow`, a panel rendered into a shadow root, above the app (ticket 137): the page of a bench scenario.
// Loaded there alone, and imported so, not by an import declaration: nothing above moves, nor where `init` adds its own.
if (location.pathname === "/shadow") {
  void import("./shadow/ShadowPanel").then(({ ShadowPanel }) => {
    const top = document.createElement("div");
    document.body.prepend(top);
    createRoot(top).render(
      <StrictMode>
        <ShadowPanel />
      </StrictMode>,
    );
  });
}
