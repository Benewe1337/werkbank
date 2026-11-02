import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const mupdf = await import("mupdf");
  const { cropHandout } = await import("./crop.js");
  return {
    crop({ buffer }, ctx) {
      const logs = [];
      const result = cropHandout(mupdf, new Uint8Array(buffer), (l) => logs.push(l));
      ctx.transfer([result.bytes.buffer]);
      return { ...result, logs };
    },
  };
});
