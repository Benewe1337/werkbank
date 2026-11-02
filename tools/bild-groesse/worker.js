import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const codecs = await import("../_bild/codecs.js");
  const { resizeImage } = await import("./size.js");
  await codecs.warmup(["jpeg", "png"]);
  return {
    async resize({ buffer, ...opts }, ctx) {
      const result = await resizeImage(codecs, new Uint8Array(buffer), opts);
      ctx.transfer([result.bytes.buffer]);
      return result;
    },
  };
});
