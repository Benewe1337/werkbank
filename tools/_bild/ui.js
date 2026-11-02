// Kleine UI-Hilfen, die mehrere Bild-Werkzeuge teilen (Qualitätsregler, „noch einmal“).

/** Zeigt den Wert eines Reglers neben dem Label an. */
export function bindRangeValue(range, output, suffix = "") {
  const show = () => (output.textContent = `${range.value}${suffix}`);
  range.addEventListener("input", show);
  show();
}

/**
 * Merkt sich die zuletzt abgelegten Dateien, damit man sie mit geänderten Einstellungen erneut
 * verarbeiten kann, ohne sie noch einmal auszuwählen.
 * @param {HTMLButtonElement} button
 * @param {(files: File[]) => unknown} run
 */
export function repeatable(button, run) {
  let last = [];
  button.hidden = true;
  button.addEventListener("click", () => last.length && run(last));
  return (files) => {
    last = files;
    button.hidden = false;
    return run(files);
  };
}
