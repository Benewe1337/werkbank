// Metadaten verlustfrei aus JPEG, PNG und WebP entfernen. Die Bilddaten selbst bleiben Byte für Byte gleich.
// Reine Funktionen auf Uint8Array, ohne DOM.

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Ausrichtung (1–8) aus einem TIFF/EXIF-Block, sonst 1. */
export function tiffOrientation(tiff) {
  if (tiff.length < 8) return 1;
  const le = tiff[0] === 0x49;
  const r16 = (o) => (le ? tiff[o] | (tiff[o + 1] << 8) : u16(tiff, o));
  const r32 = (o) => (le ? u32le(tiff, o) : u32be(tiff, o));
  const ifd = r32(4);
  if (ifd + 2 > tiff.length) return 1;
  const count = r16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > tiff.length) break;
    if (r16(e) === 0x0112) {
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

/** Minimaler EXIF-Block (APP1), der nur die Ausrichtung enthält. */
export function orientationOnlyApp1(orientation) {
  const tiff = Uint8Array.of(
    0x4d, 0x4d, 0, 42, 0, 0, 0, 8, // Kopf, big endian, IFD0 ab 8
    0, 1, // ein Eintrag
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, // Orientation, SHORT, 1
    0, 0, 0, 0, // kein weiteres IFD
  );
  const payload = concat([Uint8Array.from("Exif\0\0", (c) => c.charCodeAt(0)), tiff]);
  return concat([Uint8Array.of(0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 255), payload]);
}

function describeAppSegment(marker, payload) {
  const head = ascii(payload, 0, Math.min(payload.length, 32));
  if (marker === 0xe1 && head.startsWith("Exif\0")) return "EXIF";
  if (marker === 0xe1 && head.startsWith("http://ns.adobe.com/xap")) return "XMP";
  if (marker === 0xe1) return "XMP";
  if (marker === 0xed) return "IPTC";
  if (marker === 0xe2 && head.startsWith("MPF\0")) return "Zusatzbilder (MPF)";
  return `APP${marker - 0xe0}`;
}

/** Diese Segmente bleiben: JFIF-Kopf, Farbprofil, Adobe-Farbinfo. Ohne sie ändern sich Farben. */
function keepAppSegment(marker, payload) {
  const head = ascii(payload, 0, Math.min(payload.length, 14));
  if (marker === 0xe0) return head.startsWith("JFIF") || head.startsWith("JFXX");
  if (marker === 0xe2) return head.startsWith("ICC_PROFILE");
  if (marker === 0xee) return head.startsWith("Adobe");
  return false;
}

/**
 * Entfernt EXIF, XMP, IPTC, Kommentare und angehängte Daten aus einem JPEG.
 * @param {Uint8Array} bytes
 * @param {{keepOrientation?: boolean}} [opts] true: Drehung als einziger EXIF-Wert bleibt erhalten.
 * @returns {{bytes: Uint8Array, removed: string[], orientation: number}}
 */
export function stripJpeg(bytes, { keepOrientation = true } = {}) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Kein gültiges JPEG.");
  const parts = [bytes.subarray(0, 2)];
  const removed = [];
  let orientation = 1;
  let insertAt = 1; // nach SOI bzw. nach JFIF
  let o = 2;
  while (o < bytes.length) {
    if (bytes[o] !== 0xff) throw new Error("JPEG ist beschädigt (Segment erwartet).");
    const marker = bytes[o + 1];
    if (marker === 0xff) {
      o++; // Füllbyte
      continue;
    }
    if (marker === 0xd9) {
      parts.push(bytes.subarray(o, o + 2));
      if (o + 2 < bytes.length) removed.push("angehängte Daten");
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(bytes.subarray(o, o + 2));
      o += 2;
      continue;
    }
    if (o + 4 > bytes.length) throw new Error("JPEG ist abgeschnitten.");
    const length = u16(bytes, o + 2);
    const end = o + 2 + length;
    if (end > bytes.length) throw new Error("JPEG ist abgeschnitten.");
    const payload = bytes.subarray(o + 4, end);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (isApp && !keepAppSegment(marker, payload)) {
      const kind = describeAppSegment(marker, payload);
      if (kind === "EXIF") orientation = tiffOrientation(payload.subarray(6));
      if (!removed.includes(kind)) removed.push(kind);
    } else if (marker === 0xfe) {
      if (!removed.includes("Kommentar")) removed.push("Kommentar");
    } else {
      parts.push(bytes.subarray(o, end));
      if (marker === 0xe0) insertAt = parts.length;
    }
    o = end;
    if (marker === 0xda) {
      // Komprimierte Bilddaten bis zum nächsten echten Marker übernehmen.
      let p = o;
      while (p + 1 < bytes.length) {
        if (bytes[p] === 0xff) {
          const next = bytes[p + 1];
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7) && next !== 0xff) break;
        }
        p++;
      }
      parts.push(bytes.subarray(o, p));
      o = p;
    }
  }
  if (keepOrientation && orientation !== 1) parts.splice(insertAt, 0, orientationOnlyApp1(orientation));
  return { bytes: concat(parts), removed, orientation };
}

