// Seiten einer PDF umsortieren, drehen und löschen.
import { openPdf, savePdf } from "../_pdf/pdf.js";

/** Drehung auf 0/90/180/270 normalisieren. */
export function normalizeRotation(deg) {
  return (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
}

/**
 * @param {typeof import("mupdf")} mupdf
 * @param {Uint8Array} input
 * @param {{index: number, rotate?: number}[]} edits neue Reihenfolge; `index` 0-basiert, `rotate` zusätzliche Drehung in Grad
 * @returns {{bytes: Uint8Array, pages: number}}
 */
export function editPages(mupdf, input, edits) {
  if (edits.length === 0) throw new Error("Mindestens eine Seite muss übrig bleiben.");
  const doc = openPdf(mupdf, input);
  const count = doc.countPages();
  for (const { index } of edits) {
    if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error(`Seite ${index + 1} gibt es nicht.`);
  }
  // Ausgangsdrehung vor dem Umsortieren merken (Rotate kann geerbt sein).
  const baseRotation = edits.map(({ index }) => doc.findPage(index).getInheritable("Rotate").valueOf() || 0);
  doc.rearrangePages(edits.map((e) => e.index));
  edits.forEach(({ rotate = 0 }, i) => {
    const total = normalizeRotation(Number(baseRotation[i]) + rotate);
    doc.findPage(i).put("Rotate", total);
  });
  return { bytes: savePdf(doc), pages: doc.countPages() };
}
