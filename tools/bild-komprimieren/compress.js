// Bilder verkleinern: dekodieren und mit wählbarem Format/Qualität neu kodieren.
// PNG → PNG läuft verlustfrei über oxipng. Codecs werden hereingereicht (Worker oder Test).
import { FORMATS, detectFormat, pngSize } from "../_bild/format.js";

export const INPUT_FORMATS = ["jpeg", "png", "webp", "avif"];
export const TARGETS = ["same", "jpeg", "png", "webp", "avif"];

/** Zielformat aus Auswahl und Eingabe. */
export function targetFormat(input, choice) {
  if (!TARGETS.includes(choice)) throw new Error(`Unbekanntes Zielformat: ${choice}`);
  return choice === "same" ? input : choice;
}

/**
 * @param {{decode: Function, encode: Function, optimisePng: Function}} codecs
 * @param {Uint8Array} bytes
 * @param {{target: string, quality: number}} opts
 * @returns {Promise<{bytes: Uint8Array, format: string, width: number, height: number, lossless: boolean}>}
 */
export async function compressImage(codecs, bytes, { target, quality }) {
  const input = detectFormat(bytes);
  if (!INPUT_FORMATS.includes(input)) {
    throw new Error("Kein unterstütztes Bild. Erlaubt sind JPG, PNG, WebP und AVIF.");
  }
  const format = targetFormat(input, target);
  if (input === "png" && format === "png") {
    const { width, height } = pngSize(bytes);
    return { bytes: await codecs.optimisePng(bytes), format, width, height, lossless: true };
  }
  const image = await codecs.decode(bytes, input);
  const out = await codecs.encode(image, format, { quality });
  return { bytes: out, format, width: image.width, height: image.height, lossless: format === "png" };
}

export const formatLabel = (format) => FORMATS[format]?.label ?? format;
