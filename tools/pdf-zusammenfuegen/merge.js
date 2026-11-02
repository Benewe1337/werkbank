// Fügt mehrere PDFs zu einem zusammen (Seiten werden samt Ressourcen übernommen).

/**
 * @param {typeof import("mupdf")} mupdf
 * @param {Uint8Array[]} inputs
 * @returns {{bytes: Uint8Array, pages: number}}
 */
export function mergePdfs(mupdf, inputs) {
  if (inputs.length === 0) throw new Error("Keine Dateien ausgewählt.");
  const dst = new mupdf.PDFDocument();
  inputs.forEach((input, i) => {
    let src;
    try {
      src = mupdf.Document.openDocument(input, "application/pdf").asPDF();
    } catch {
      src = null;
    }
    if (!src) throw new Error(`Datei ${i + 1} ist keine lesbare PDF.`);
    if (src.needsPassword()) throw new Error(`Datei ${i + 1} ist passwortgeschützt.`);
    const graft = dst.newGraftMap();
    for (let p = 0; p < src.countPages(); p++) graft.graftPage(-1, src, p);
  });
  const bytes = dst.saveToBuffer("garbage=compact,compress").asUint8Array().slice();
  return { bytes, pages: dst.countPages() };
}
