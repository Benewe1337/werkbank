import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const codecs = await import("../_bild/codecs.js");
  const { detectFormat } = await import("../_bild/format.js");
  const { makeFavicons } = await import("./icons.js");
  await codecs.warmup(["png"]);
  return {
    /** Entweder `buffer` (Rasterbild) oder `pixels` + Maße (im Haupt-Thread gerastertes SVG). */
    async make({ buffer, pixels, width, height, ...opts }, ctx) {
      let image;
      if (buffer) {
        const bytes = new Uint8Array(buffer);
        const format = detectFormat(bytes);
        if (!["jpeg", "png", "webp", "avif"].includes(format)) throw new Error("Kein unterstütztes Bild. Erlaubt sind PNG, JPG, WebP, AVIF und SVG.");
        image = await codecs.decode(bytes, format);
      } else {
        image = { data: new Uint8ClampedArray(pixels), width, height };
      }
      const files = await makeFavicons(codecs, image, opts);
      ctx.transfer(files.map((f) => f.bytes.buffer));
      return files;
    },
  };
});
