import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const mupdf = await import("mupdf");
  const { protectPdf, unlockPdf } = await import("./password.js");
  return {
    unlock({ buffer, password }, ctx) {
      const result = unlockPdf(mupdf, new Uint8Array(buffer), password);
      ctx.transfer([result.bytes.buffer]);
      return result;
    },
    protect({ buffer, user, owner }, ctx) {
      const result = protectPdf(mupdf, new Uint8Array(buffer), user, owner);
      ctx.transfer([result.bytes.buffer]);
      return result;
    },
  };
});
