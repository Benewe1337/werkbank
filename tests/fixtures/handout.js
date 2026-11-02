// Erzeugt ein synthetisches Handout-PDF wie die Vorlesungs-Handouts:
// A4 hochkant, zwei 16:9-Folienrahmen untereinander.
export const A4 = [0, 0, 595.276, 841.89];
export const FRAME = { x: 34, w: 527.58, h: 296.76 };
const TOP_Y = 482.85; // PDF-Koordinaten (Ursprung unten links)
const BOTTOM_Y = 61.6;

const frame = (y) => `0.6 g ${FRAME.x} ${y} ${FRAME.w} ${FRAME.h} re S`;
const content = (y) => `1 0 0 rg ${FRAME.x + 40} ${y + 60} 200 120 re f 0 0 1 rg ${FRAME.x + 300} ${y + 40} 150 80 re f`;

/**
 * Seiten-Spezifikation: "full" = zwei befüllte Folien, "half" = oben befüllt, unten leer,
 * "none" = Seite ohne Folienrahmen.
 */
export function makeHandoutPdf(mupdf, pages = ["full", "half", "none"]) {
  const doc = new mupdf.PDFDocument();
  for (const kind of pages) {
    let ops = "";
    if (kind === "full") ops = [frame(TOP_Y), content(TOP_Y), frame(BOTTOM_Y), content(BOTTOM_Y)].join("\n");
    if (kind === "half") ops = [frame(TOP_Y), content(TOP_Y), frame(BOTTOM_Y)].join("\n");
    if (kind === "none") ops = "0 0 0 rg 100 700 200 20 re f";
    const page = doc.addPage(A4, 0, {}, ops);
    doc.insertPage(-1, page);
  }
  return doc.saveToBuffer("compress").asUint8Array().slice();
}
