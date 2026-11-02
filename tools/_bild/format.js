// Bildformate erkennen und Pixel-Hilfen. Reine Funktionen ohne DOM, damit sie in Vitest (Node) laufen.

export const FORMATS = {
  jpeg: { mime: "image/jpeg", ext: "jpg", label: "JPG" },
  png: { mime: "image/png", ext: "png", label: "PNG" },
  webp: { mime: "image/webp", ext: "webp", label: "WebP" },
  avif: { mime: "image/avif", ext: "avif", label: "AVIF" },
  heic: { mime: "image/heic", ext: "heic", label: "HEIC" },
  gif: { mime: "image/gif", ext: "gif", label: "GIF" },
};

/** Formate, die wir dekodieren und wieder kodieren können. */
export const RASTER_ACCEPT = ".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif";

const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "mif2"];

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

/**
 * Format anhand der ersten Bytes erkennen (Dateiendungen lügen manchmal).
 * @param {Uint8Array} bytes
 * @returns {"jpeg"|"png"|"webp"|"avif"|"heic"|"gif"|null}
 */
export function detectFormat(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (ascii(bytes, 0, 4) === "GIF8") return "gif";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const size = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
    const brands = [ascii(bytes, 8, 4)];
    for (let o = 16; o + 4 <= Math.min(size, bytes.length); o += 4) brands.push(ascii(bytes, o, 4));
    if (brands[0] === "avif" || brands[0] === "avis") return "avif";
    if (HEIF_BRANDS.includes(brands[0])) return brands.includes("avif") && !brands.includes("heic") ? "avif" : "heic";
    if (brands.includes("avif")) return "avif";
  }
  return null;
}

/** Abmessungen aus dem PNG-Kopf (IHDR), ohne zu dekodieren. */
export function pngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Hat das Bild mindestens ein nicht ganz deckendes Pixel? */
export function hasTransparency({ data }) {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
}

/**
 * Transparenz auf eine Farbe legen (für JPG, das keinen Alphakanal kennt).
 * Liefert neue Pixel, das Original bleibt unverändert.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {[number, number, number]} rgb
 */
export function flattenAlpha(image, rgb = [255, 255, 255]) {
  const src = image.data;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] / 255;
    out[i] = src[i] * a + rgb[0] * (1 - a);
    out[i + 1] = src[i + 1] * a + rgb[1] * (1 - a);
    out[i + 2] = src[i + 2] * a + rgb[2] * (1 - a);
    out[i + 3] = 255;
  }
  return { data: out, width: image.width, height: image.height };
}

/** "#ff8800" → [255, 136, 0]; wirft bei ungültiger Eingabe. */
export function parseHexColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new Error(`Ungültige Farbe: „${hex}“`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Qualität 1–100 aus einem Formularwert, sonst Fehler. */
export function parseQuality(value) {
  const q = Math.round(Number(value));
  if (!Number.isFinite(q) || q < 1 || q > 100) throw new Error("Qualität muss zwischen 1 und 100 liegen.");
  return q;
}
