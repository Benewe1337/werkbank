// PDF in mehrere Dateien aufteilen oder Seiten herausziehen.
import { parsePageRanges } from "../../src/shared/format.js";
import { copyPages, openPdf, rangeLabel, savePdf } from "../_pdf/pdf.js";

/**
 * Berechnet die Seitengruppen (0-basiert) für einen Modus.
 * - "single": jede Seite einzeln
 * - "every": je `n` Seiten
 * - "ranges": Gruppen durch Komma/Semikolon getrennt, z. B. "1-3, 4-6"
 * - "extract": alle angegebenen Seiten in einer Datei, z. B. "1, 3-5"
 * @returns {number[][]}
 */
export function splitGroups(mode, pageCount, { n = 1, ranges = "" } = {}) {
  const all = [...Array(pageCount).keys()];
  switch (mode) {
    case "single":
      return all.map((p) => [p]);
    case "every": {
      const size = Number(n);
      if (!Number.isInteger(size) || size < 1) throw new Error("Bitte eine ganze Zahl ab 1 angeben.");
      const groups = [];
      for (let i = 0; i < pageCount; i += size) groups.push(all.slice(i, i + size));
      return groups;
    }
    case "ranges": {
      const parts = String(ranges).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) throw new Error("Bitte Bereiche angeben, z. B. „1-3, 4-6“.");
      return parts.map((part) => parsePageRanges(part, pageCount));
    }
    case "extract": {
      if (!String(ranges).trim()) throw new Error("Bitte Seiten angeben, z. B. „1, 3-5“.");
      return [parsePageRanges(ranges, pageCount)];
    }
    default:
      throw new Error(`Unbekannter Modus: ${mode}`);
  }
}

/**
 * @param {typeof import("mupdf")} mupdf
 * @param {Uint8Array} input
 * @returns {{pagesIn: number, parts: {bytes: Uint8Array, label: string, pages: number}[]}}
 */
export function splitPdf(mupdf, input, mode, opts = {}) {
  const src = openPdf(mupdf, input);
  const pagesIn = src.countPages();
  const groups = splitGroups(mode, pagesIn, opts);
  const parts = groups.map((indices) => ({
    bytes: savePdf(copyPages(mupdf, src, indices)),
    label: rangeLabel(indices),
    pages: indices.length,
  }));
  return { pagesIn, parts };
}
