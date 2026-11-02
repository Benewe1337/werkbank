import { serve } from "../../src/shared/worker-host.js";

/** WebP und andere Formate, die MuPDF nicht liest, über den Browser nach PNG umwandeln. */
async function browserToPng(bytes, type) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

const isJpeg = (b) => b[0] === 0xff && b[1] === 0xd8;
const isWebp = (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";

serve(async () => {
  const mupdf = await import("mupdf");
  const exifr = (await import("exifr")).default;
  const { imagesToPdf } = await import("./images.js");
  return {
    async build({ files, layout }, ctx) {
      const images = [];
      for (const { buffer, name, type } of files) {
        let bytes = new Uint8Array(buffer);
        let orientation = 1;
        if (isJpeg(bytes)) orientation = (await exifr.orientation(bytes).catch(() => 1)) ?? 1;
        else if (isWebp(bytes)) {
          try {
            bytes = await browserToPng(bytes, type || "image/webp");
          } catch {
            throw new Error(`${name}: Bild lässt sich nicht lesen.`);
          }
        }
        images.push({ bytes, orientation, name });
      }
      const result = imagesToPdf(mupdf, images, { layout });
      ctx.transfer([result.bytes.buffer]);
      return result;
    },
  };
});
