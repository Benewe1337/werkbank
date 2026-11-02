import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const mupdf = await import("mupdf");
  const { openPdf } = await import("../_pdf/pdf.js");
  const { renderToImage, selectPages } = await import("./render.js");
  return {
    /** Rendert die gewählten Seiten nacheinander und meldet jede einzeln als Fortschritt. */
    render({ buffer, dpi, format, pages }, ctx) {
      const doc = openPdf(mupdf, new Uint8Array(buffer));
      const count = doc.countPages();
      const selected = selectPages(pages, count);
      selected.forEach((index, i) => {
        const image = renderToImage(mupdf, doc, index, { dpi, format });
        ctx.progress({ index, done: i + 1, total: selected.length, count, ...image });
      });
      return { count, rendered: selected.length };
    },
  };
});
