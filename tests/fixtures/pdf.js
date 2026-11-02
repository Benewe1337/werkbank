// Kleine Test-PDFs, zur Laufzeit mit MuPDF erzeugt (keine Binärdateien im Repo).
export { makeHandoutPdf } from "./handout.js";

/** PDF mit `pages` A4-Seiten; jede Seite trägt den Text "Seite N" (Helvetica). */
export function makeTextPdf(mupdf, pages = 3, label = "Seite") {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([0, 0, 595, 842], 0, { Font: { F1: font } }, `BT /F1 36 Tf 72 700 Td (${label} ${i}) Tj ET`);
    doc.insertPage(-1, page);
  }
  return doc.saveToBuffer("compress").asUint8Array().slice();
}

export function pageTexts(mupdf, bytes) {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const out = [];
  for (let i = 0; i < doc.countPages(); i++) out.push(doc.loadPage(i).toStructuredText().asText().trim());
  return out;
}
