// Text aus einer PDF holen (eingebetteter Text, keine Texterkennung).
import { openPdf } from "../_pdf/pdf.js";

/** Unter so vielen sichtbaren Zeichen pro Seite ist die PDF vermutlich gescannt. */
export const SCAN_THRESHOLD = 5;

/** Zusammenhängender Text einer Seite; Zeilenumbrüche bleiben, Leerraum am Rand fällt weg. */
export function cleanPageText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param {typeof import("mupdf")} mupdf
 * @param {Uint8Array} input
 * @returns {{pages: string[], text: string, chars: number, likelyScanned: boolean}}
 */
export function extractText(mupdf, input) {
  const doc = openPdf(mupdf, input);
  const pages = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const stext = doc.loadPage(i).toStructuredText("preserve-whitespace,dehyphenate");
    pages.push(cleanPageText(stext.asText()));
  }
  return { pages, ...summarize(pages) };
}

/** Gesamttext mit Seitentrennern und Einschätzung, ob überhaupt Text eingebettet ist. */
export function summarize(pages) {
  const chars = pages.reduce((sum, p) => sum + p.replace(/\s/g, "").length, 0);
  const text =
    pages.length === 1 ? pages[0] : pages.map((p, i) => `── Seite ${i + 1} ──\n\n${p}`).join("\n\n");
  return { text, chars, likelyScanned: chars < SCAN_THRESHOLD * pages.length };
}
