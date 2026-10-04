import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SessionGate from "./SessionGate";
import { KALCI_LOGO } from "./kalciLogo";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionGate />
  </StrictMode>
);

requestAnimationFrame(() => {
  const logo = document.querySelector<HTMLDivElement>(".topbar .crest");
  if (logo) {
    const img = document.createElement("img");
    img.src = KALCI_LOGO;
    img.alt = "KALCI Citation Generator";
    img.className = "brand-logo";
    logo.replaceWith(img);
  }
  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (favicon) favicon.href = KALCI_LOGO;
});
