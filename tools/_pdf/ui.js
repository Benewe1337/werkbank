// Kleine UI-Hilfen, die mehrere PDF-Werkzeuge teilen (ergänzt src/shared/ui.js).
import { createJobList } from "../../src/shared/ui.js";

/** Runder Knopf mit Symbol und zugänglichem Namen. */
export function iconButton(text, label, disabled, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon-button";
  b.textContent = text;
  b.ariaLabel = label;
  b.title = label;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

/**
 * Leert die Ergebnisliste und legt eine neue an, damit „Alle als ZIP“ nur die Dateien
 * des letzten Durchlaufs enthält.
 * @param {HTMLElement} el #jobs
 */
export function freshJobList(el) {
  el.previousElementSibling?.classList.contains("jobs-zip") && el.previousElementSibling.remove();
  const next = el.cloneNode(false);
  next.className = "";
  el.replaceWith(next);
  return { el: next, jobs: createJobList(next) };
}

/** Elemente nur für den passenden Modus zeigen: data-mode="a b" am Element. */
export function showForMode(root, mode) {
  for (const el of root.querySelectorAll("[data-mode]")) el.hidden = !el.dataset.mode.split(" ").includes(mode);
}

/** Verschiebt ein Element in einer Liste (gibt eine neue Liste zurück). */
export function moveItem(list, from, to) {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export const pdfBlob = (bytes) => new Blob([bytes], { type: "application/pdf" });
