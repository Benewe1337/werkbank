// PDF-Seiten mit MuPDF zu Bildern rendern (für die Texterkennung gescannter PDFs).
import { renderDpi } from "./ocr.js";

/** Öffnet ein PDF; wirft verständliche Fehler bei kaputten oder geschützten Dateien. */
export function openPdf(mupdf, bytes) {
  let doc;
  try {
    doc = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch {
    throw new Error("Keine lesbare PDF-Datei.");
  }
  if (doc.needsPassword()) throw new Error("Die PDF ist passwortgeschützt.");
  if (doc.countPages() === 0) throw new Error("Die PDF hat keine Seiten.");
  return doc;
}

/**
 * Rendert eine Seite als PNG (RGB, weißer Hintergrund).
 * @returns {{png: Uint8Array, dpi: number, width: number, height: number}}
 */
export function renderPage(mupdf, doc, index) {
  const page = doc.loadPage(index);
  const [x0, y0, x1, y1] = page.getBounds();
  const dpi = renderDpi(x1 - x0, y1 - y0);
  const pixmap = page.toPixmap(mupdf.Matrix.scale(dpi / 72, dpi / 72), mupdf.ColorSpace.DeviceRGB, false, true);
  try {
    return { png: pixmap.asPNG().slice(), dpi, width: pixmap.getWidth(), height: pixmap.getHeight() };
  } finally {
    pixmap.destroy?.();
    page.destroy?.();
  }
}
