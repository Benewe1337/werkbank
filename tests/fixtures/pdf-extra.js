// Zusätzliche Testdateien für die PDF-Werkzeuge, zur Laufzeit mit MuPDF erzeugt.

/**
 * RGB-Pixmap mit Verlauf und etwas Rauschen (damit Kompression etwas zu tun hat).
 * Die linke obere Ecke (1/8 der Breite) ist rot, um die Ausrichtung prüfen zu können.
 */
export function makePixmap(mupdf, width, height, { seed = 1 } = {}) {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
  const px = pix.getPixels();
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) % 32);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const corner = x < width / 8 && y < height / 8;
      px[i] = corner ? 255 : (x * 255) / width + rand();
      px[i + 1] = corner ? 0 : (y * 255) / height + rand();
      px[i + 2] = corner ? 0 : 128 + rand();
    }
  }
  return pix;
}

export function makePng(mupdf, width = 120, height = 80) {
  return makePixmap(mupdf, width, height).asPNG().slice();
}

export function makeJpeg(mupdf, width = 120, height = 80, quality = 90) {
  return makePixmap(mupdf, width, height).asJPEG(quality).slice();
}

/**
 * PDF mit einem großen, unkomprimiert-verlustfrei gespeicherten Bild pro Seite (Flate),
 * gezeichnet auf `drawPt` × `drawPt * h/w` Punkten. `text: null` lässt die Textzeile weg (wie ein Scan).
 */
export function makeImagePdf(mupdf, { pages = 1, width = 1200, height = 900, drawPt = 300, text = "Bildseite" } = {}) {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  for (let p = 1; p <= pages; p++) {
    const image = doc.addImage(new mupdf.Image(makePixmap(mupdf, width, height, { seed: p })));
    const h = (drawPt * height) / width;
    const label = text === null ? "" : ` BT /F1 24 Tf 72 700 Td (${text} ${p}) Tj ET`;
    const contents = `q ${drawPt} 0 0 ${h} 72 300 cm /Im0 Do Q${label}`;
    const page = doc.addPage([0, 0, 595, 842], 0, { XObject: { Im0: image }, Font: { F1: font } }, contents);
    doc.insertPage(-1, page);
  }
  return doc.saveToBuffer("compress").asUint8Array().slice();
}

/** PDF mit beliebigen Textzeilen auf einer Seite (je Zeile 40 pt Abstand). */
export function makeLinesPdf(mupdf, pages) {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  for (const lines of pages) {
    const ops = lines.map((line, i) => `BT /F1 18 Tf 72 ${760 - i * 40} Td (${line}) Tj ET`).join("\n");
    doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: { F1: font } }, ops));
  }
  return doc.saveToBuffer("compress").asUint8Array().slice();
}

/** Bildeigenschaften aller Bild-Objekte einer PDF (Breite, Höhe, Filter). */
export function pdfImages(mupdf, bytes) {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
  const out = [];
  for (let n = 1; n < doc.countObjects(); n++) {
    const obj = doc.newIndirect(n);
    if (!obj.isStream() || String(obj.get("Subtype")) !== "/Image") continue;
    out.push({ width: obj.get("Width").valueOf(), height: obj.get("Height").valueOf(), filter: String(obj.get("Filter")) });
  }
  return out;
}

/** Fügt einem JPEG einen minimalen EXIF-Block mit der Orientierung `orientation` (1–8) hinzu. */
export function withExifOrientation(jpeg, orientation) {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = payload.length + 2;
  const app1 = [0xff, 0xe1, length >> 8, length & 0xff, ...payload];
  return new Uint8Array([...jpeg.slice(0, 2), ...app1, ...jpeg.slice(2)]);
}