const PNG_DROP = { tEXt: "Text", iTXt: "Text", zTXt: "Text", eXIf: "EXIF", tIME: "Zeitstempel" };

/**
 * Entfernt Text-, EXIF- und Zeitstempel-Chunks aus einem PNG. Farbprofil und Pixel bleiben.
 * @param {Uint8Array} bytes
 */
export function stripPng(bytes) {
  if (ascii(bytes, 1, 3) !== "PNG") throw new Error("Kein gültiges PNG.");
  const parts = [bytes.subarray(0, 8)];
  const removed = [];
  let orientation = 1;
  let o = 8;
  while (o + 12 <= bytes.length) {
    const length = u32be(bytes, o);
    const type = ascii(bytes, o + 4, 4);
    const end = o + 12 + length;
    if (end > bytes.length) throw new Error("PNG ist abgeschnitten.");
    if (type in PNG_DROP) {
      if (type === "eXIf") orientation = tiffOrientation(bytes.subarray(o + 8, o + 8 + length));
      if (!removed.includes(PNG_DROP[type])) removed.push(PNG_DROP[type]);
    } else {
      parts.push(bytes.subarray(o, end));
    }
    o = end;
    if (type === "IEND") break;
  }
  if (o < bytes.length) removed.push("angehängte Daten");
  return { bytes: concat(parts), removed, orientation };
}

/**
 * Entfernt EXIF- und XMP-Chunks aus einem WebP und passt den Kopf an.
 * @param {Uint8Array} bytes
 */
export function stripWebp(bytes) {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") throw new Error("Kein gültiges WebP.");
  const chunks = [];
  const removed = [];
  let orientation = 1;
  const end = Math.min(bytes.length, 8 + u32le(bytes, 4));
  let o = 12;
  while (o + 8 <= end) {
    const type = ascii(bytes, o, 4);
    const size = u32le(bytes, o + 4);
    const next = o + 8 + size + (size % 2);
    if (o + 8 + size > end) throw new Error("WebP ist abgeschnitten.");
    if (type === "EXIF" || type === "XMP ") {
      const kind = type === "EXIF" ? "EXIF" : "XMP";
      if (kind === "EXIF") {
        let tiff = bytes.subarray(o + 8, o + 8 + size);
        if (ascii(tiff, 0, 4) === "Exif") tiff = tiff.subarray(6);
        orientation = tiffOrientation(tiff);
      }
      removed.push(kind);
    } else {
      chunks.push(bytes.slice(o, Math.min(next, end)));
    }
    o = next;
  }
  const vp8x = chunks.find((c) => ascii(c, 0, 4) === "VP8X");
  if (vp8x) vp8x[8] &= ~(0x08 | 0x04); // EXIF- und XMP-Flag löschen
  const body = concat([Uint8Array.from("WEBP", (c) => c.charCodeAt(0)), ...chunks]);
  const size = body.length;
  const head = Uint8Array.of(0x52, 0x49, 0x46, 0x46, size & 255, (size >> 8) & 255, (size >> 16) & 255, size >>> 24);
  return { bytes: concat([head, body]), removed, orientation };
}

/** EXIF-Block (TIFF) aus einem WebP holen, damit exifr ihn anzeigen kann (exifr liest kein WebP). */
export function webpExif(bytes) {
  let o = 12;
  while (o + 8 <= bytes.length) {
    const type = ascii(bytes, o, 4);
    const size = u32le(bytes, o + 4);
    if (type === "EXIF") {
      const tiff = bytes.subarray(o + 8, o + 8 + size);
      return ascii(tiff, 0, 4) === "Exif" ? tiff.subarray(6) : tiff;
    }
    o += 8 + size + (size % 2);
  }
  return null;
}
