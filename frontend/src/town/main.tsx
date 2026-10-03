import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TownApp } from "./TownApp";

const root = document.getElementById("town-root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <TownApp />
    </StrictMode>
  );
}
