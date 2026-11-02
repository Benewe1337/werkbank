// Metadaten lesen (exifr) und für die Anzeige zusammenfassen. Und: welcher Weg entfernt sie?
import { detectFormat } from "../_bild/format.js";
import { stripJpeg, stripPng, stripWebp, webpExif } from "./strip.js";

/** Lesbare Bezeichnungen der wichtigsten Felder, in Anzeigereihenfolge. */
export const LABELS = [
  ["Make", "Hersteller"],
  ["Model", "Kamera"],
  ["LensModel", "Objektiv"],
  ["BodySerialNumber", "Seriennummer"],
  ["SerialNumber", "Seriennummer"],
  ["DateTimeOriginal", "Aufgenommen"],
  ["CreateDate", "Erstellt"],
  ["ModifyDate", "Geändert"],
  ["Software", "Software"],
  ["Artist", "Urheber"],
  ["Author", "Urheber"],
  ["creator", "Urheber"],
  ["Byline", "Urheber"],
  ["OwnerName", "Besitzer"],
  ["Copyright", "Copyright"],
  ["ImageDescription", "Beschreibung"],
  ["Comment", "Kommentar"],
  ["Orientation", "Drehung"],
  ["ExposureTime", "Belichtungszeit"],
  ["FNumber", "Blende"],
  ["ISO", "ISO"],
];

const SKIP = new Set(["latitude", "longitude"]);

export function formatValue(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toLocaleString("de-DE");
  if (value instanceof Uint8Array || ArrayBuffer.isView(value)) return `${value.length} Bytes`;
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join("; ");
  }
  const text = String(value ?? "");
  return text.length > 200 ? `${text.slice(0, 200)} …` : text;
}

/**
 * @param {Record<string, unknown>|undefined|null} meta exifr-Ausgabe (mergeOutput)
 * @returns {{gps: {latitude: number, longitude: number}|null, rows: [string, string][], all: [string, string][]}}
 */
export function summarize(meta) {
  if (!meta) return { gps: null, rows: [], all: [] };
  const lat = Number(meta.latitude);
  const lon = Number(meta.longitude);
  const gps = Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null;
  const rows = [];
  const seen = new Set();
  for (const [key, label] of LABELS) {
    if (meta[key] === undefined || seen.has(label)) continue;
    const text = formatValue(meta[key]);
    if (!text) continue;
    rows.push([label, text]);
    seen.add(label);
  }
  const all = Object.entries(meta)
    .filter(([k]) => !SKIP.has(k))
    .map(([k, v]) => [k, formatValue(v)]);
  return { gps, rows, all };
}

/** 52.520008 → "52,52001° N" */
export function formatCoordinate(value, [pos, neg]) {
  return `${Math.abs(value).toFixed(5).replace(".", ",")}° ${value >= 0 ? pos : neg}`;
}

export const EXIFR_OPTIONS = {
  tiff: true,
  ifd0: true,
  exif: true,
  gps: true,
  xmp: true,
  iptc: true,
  ihdr: false,
  jfif: false,
  icc: false,
  interop: false,
  ifd1: false,
  makerNote: false,
  userComment: true,
  mergeOutput: true,
  silentErrors: true,
};

/**
 * Metadaten lesen. exifr kennt kein WebP: dort reichen wir den EXIF-Block direkt weiter.
 * @param {{parse: Function}} exifr
 * @param {Uint8Array} bytes
 */
export async function readMetadata(exifr, bytes) {
  const format = detectFormat(bytes);
  if (format === "webp") {
    const tiff = webpExif(bytes);
    return tiff ? exifr.parse(tiff, EXIFR_OPTIONS) : undefined;
  }
  try {
    return await exifr.parse(bytes, EXIFR_OPTIONS);
  } catch {
    return undefined; // keine lesbaren Metadaten ist kein Fehler
  }
}

/** Wie wird entfernt? lossless = nur Metadaten raus, reencode = Bild neu speichern. */
export function strategy(format) {
  if (format === "jpeg" || format === "png" || format === "webp") return "lossless";
  if (format === "avif" || format === "heic") return "reencode";
  return null;
}

/**
 * Verlustfreier Weg für JPEG, PNG und WebP.
 * @param {Uint8Array} bytes
 * @param {{keepOrientation?: boolean}} [opts]
 */
export function stripLossless(bytes, opts) {
  const format = detectFormat(bytes);
  if (format === "jpeg") return { format, ...stripJpeg(bytes, opts) };
  if (format === "png") return { format, ...stripPng(bytes) };
  if (format === "webp") return { format, ...stripWebp(bytes) };
  throw new Error("Für dieses Format gibt es keinen verlustfreien Weg.");
}
