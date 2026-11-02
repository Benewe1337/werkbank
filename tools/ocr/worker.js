import { serve } from "../../src/shared/worker-host.js";

// MuPDF rendert PDF-Seiten und fügt die durchsuchbaren Einzelseiten wieder zusammen.
// Die Erkennung selbst läuft im eigenen Worker von tesseract.js.
serve(async () => {
  const mupdf = await import("mupdf");
  const { openPdf, renderPage } = await import("./render.js");
  const { mergePdfs } = await import("../pdf-zusammenfuegen/merge.js");
  let doc = null;
  return {
    open({ buffer }) {
      doc?.destroy?.();
      doc = openPdf(mupdf, new Uint8Array(buffer));
      return { pages: doc.countPages() };
    },
    render({ index }, ctx) {
      if (!doc) throw new Error("Kein PDF geöffnet.");
      const result = renderPage(mupdf, doc, index);
      ctx.transfer([result.png.buffer]);
      return result;
    },
    close() {
      doc?.destroy?.();
      doc = null;
    },
    merge({ pdfs }, ctx) {
      const result = mergePdfs(mupdf, pdfs);
      ctx.transfer([result.bytes.buffer]);
      return result;
    },
  };
});
