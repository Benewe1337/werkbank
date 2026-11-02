// Gemeinsame Hilfen für die PDF-Werkzeuge (MuPDF.js). Ohne DOM, damit in Vitest testbar.

/**
 * Öffnet eine PDF und prüft, ob sie lesbar und (ggf. mit Passwort) entsperrt ist.
 * @param {typeof import("mupdf")} mupdf
 * @param {Uint8Array|ArrayBuffer} input
 * @param {{password?: string, label?: string}} [opts]
 * @returns {import("mupdf").PDFDocument}
 */
export function openPdf(mupdf, input, { password, label = "Die Datei" } = {}) {
  let doc;
  try {
    doc = mupdf.Document.openDocument(input instanceof ArrayBuffer ? new Uint8Array(input) : input, "application/pdf").asPDF();
  } catch {
    doc = null;
  }
  if (!doc) throw new Error(`${label} ist keine lesbare PDF.`);
  if (doc.needsPassword()) {
    if (!password) throw new Error(`${label} ist passwortgeschützt. Entferne den Schutz zuerst mit „PDF-Passwort“.`);
    if (!doc.authenticatePassword(password)) throw new Error("Das Passwort stimmt nicht.");
  }
  if (doc.countPages() === 0) throw new Error(`${label} enthält keine Seiten.`);
  return doc;
}

/** Speichert ein Dokument als kompakte PDF-Bytes. */
export function savePdf(doc, options = "garbage=compact,compress") {
  return doc.saveToBuffer(options).asUint8Array().slice();
}

/** Neue PDF mit den Seiten `indices` (0-basiert, Reihenfolge wie angegeben) aus `src`. */
export function copyPages(mupdf, src, indices) {
  const dst = new mupdf.PDFDocument();
  const graft = dst.newGraftMap();
  for (const i of indices) graft.graftPage(-1, src, i);
  return dst;
}

/**
 * Rendert eine Seite als Pixmap.
 * @param {number} scale Faktor gegenüber 72 dpi
 */
export function renderPage(mupdf, page, scale, alpha = false) {
  return page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, alpha, true);
}

/** Skalierung, damit die längere Seitenkante höchstens `maxPx` Pixel hat. */
export function fitScale(bounds, maxPx) {
  const w = bounds[2] - bounds[0];
  const h = bounds[3] - bounds[1];
  return Math.min(maxPx / Math.max(w, h, 1), 4);
}

/** Kleines Vorschaubild (PNG) einer Seite. */
export function thumbnail(mupdf, page, maxPx = 220) {
  const pix = renderPage(mupdf, page, fitScale(page.getBounds(), maxPx));
  try {
    return { png: pix.asPNG().slice(), width: pix.getWidth(), height: pix.getHeight() };
  } finally {
    pix.destroy?.();
  }
}

/** Fortlaufende Seitennummern wie "1-3" oder "5" für Dateinamen. */
export function rangeLabel(indices) {
  if (indices.length === 0) return "";
  const first = indices[0] + 1;
  const last = indices[indices.length - 1] + 1;
  const contiguous = indices.every((p, i) => i === 0 || p === indices[i - 1] + 1);
  if (indices.length === 1) return String(first);
  return contiguous ? `${first}-${last}` : `${first}-${last}-auswahl`;
}

/** Ziffern auf feste Breite auffüllen, damit Dateien sortiert bleiben ("seite-07"). */
export function padNumber(n, total) {
  return String(n).padStart(String(total).length, "0");
}
