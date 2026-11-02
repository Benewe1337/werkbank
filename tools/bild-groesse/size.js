// Bildgröße ändern: Zielmaße berechnen, skalieren, neu kodieren.
import { detectFormat } from "../_bild/format.js";

export const MAX_SIDE = 16384;
export const INPUT_FORMATS = ["jpeg", "png", "webp", "avif"];

const parse = (value) => {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`„${value}“ ist keine gültige Größe.`);
  return n;
};

/**
 * Zielmaße aus Originalgröße und Eingaben.
 * - px: Breite und/oder Höhe. Mit „Seitenverhältnis halten“ passt das Bild in den Rahmen aus beiden Werten.
 * - percent: Breite (und ohne Seitenverhältnis Höhe) in Prozent.
 * @param {{width: number, height: number}} source
 * @param {{unit: "px"|"percent", width?: string|number, height?: string|number, keepRatio: boolean}} opts
 */
export function targetSize(source, { unit, width, height, keepRatio }) {
  let w = parse(width);
  let h = parse(height);
  if (w === null && h === null) throw new Error("Gib eine Breite oder eine Höhe an.");
  if (unit === "percent") {
    if (keepRatio || h === null) h = w ?? h;
    if (keepRatio || w === null) w = h;
    return check({ width: Math.round((source.width * w) / 100), height: Math.round((source.height * h) / 100) });
  }
  if (unit !== "px") throw new Error(`Unbekannte Einheit: ${unit}`);
  if (keepRatio || w === null || h === null) {
    const scale = Math.min(w === null ? Infinity : w / source.width, h === null ? Infinity : h / source.height);
    return check({ width: Math.round(source.width * scale), height: Math.round(source.height * scale) });
  }
  return check({ width: Math.round(w), height: Math.round(h) });
}

function check(size) {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  if (width > MAX_SIDE || height > MAX_SIDE) {
    throw new Error(`Höchstens ${MAX_SIDE} Pixel pro Seite (angefragt: ${width} × ${height}).`);
  }
  return { width, height };
}

/**
 * @param {{decode: Function, encode: Function, resize: Function}} codecs
 * @param {Uint8Array} bytes
 * @param {{unit: string, width?: string, height?: string, keepRatio: boolean, target: string, quality: number}} opts
 */
export async function resizeImage(codecs, bytes, opts) {
  const input = detectFormat(bytes);
  if (!INPUT_FORMATS.includes(input)) throw new Error("Kein unterstütztes Bild. Erlaubt sind JPG, PNG, WebP und AVIF.");
  const format = opts.target === "same" ? input : opts.target;
  const image = await codecs.decode(bytes, input);
  const size = targetSize(image, opts);
  const scaled = await codecs.resize(image, size.width, size.height);
  const out = await codecs.encode(scaled, format, { quality: opts.quality });
  return { bytes: out, format, from: { width: image.width, height: image.height }, to: size };
}
