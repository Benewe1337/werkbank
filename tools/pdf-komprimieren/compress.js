// PDF verkleinern: Bilder auf eine Ziel-Auflösung herunterrechnen, als JPEG neu kodieren
// und die Datei aufräumen (unbenutzte Objekte, komprimierte Streams, Objekt-Streams).
import { openPdf, savePdf } from "../_pdf/pdf.js";

export const PRESETS = {
  stark: { dpi: 96, quality: 60 },
  mittel: { dpi: 150, quality: 75 },
  leicht: { dpi: 220, quality: 85 },
};

/** Bilder werden erst angefasst, wenn sie spürbar über dem Ziel liegen. */
const DPI_TOLERANCE = 1.15;
const MIN_PIXELS = 64;
const CLEANUP = "garbage=4,compress,compress-fonts,compress-images,objstms,clean";

const name = (obj) => (obj.isName() ? obj.asName() : null);

/**
 * Größte dargestellte Größe (in pt) je Bild-Objekt, über alle Seiten.
 * Die Zuordnung klappt über MuPDFs Bild-Cache: dasselbe Objekt liefert dasselbe fz_image.
 * @returns {Map<number, number>} Bild-Zeiger → längste dargestellte Kante in pt
 */
function displayedSizes(mupdf, doc) {
  const sizes = new Map();
  const device = new mupdf.Device({
    fillImage(image, ctm) {
      const w = Math.hypot(ctm[0], ctm[1]);
      const h = Math.hypot(ctm[2], ctm[3]);
      const key = image.pointer;
      sizes.set(key, Math.max(sizes.get(key) ?? 0, w, h));
    },
  });
  try {
    for (let i = 0; i < doc.countPages(); i++) doc.loadPage(i).run(device, mupdf.Matrix.identity);
  } finally {
    device.close();
  }
  return sizes;
}

function largestPageSide(doc) {
  let max = 0;
  for (let i = 0; i < doc.countPages(); i++) {
    const [x0, y0, x1, y1] = doc.loadPage(i).getBounds();
    max = Math.max(max, x1 - x0, y1 - y0);
  }
  return max;
}

/** Alle Objektnummern, die als Soft-Mask oder Maske eines anderen Bildes dienen. */
function maskObjects(doc, images) {
  const masks = new Set();
  for (const obj of images) {
    for (const key of ["SMask", "Mask"]) {
      const ref = obj.get(key);
      if (ref.isIndirect()) masks.add(ref.asIndirect());
    }
  }
  return masks;
}

function imageObjects(doc) {
  const out = [];
  for (let n = 1; n < doc.countObjects(); n++) {
    const obj = doc.newIndirect(n);
    try {
      if (obj.isStream() && name(obj.get("Subtype")) === "Image") out.push(obj);
    } catch {
      // kaputte Objekte überspringen
    }
  }
  return out;
}

/** Zielgröße in Pixeln für ein Bild, oder null wenn es bleiben soll. */
export function targetSize(width, height, displayedPt, dpi) {
  if (!displayedPt) return null;
  const longest = Math.max(width, height);
  const effectiveDpi = (longest / displayedPt) * 72;
  if (effectiveDpi <= dpi * DPI_TOLERANCE) return null;
  const factor = dpi / effectiveDpi;
  const w = Math.max(1, Math.round(width * factor));
  const h = Math.max(1, Math.round(height * factor));
  return Math.max(w, h) < MIN_PIXELS ? null : { width: w, height: h };
}

/** Kann dieses Bild ohne sichtbare Änderung als JPEG neu geschrieben werden? */
function canRewrite(obj, masks, num) {
  if (masks.has(num)) return false;
  if (obj.get("ImageMask").valueOf() === true) return false;
  if (!obj.get("Decode").isNull() || obj.get("Mask").isArray()) return false;
  const filter = obj.get("Filter");
  const filters = filter.isArray() ? Array.from({ length: filter.length }, (_, i) => name(filter.get(i))) : [name(filter)];
  // JBIG2/CCITT sind für Schwarzweiß bereits sehr klein, JPX lassen wir unangetastet.
  return !filters.some((f) => f === "JBIG2Decode" || f === "CCITTFaxDecode" || f === "JPXDecode");
}

/** Bild in neue Größe zeichnen (MuPDF-Rasterung) und als JPEG kodieren. */
function encodeJpeg(mupdf, image, size, quality) {
  const gray = image.getColorSpace()?.isGray?.() ?? false;
  const cs = gray ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB;
  const pix = new mupdf.Pixmap(cs, [0, 0, size.width, size.height], false);
  try {
    pix.clear(255);
    const device = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
    try {
      device.fillImage(image, [size.width, 0, 0, size.height, 0, 0], 1);
    } finally {
      device.close();
    }
    return { jpeg: pix.asJPEG(quality).slice(), colorspace: gray ? "DeviceGray" : "DeviceRGB" };
  } finally {
    pix.destroy?.();
  }
}

/**
 * @param {typeof import("mupdf")} mupdf
 * @param {Uint8Array} input
 * @param {{dpi?: number, quality?: number, images?: boolean}} [opts]
 * @returns {{bytes: Uint8Array, before: number, after: number, imagesRewritten: number, imagesTotal: number, kept: boolean}}
 */
export function compressPdf(mupdf, input, { dpi = 150, quality = 75, images = true } = {}) {
  const before = input.byteLength;
  const doc = openPdf(mupdf, input);
  const all = imageObjects(doc);
  let imagesRewritten = 0;

  if (images && all.length) {
    const sizes = displayedSizes(mupdf, doc);
    const masks = maskObjects(doc, all);
    const largestPage = largestPageSide(doc);
    for (const obj of all) {
      const num = obj.asIndirect();
      if (!canRewrite(obj, masks, num)) continue;
      let image;
      try {
        image = doc.loadImage(obj);
      } catch {
        continue;
      }
      const width = image.getWidth();
      const height = image.getHeight();
      // Nicht zugeordnet (z. B. Cache verdrängt): vorsichtig mit der größten Seitenkante rechnen.
      const displayed = sizes.get(image.pointer) ?? largestPage;
      const size = targetSize(width, height, displayed, dpi) ?? { width, height };
      if (Math.max(size.width, size.height) < MIN_PIXELS) continue;
      const { jpeg, colorspace } = encodeJpeg(mupdf, image, size, quality);
      const oldLength = obj.readRawStream().getLength();
      if (jpeg.byteLength >= oldLength * 0.9) continue;
      obj.writeRawStream(jpeg);
      obj.put("Filter", doc.newName("DCTDecode"));
      obj.delete("DecodeParms");
      obj.put("Width", size.width);
      obj.put("Height", size.height);
      obj.put("BitsPerComponent", 8);
      obj.put("ColorSpace", doc.newName(colorspace));
      imagesRewritten++;
    }
  }

  const bytes = savePdf(doc, CLEANUP);
  if (bytes.byteLength >= before) {
    return { bytes: input.slice(), before, after: before, imagesRewritten: 0, imagesTotal: all.length, kept: true };
  }
  return { bytes, before, after: bytes.byteLength, imagesRewritten, imagesTotal: all.length, kept: false };
}
