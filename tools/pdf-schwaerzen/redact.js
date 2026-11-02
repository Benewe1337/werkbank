// Suchbegriffe in einer PDF finden und echt schwärzen: Der Text unter den Balken wird entfernt,
// Bildbereiche darunter werden übermalt.
import { openPdf, savePdf } from "../_pdf/pdf.js";

/** Eine Zeile pro Begriff; leere Zeilen und doppelte Begriffe fallen weg. */
export function parseTerms(input) {
  const seen = new Set();
  const out = [];
  for (const raw of String(input ?? "").split(/\r?\n/)) {
    const term = raw.trim();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
  }
  return out;
}

/**
 * Fundstellen eines Begriffs in einer Zeile.
 * @returns {[number, number][]} Start-/End-Index (exklusiv) je Treffer, ohne Überlappung
 */
export function findInLine(line, term, caseSensitive) {
  const hay = caseSensitive ? line : line.toLocaleLowerCase("de");
  const needle = caseSensitive ? term : term.toLocaleLowerCase("de");
  // toLocaleLowerCase kann die Länge ändern (selten, z. B. „İ“); dann lieber exakt suchen.
  if (hay.length !== line.length || needle.length !== term.length) return findInLine(line, term, true);
  const hits = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0 || !needle) break;
    hits.push([at, at + needle.length]);
    from = at + needle.length;
  }
  return hits;
}

/** Zeilen einer Seite mit Text und Quad je Zeichen. */
function pageLines(page) {
  const lines = [];
  let current = null;
  page.toStructuredText("preserve-whitespace").walk({
    beginLine() {
      current = { text: "", quads: [] };
    },
    onChar(c, _origin, _font, _size, quad) {
      // Ein Zeichen kann aus mehreren UTF-16-Einheiten bestehen; Quad für jede Einheit merken.
      for (let k = 0; k < c.length; k++) current.quads.push(quad);
      current.text += c;
    },
    endLine() {
      if (current) lines.push(current);
      current = null;
    },
  });
  return lines;
}

/** Umschließendes Quad aus mehreren Zeichen-Quads. */
export function boundingQuad(quads) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of quads) {
    for (let i = 0; i < 8; i += 2) {
      x0 = Math.min(x0, q[i]);
      x1 = Math.max(x1, q[i]);
      y0 = Math.min(y0, q[i + 1]);
      y1 = Math.max(y1, q[i + 1]);
    }
  }
  return [x0, y0, x1, y0, x0, y1, x1, y1];
}

/** Alle Treffer einer Seite als Quads, dazu die Anzahl je Begriff. */
export function findOnPage(page, terms, caseSensitive) {
  const quads = [];
  const counts = Object.fromEntries(terms.map((t) => [t, 0]));
  for (const line of pageLines(page)) {
    for (const term of terms) {
      for (const [start, end] of findInLine(line.text, term, caseSensitive)) {
        quads.push(boundingQuad(line.quads.slice(start, end)));
        counts[term]++;
      }
    }
  }
  return { quads, counts };
}

/**
 * @param {typeof import("mupdf")} mupdf
 * @param {Uint8Array} input
 * @param {string[]} terms
 * @param {{caseSensitive?: boolean}} [opts]
 * @returns {{bytes: Uint8Array|null, total: number, pages: {page: number, hits: number, counts: Record<string, number>}[]}}
 */
export function redactPdf(mupdf, input, terms, { caseSensitive = false } = {}) {
  if (terms.length === 0) throw new Error("Bitte mindestens einen Suchbegriff eingeben.");
  const doc = openPdf(mupdf, input);
  const pages = [];
  let total = 0;
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    const { quads, counts } = findOnPage(page, terms, caseSensitive);
    if (quads.length === 0) continue;
    const annot = page.createAnnotation("Redact");
    annot.setQuadPoints(quads);
    page.applyRedactions(
      true,
      mupdf.PDFPage.REDACT_IMAGE_PIXELS,
      mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
      mupdf.PDFPage.REDACT_TEXT_REMOVE,
    );
    pages.push({ page: i + 1, hits: quads.length, counts });
    total += quads.length;
  }
  if (total === 0) return { bytes: null, total, pages };
  // garbage entfernt die alten, nicht mehr referenzierten Inhalts-Streams samt Klartext.
  return { bytes: savePdf(doc, "garbage=4,compress"), total, pages };
}

/** Prüft nach dem Schwärzen, ob ein Begriff noch irgendwo als Text vorkommt. */
export function remainingHits(mupdf, bytes, terms, { caseSensitive = false } = {}) {
  const doc = openPdf(mupdf, bytes);
  let n = 0;
  for (let i = 0; i < doc.countPages(); i++) n += findOnPage(doc.loadPage(i), terms, caseSensitive).quads.length;
  return n;
}
