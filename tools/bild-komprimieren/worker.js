import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const codecs = await import("../_bild/codecs.js");
  const { compressImage } = await import("./compress.js");
  await codecs.warmup(["jpeg", "png"]);
  return {
    async compress({ buffer, target, quality }, ctx) {
      const result = await compressImage(codecs, new Uint8Array(buffer), { target, quality });
      ctx.transfer([result.bytes.buffer]);
      return result;
    },
  };
});
