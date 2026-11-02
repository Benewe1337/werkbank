import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const mupdf = await import("mupdf");
  const { mergePdfs } = await import("./merge.js");
  return {
    merge({ buffers }, ctx) {
      const result = mergePdfs(mupdf, buffers.map((b) => new Uint8Array(b)));
      ctx.transfer([result.bytes.buffer]);
      return result;
    },
  };
});
