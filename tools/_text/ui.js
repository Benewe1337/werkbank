// DOM-Bausteine der Text-Werkzeuge: Textausgabe mit Kopieren-Knopf und nachladbare #engine-Anzeige.

/** Knopf, der getText() in die Zwischenablage legt und kurz „Kopiert“ zeigt. */
export function copyButton(getText, label = "Text kopieren") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button ghost";
  button.textContent = label;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getText());
      button.textContent = "Kopiert";
    } catch {
      button.textContent = "Kopieren nicht erlaubt";
    }
    setTimeout(() => (button.textContent = label), 2000);
  });
  return button;
}

/**
 * Hängt eine Textausgabe (schreibgeschützte Textarea + Kopieren) an einen Job an.
 * Textarea statt <pre>, damit man markieren und scrollen kann; der Inhalt wird nie als HTML gesetzt.
 */
export function attachText(job, text, label = "Erkannter Text") {
  const box = document.createElement("div");
  box.className = "text-out";
  const field = document.createElement("label");
  field.className = "field";
  field.append(label);
  const area = document.createElement("textarea");
  area.readOnly = true;
  area.value = text;
  area.spellcheck = false;
  field.append(area);
  box.append(field, copyButton(() => area.value));
  job.el.append(box);
  return area;
}

/**
 * #engine erst anlegen, wenn die WebAssembly wirklich geladen wird (große Downloads nur bei Bedarf).
 * Liefert set(state, text); state ist "loading" | "ready" | "error".
 */
export function lazyEngine(anchor) {
  let el = null;
  return function set(state, text) {
    if (!el) {
      el = document.createElement("span");
      el.id = "engine";
      el.className = "engine";
      el.setAttribute("role", "status");
      anchor.append(el);
    }
    el.dataset.state = state;
    el.textContent = text;
  };
}
