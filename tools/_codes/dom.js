// Kleine DOM-Helfer für Codes, Daten und Archive (ohne innerHTML).

/** Element mit Klasse, Attributen und Kindern bauen. Text wird immer als Text eingefügt. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== "string") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

/** Text in die Zwischenablage; meldet Erfolg kurz am Button. */
export async function copyText(text, button) {
  const label = button?.textContent;
  try {
    await navigator.clipboard.writeText(text);
    if (button) button.textContent = "Kopiert";
  } catch {
    if (button) button.textContent = "Kopieren nicht möglich";
  }
  if (button) setTimeout(() => (button.textContent = label), 1600);
}

/** Button „Kopieren“, der beim Klick getText() kopiert. */
export function copyButton(getText, label = "Kopieren", ariaLabel = undefined) {
  const button = h("button", { type: "button", class: "button ghost", text: label, "aria-label": ariaLabel });
  button.addEventListener("click", () => copyText(getText(), button));
  return button;
}

/** Wartet ms nach der letzten Änderung, bevor fn läuft. */
export function debounce(fn, ms = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
