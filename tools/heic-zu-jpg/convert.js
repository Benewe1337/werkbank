// HEIC/HEIF (iPhone-Fotos) in JPG oder PNG umwandeln. Enthält die Datei mehrere Bilder, kommen alle heraus.
import { FORMATS, detectFormat } from "../_bild/format.js";

export const TARGETS = ["jpeg", "png"];

/** Dateinamen: ein Bild → „foto.jpg“, mehrere → „foto-1.jpg“, „foto-2.jpg“ … */
export function imageNames(base, count, ext) {
  if (count === 1) return [`${base}.${ext}`];
  return Array.from({ length: count }, (_, i) => `${base}-${i + 1}.${ext}`);
}

/**
 * @param {{decodeHeic: Function, encode: Function}} codecs
 * @param {Uint8Array} bytes
 * @param {{format: "jpeg"|"png", quality: number}} opts
 * @returns {Promise<{images: {bytes: Uint8Array, width: number, height: number}[], format: string}>}
 */
export async function convertHeic(codecs, bytes, { format, quality }) {
  if (!TARGETS.includes(format)) throw new Error(`Unbekanntes Zielformat: ${format}`);
  const kind = detectFormat(bytes);
  if (kind !== "heic") {
    const label = FORMATS[kind]?.label;
    throw new Error(label ? `Das ist schon ein ${label}, kein HEIC.` : "Keine HEIC-Datei. Erwartet werden iPhone-Fotos (.heic oder .heif).");
  }
  const decoded = await codecs.decodeHeic(bytes);
  const images = [];
  for (const image of decoded) {
    images.push({ bytes: await codecs.encode(image, format, { quality }), width: image.width, height: image.height });
  }
  return { images, format };
}
