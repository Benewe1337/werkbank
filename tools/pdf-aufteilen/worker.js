import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const mupdf = await import("mupdf");
  const { openPdf } = await import("../_pdf/pdf.js");
  const { splitPdf } = await import("./split.js");
  return {
    count({ buffer }) {
      return { pages: openPdf(mupdf, new Uint8Array(buffer)).countPages() };
    },
    split({ buffer, mode, n, ranges }, ctx) {
      const result = splitPdf(mupdf, new Uint8Array(buffer), mode, { n, ranges });
      ctx.transfer(result.parts.map((p) => p.bytes.buffer));
      return result;
    },
  };
});
