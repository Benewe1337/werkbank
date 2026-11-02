import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const mupdf = await import("mupdf");
  const { compressPdf } = await import("./compress.js");
  return {
    compress({ buffer, dpi, quality, images }, ctx) {
      const result = compressPdf(mupdf, new Uint8Array(buffer), { dpi, quality, images });
      ctx.transfer([result.bytes.buffer]);
      return result;
    },
  };
});
