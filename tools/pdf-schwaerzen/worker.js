import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const mupdf = await import("mupdf");
  const { redactPdf, remainingHits } = await import("./redact.js");
  return {
    redact({ buffer, terms, caseSensitive }, ctx) {
      const result = redactPdf(mupdf, new Uint8Array(buffer), terms, { caseSensitive });
      if (!result.bytes) return result;
      // Gegenprobe: Im Ergebnis darf kein Begriff mehr als Text auffindbar sein.
      const left = remainingHits(mupdf, result.bytes, terms, { caseSensitive });
      if (left > 0) throw new Error(`${left} Fundstellen ließen sich nicht entfernen. Die Datei wurde nicht gespeichert.`);
      ctx.transfer([result.bytes.buffer]);
      return result;
    },
  };
});
