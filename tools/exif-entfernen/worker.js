// Nur für AVIF und HEIC: die werden ohne Metadaten neu gespeichert (AVIF bleibt AVIF, HEIC wird JPG).
import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const codecs = await import("../_bild/codecs.js");
  const { detectFormat } = await import("../_bild/format.js");
  return {
    async reencode({ buffer }, ctx) {
      const bytes = new Uint8Array(buffer);
      const input = detectFormat(bytes);
      if (input !== "avif" && input !== "heic") throw new Error("Neu speichern geht hier nur für AVIF und HEIC.");
      const image = await codecs.decode(bytes, input);
      const format = input === "avif" ? "avif" : "jpeg";
      const out = await codecs.encode(image, format, { quality: input === "avif" ? 80 : 92 });
      ctx.transfer([out.buffer]);
      return { bytes: out, format, width: image.width, height: image.height };
    },
  };
});
