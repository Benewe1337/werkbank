import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const mupdf = await import("mupdf");
  const { openPdf, thumbnail } = await import("../_pdf/pdf.js");
  const { editPages } = await import("./pages.js");
  /** Geöffnete Dokumente für Vorschaubilder, je Ladevorgang eine id. */
  const open = new Map();
  let nextId = 1;
  return {
    open({ buffer }) {
      const bytes = new Uint8Array(buffer);
      const doc = openPdf(mupdf, bytes);
      const id = nextId++;
      open.set(id, { doc, bytes });
      return { id, pages: doc.countPages() };
    },
    thumb({ id, index }, ctx) {
      const entry = open.get(id);
      if (!entry) throw new Error("Die Datei ist nicht mehr geöffnet.");
      const t = thumbnail(mupdf, entry.doc.loadPage(index), 240);
      ctx.transfer([t.png.buffer]);
      return t;
    },
    save({ id, edits }, ctx) {
      const entry = open.get(id);
      if (!entry) throw new Error("Die Datei ist nicht mehr geöffnet.");
      const result = editPages(mupdf, entry.bytes, edits);
      ctx.transfer([result.bytes.buffer]);
      return result;
    },
    close({ id }) {
      open.get(id)?.doc.destroy?.();
      open.delete(id);
    },
  };
});
