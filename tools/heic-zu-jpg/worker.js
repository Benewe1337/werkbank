import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const codecs = await import("../_bild/codecs.js");
  const { convertHeic } = await import("./convert.js");
  await codecs.warmup(["heic", "jpeg"]);
  return {
    async convert({ buffer, format, quality }, ctx) {
      const result = await convertHeic(codecs, new Uint8Array(buffer), { format, quality });
      ctx.transfer(result.images.map((i) => i.bytes.buffer));
      return result;
    },
  };
});
