// PDF-Seiten als PNG oder JPG rendern.
import { parsePageRanges } from "../../src/shared/format.js";
import { openPdf, padNumber, renderPage } from "../_pdf/pdf.js";

export const DPI_CHOICES = [72, 150, 300];
export const JPEG_QUALITY = 90;
/** Schutz vor Speicherüberlauf: mehr Pixel pro Seite rendert der Browser nicht zuverlässig. */
export const MAX_PIXELS = 60_000_000;

/** Seitenauswahl (0-basiert) prüfen; leer heißt alle Seiten. */
export function selectPages(input, pageCount) {
  const pages = parsePageRanges(input, pageCount);
  return [...new Set(pages)];
}

/** Dateiname für eine Seite, z. B. "bericht-seite-03.png". */
export function pageFileName(base, pageIndex, pageCount, format) {
  return `${base}-seite-${padNumber(pageIndex + 1, pageCount)}.${format === "jpg" ? "jpg" : "png"}`;
}

/**
 * Rendert eine Seite.
 * @param {typeof import("mupdf")} mupdf
 * @param {import("mupdf").PDFDocument} doc
 * @returns {{bytes: Uint8Array, width: number, height: number}}
 */
export function renderToImage(mupdf, doc, pageIndex, { dpi = 150, format = "png" } = {}) {
  const page = doc.loadPage(pageIndex);
  const [x0, y0, x1, y1] = page.getBounds();
  const scale = dpi / 72;
  if ((x1 - x0) * scale * (y1 - y0) * scale > MAX_PIXELS) {
    throw new Error(`Seite ${pageIndex + 1} ist für ${dpi} dpi zu groß. Wähle eine kleinere Auflösung.`);
  }
  // PNG mit Transparenz wäre bei PDFs meist unerwartet: weißer Hintergrund wie im Viewer.
  const pix = renderPage(mupdf, page, scale);
  try {
    pix.setResolution(dpi, dpi);
    const bytes = format === "jpg" ? pix.asJPEG(JPEG_QUALITY) : pix.asPNG();
    return { bytes: bytes.slice(), width: pix.getWidth(), height: pix.getHeight() };
  } finally {
    pix.destroy?.();
  }
}

/** Öffnet die PDF und liefert die Seitenzahl (für die Bereichsprüfung). */
export function countPdfPages(mupdf, input) {
  return openPdf(mupdf, input).countPages();
}
