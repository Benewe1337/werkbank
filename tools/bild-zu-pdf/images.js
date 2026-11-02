// Bilder (JPG/PNG und alles, was MuPDF lesen kann) zu einer PDF zusammenstellen.
// JPEGs werden unverändert übernommen, andere Formate verlustfrei eingebettet.

export const A4 = [595.28, 841.89];
export const MARGIN = 36; // 0,5 Zoll ≈ 12,7 mm
export const LAYOUTS = ["fit", "a4-hoch", "a4-quer"];

/**
 * EXIF-Orientierung als Koeffizienten: X = W·(au·u + av·v + a0), Y = H·(bu·u + bv·v + b0),
 * mit (u, v) im Bild von oben links und (X, Y) in der angezeigten Fläche von oben links.
 */
const ORIENTATION = {
  1: [[1, 0, 0], [0, 1, 0]],
  2: [[-1, 0, 1], [0, 1, 0]],
  3: [[-1, 0, 1], [0, -1, 1]],
  4: [[1, 0, 0], [0, -1, 1]],
  5: [[0, 1, 0], [1, 0, 0]],
  6: [[0, -1, 1], [1, 0, 0]],
  7: [[0, -1, 1], [-1, 0, 1]],
  8: [[0, 1, 0], [-1, 0, 1]],
};

/** Vertauscht die Orientierung Breite und Höhe (90°-Drehungen)? */
export const swapsSides = (orientation) => orientation >= 5 && orientation <= 8;

/**
 * PDF-Matrix (für `cm`), die das Bild-Einheitsquadrat in das Rechteck x, y, W, H (PDF-Koordinaten,
 * y nach oben) zeichnet und dabei die EXIF-Orientierung anwendet.
 */
export function placementMatrix(x, y, W, H, orientation = 1) {
  const [[au, av, a0], [bu, bv, b0]] = ORIENTATION[orientation] ?? ORIENTATION[1];
  // PDF-Bildraum hat die erste Zeile oben bei v' = 1, also v = 1 − v'.
  return [au * W, -bu * H, -av * W, bv * H, x + (a0 + av) * W, y + H - (b0 + bv) * H];
}

/** Natürliche Größe in pt aus Pixeln und Auflösung (ohne Angabe 96 dpi). */
export function naturalSize(width, height, xres, yres) {
  const rx = xres > 0 ? xres : 96;
  const ry = yres > 0 ? yres : 96;
  return [(width * 72) / rx, (height * 72) / ry];
}

/** Seitengröße und Bildrechteck für ein Bild der (angezeigten) Größe w × h pt. */
export function layoutPage(w, h, layout = "fit") {
  if (layout === "fit") return { page: [w, h], box: [0, 0, w, h] };
  const [pw, ph] = layout === "a4-quer" ? [A4[1], A4[0]] : A4;
  const maxW = pw - 2 * MARGIN;
  const maxH = ph - 2 * MARGIN;
  const scale = Math.min(maxW / w, maxH / h);
  const bw = w * scale;
  const bh = h * scale;
  return { page: [pw, ph], box: [(pw - bw) / 2, (ph - bh) / 2, bw, bh] };
}

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {typeof import("mupdf")} mupdf
 * @param {{bytes: Uint8Array, orientation?: number, name?: string}[]} images
 * @param {{layout?: "fit"|"a4-hoch"|"a4-quer"}} [opts]
 * @returns {{bytes: Uint8Array, pages: number}}
 */
export function imagesToPdf(mupdf, images, { layout = "fit" } = {}) {
  if (images.length === 0) throw new Error("Keine Bilder ausgewählt.");
  if (!LAYOUTS.includes(layout)) throw new Error(`Unbekanntes Seitenformat: ${layout}`);
  const doc = new mupdf.PDFDocument();
  images.forEach(({ bytes, orientation = 1, name }, i) => {
    let image;
    try {
      image = new mupdf.Image(bytes);
    } catch {
      throw new Error(`${name ?? `Bild ${i + 1}`}: Bildformat wird nicht unterstützt.`);
    }
    const [nw, nh] = naturalSize(image.getWidth(), image.getHeight(), image.getXResolution(), image.getYResolution());
    const [w, h] = swapsSides(orientation) ? [nh, nw] : [nw, nh];
    const { page, box } = layoutPage(w, h, layout);
    const m = placementMatrix(...box, orientation).map(round);
    const ref = doc.addImage(image);
    const pageObj = doc.addPage([0, 0, round(page[0]), round(page[1])], 0, { XObject: { Im0: ref } }, `q ${m.join(" ")} cm /Im0 Do Q`);
    doc.insertPage(-1, pageObj);
  });
  return { bytes: doc.saveToBuffer("garbage=compact,compress").asUint8Array().slice(), pages: doc.countPages() };
}
