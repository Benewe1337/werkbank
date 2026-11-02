// Reine Logik der Texterkennung (ohne DOM, in Node testbar).

export const LANGUAGES = {
  deu: "Deutsch",
  eng: "Englisch",
  "deu+eng": "Deutsch und Englisch",
};

/** Auflösung, mit der PDF-Seiten für die Erkennung gerendert werden. */
export const PDF_DPI = 300;
/** Obergrenze für die längere Bildseite, damit große Formate den Speicher nicht sprengen. */
export const MAX_SIDE_PX = 5000;

export function checkLanguage(lang) {
  if (!Object.hasOwn(LANGUAGES, lang)) throw new Error(`Unbekannte Sprache: ${lang}`);
  return lang;
}

/** Bild, PDF oder nichts, nach MIME-Typ und Endung. */
export function fileKind(file) {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/^image\/(png|jpeg|webp)$/.test(type) || /\.(png|jpe?g|webp)$/.test(name)) return "image";
  return null;
}

/**
 * Renderauflösung für eine PDF-Seite: Ziel-dpi, aber höchstens MAX_SIDE_PX an der längeren Seite.
 * @param {number} widthPt Seitenbreite in Punkt (1/72 Zoll)
 * @param {number} heightPt
 */
export function renderDpi(widthPt, heightPt, dpi = PDF_DPI, maxSide = MAX_SIDE_PX) {
  const longest = Math.max(widthPt, heightPt) / 72;
  if (!(longest > 0)) throw new Error("Seite hat keine Größe.");
  return Math.max(72, Math.min(dpi, Math.floor(maxSide / longest)));
}

/** Seiten zu einem Text zusammensetzen; ab zwei Seiten mit Seitenangabe. */
export function joinPages(texts) {
  const clean = texts.map((t) => String(t ?? "").replace(/[ \t]+\n/g, "\n").trim());
  if (clean.length === 1) return clean[0] ? `${clean[0]}\n` : "";
  return clean.map((t, i) => `--- Seite ${i + 1} ---\n\n${t}`).join("\n\n").concat("\n");
}

/** Fortschritt in Prozent für die Statuszeile. */
export function percent(progress) {
  return `${Math.round(Math.min(1, Math.max(0, progress || 0)) * 100)} %`;
}
