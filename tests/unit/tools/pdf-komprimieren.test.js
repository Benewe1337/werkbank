import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { compressPdf, targetSize } from "../../../tools/pdf-komprimieren/compress.js";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";
import { makeImagePdf, pdfImages } from "../../fixtures/pdf-extra.js";

describe("pdf-komprimieren", () => {
  it("rechnet Bilder auf die Ziel-Auflösung herunter und behält Text", () => {
    // 1200 px auf 300 pt = 288 dpi
    const input = makeImagePdf(mupdf, { pages: 2 });
    const r = compressPdf(mupdf, input, { dpi: 96, quality: 60 });
    expect(r.kept).toBe(false);
    expect(r.after).toBeLessThan(r.before / 10);
    expect(r.imagesRewritten).toBe(2);
    expect(pdfImages(mupdf, r.bytes)).toEqual([
      { width: 400, height: 300, filter: "/DCTDecode" },
      { width: 400, height: 300, filter: "/DCTDecode" },
    ]);
    expect(pageTexts(mupdf, r.bytes)).toEqual(["Bildseite 1", "Bildseite 2"]);
  });
  it("hält die Bildausrichtung (rote Ecke bleibt oben links)", () => {
    const r = compressPdf(mupdf, makeImagePdf(mupdf, { width: 800, height: 800, drawPt: 200 }), { dpi: 72, quality: 80 });
    const page = mupdf.Document.openDocument(r.bytes, "application/pdf").loadPage(0);
    const pix = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
    const px = pix.getPixels();
    // Bild liegt bei x 72–272, y (von oben) 842-300-200=342 bis 542
    const at = (x, y) => [...px.slice((y * pix.getWidth() + x) * 3, (y * pix.getWidth() + x) * 3 + 3)];
    const [r1, g1] = at(78, 348);
    expect(r1).toBeGreaterThan(200);
    expect(g1).toBeLessThan(60);
    expect(at(78, 536)[1]).toBeGreaterThan(150);
  });
  it("behält das Original, wenn nichts kleiner wird", () => {
    // Bereits aufgeräumte Datei: ein zweiter Durchlauf bringt nichts mehr.
    const input = compressPdf(mupdf, makeTextPdf(mupdf, 1)).bytes;
    const r = compressPdf(mupdf, input);
    expect(r.kept).toBe(true);
    expect(r.bytes).toEqual(input);
  });
  it("lässt Bilder mit passender Auflösung in Ruhe", () => {
    expect(targetSize(600, 400, 432, 150)).toBeNull(); // 100 dpi
    expect(targetSize(3000, 2000, 432, 150)).toEqual({ width: 900, height: 600 }); // 500 dpi
    expect(targetSize(3000, 2000, undefined, 150)).toBeNull();
  });
});
