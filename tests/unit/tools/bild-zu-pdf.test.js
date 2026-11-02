import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { imagesToPdf, layoutPage, placementMatrix } from "../../../tools/bild-zu-pdf/images.js";
import { makeJpeg, makePng } from "../../fixtures/pdf-extra.js";

const render = (bytes, i = 0) => {
  const page = mupdf.Document.openDocument(bytes, "application/pdf").loadPage(i);
  const pix = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const px = pix.getPixels();
  const w = pix.getWidth();
  return { w, h: pix.getHeight(), at: (x, y) => [...px.slice((y * w + x) * 3, (y * w + x) * 3 + 3)] };
};
const isRed = ([r, g, b]) => r > 200 && g < 70 && b < 70;

describe("bild-zu-pdf", () => {
  it("macht aus JPG und PNG je eine Seite in Bildgröße", () => {
    const { bytes, pages } = imagesToPdf(mupdf, [{ bytes: makeJpeg(mupdf, 192, 96) }, { bytes: makePng(mupdf, 96, 96) }]);
    expect(pages).toBe(2);
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    // 96 dpi ohne Angabe: 192 px = 144 pt
    expect(doc.loadPage(0).getBounds()).toEqual([0, 0, 144, 72]);
    expect(doc.loadPage(1).getBounds()).toEqual([0, 0, 72, 72]);
    expect(isRed(render(bytes).at(3, 3))).toBe(true);
  });
  it("setzt Bilder auf A4 mit Rand", () => {
    const { bytes } = imagesToPdf(mupdf, [{ bytes: makePng(mupdf, 400, 200) }], { layout: "a4-quer" });
    const r = render(bytes);
    expect(r.w).toBe(842);
    expect(Math.abs(r.h - 595.28)).toBeLessThan(1);
    expect(r.at(5, 5)).toEqual([255, 255, 255]);
    expect(layoutPage(400, 200, "a4-hoch").box[0]).toBeCloseTo(36);
  });
  it("wendet die EXIF-Orientierung an", () => {
    // 6 = 90° im Uhrzeigersinn: rote Ecke wandert nach oben rechts, Seite wird hochkant
    const { bytes } = imagesToPdf(mupdf, [{ bytes: makePng(mupdf, 160, 80), orientation: 6 }]);
    const r = render(bytes);
    expect([r.w, r.h]).toEqual([60, 120]);
    expect(isRed(r.at(r.w - 3, 3))).toBe(true);
    expect(isRed(r.at(3, 3))).toBe(false);
    expect(placementMatrix(0, 0, 10, 20, 1)).toEqual([10, -0, -0, 20, 0, 0]);
  });
  it("meldet unlesbare Bilder mit Namen", () => {
    expect(() => imagesToPdf(mupdf, [{ bytes: new TextEncoder().encode("x"), name: "kaputt.png" }])).toThrow(/kaputt.png/);
    expect(() => imagesToPdf(mupdf, [])).toThrow(/Keine Bilder/);
  });
});
