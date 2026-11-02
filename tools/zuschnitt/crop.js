// Port von crop.py (PyMuPDF) auf MuPDF.js (WebAssembly).
// Findet auf jeder Seite die 16:9-Folienrahmen eines Handouts und legt
// jede nicht-leere Folie als eigene Seite in einem neuen PDF ab.

export const MIN_FRAME_WIDTH = 500;
export const MIN_FRAME_HEIGHT = 280;
export const ASPECT = 16 / 9;
export const ASPECT_TOLERANCE = 0.1;
export const SAME_ROW_TOLERANCE = 2;
export const EMPTY_INSET = 2;
export const EMPTY_DPI = 20;

const width = (r) => r[2] - r[0];
const height = (r) => r[3] - r[1];

/** Achsenparalleles Begrenzungsrechteck eines Pfads nach Anwendung von ctm (wie get_drawings()["rect"]). */
export function pathBounds(path, ctm) {
  const r = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x, y) => {
    const X = ctm[0] * x + ctm[2] * y + ctm[4];
    const Y = ctm[1] * x + ctm[3] * y + ctm[5];
    r[0] = Math.min(r[0], X);
    r[1] = Math.min(r[1], Y);
    r[2] = Math.max(r[2], X);
    r[3] = Math.max(r[3], Y);
  };
  path.walk({
    moveTo: add,
    lineTo: add,
    curveTo(x1, y1, x2, y2, x3, y3) {
      add(x1, y1);
      add(x2, y2);
      add(x3, y3);
    },
  });
  return r;
}

export function isSlideFrame(r) {
  const w = width(r);
  const h = height(r);
  return w > MIN_FRAME_WIDTH && h > MIN_FRAME_HEIGHT && Math.abs(w / h - ASPECT) < ASPECT_TOLERANCE;
}

/** Alle Folienrahmen einer Seite, oben nach unten, ein Rahmen pro Zeile. */
export function findFrames(mupdf, page) {
  const frames = [];
  const consider = (path, ctm) => {
    const r = pathBounds(path, ctm);
    if (!isSlideFrame(r)) return;
    if (frames.some((q) => Math.abs(r[1] - q[1]) < SAME_ROW_TOLERANCE)) return;
    frames.push(r);
  };
  const device = new mupdf.Device({
    fillPath: (path, _evenOdd, ctm) => consider(path, ctm),
    strokePath: (path, _stroke, ctm) => consider(path, ctm),
  });
  try {
    page.run(device, mupdf.Matrix.identity);
  } finally {
    device.close();
  }
  return frames.sort((a, b) => a[1] - b[1]);
}

/** Leer = gerendert (20 dpi, 2pt Innenrand) höchstens zwei verschiedene Bytewerte. */
export function isEmptyFrame(mupdf, page, r) {
  const scale = EMPTY_DPI / 72;
  const clip = [r[0] + EMPTY_INSET, r[1] + EMPTY_INSET, r[2] - EMPTY_INSET, r[3] - EMPTY_INSET];
  const bbox = [
    Math.ceil(clip[0] * scale),
    Math.ceil(clip[1] * scale),
    Math.floor(clip[2] * scale),
    Math.floor(clip[3] * scale),
  ];
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
  try {
    pixmap.clear(255);
    const device = new mupdf.DrawDevice(mupdf.Matrix.scale(scale, scale), pixmap);
    try {
      page.run(device, mupdf.Matrix.identity);
    } finally {
      device.close();
    }
    const seen = new Set();
    for (const v of pixmap.getPixels()) {
      seen.add(v);
      if (seen.size > 2) return false;
    }
    return true;
  } finally {
    pixmap.destroy?.();
  }
}

/** Seitenkoordinaten (oben links, wie PyMuPDF) -> PDF-Nutzerraum der Quellseite. */
export function toPdfSpace(mupdf, page, r) {
  const inv = mupdf.Matrix.invert(page.getTransform());
  const pts = [
    [r[0], r[1]],
    [r[2], r[1]],
    [r[0], r[3]],
    [r[2], r[3]],
  ].map(([x, y]) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Sichtbereich der Seite auf rect (PDF-Raum) setzen; der Inhalt außerhalb wird abgeschnitten. */
function setVisibleArea(doc, index, rect) {
  const pageObj = doc.findPage(index);
  pageObj.put("MediaBox", rect);
  for (const box of ["CropBox", "BleedBox", "TrimBox", "ArtBox"]) pageObj.delete(box);
}

/**
 * Schneidet ein Handout-PDF zu.
 * @param {typeof import("mupdf")} mupdf
 * @param {Uint8Array|ArrayBuffer} input
 * @param {(msg: {level: "warn"|"info", page: number, text: string}) => void} [onLog]
 * @returns {{bytes: Uint8Array, pagesIn: number, pagesOut: number}}
 */
export function cropHandout(mupdf, input, onLog = () => {}) {
  const src = mupdf.Document.openDocument(input, "application/pdf").asPDF();
  if (!src) throw new Error("Keine gültige PDF-Datei.");
  const dst = new mupdf.PDFDocument();
  const graft = dst.newGraftMap();
  const pagesIn = src.countPages();

  for (let n = 0; n < pagesIn; n++) {
    const page = src.loadPage(n);
    const frames = findFrames(mupdf, page);
    if (frames.length === 0) {
      onLog({ level: "warn", page: n + 1, text: "kein Folienrahmen gefunden" });
      continue;
    }
    for (const r of frames) {
      if (isEmptyFrame(mupdf, page, r)) {
        onLog({ level: "info", page: n + 1, text: "leerer Rahmen übersprungen" });
        continue;
      }
      graft.graftPage(-1, src, n);
      setVisibleArea(dst, dst.countPages() - 1, toPdfSpace(mupdf, page, r));
    }
  }

  const pagesOut = dst.countPages();
  if (pagesOut === 0) throw new Error("Keine Folien gefunden – ist das ein Folien-Handout?");
  const buffer = dst.saveToBuffer("garbage=4,compress");
  return { bytes: buffer.asUint8Array().slice(), pagesIn, pagesOut };
}
