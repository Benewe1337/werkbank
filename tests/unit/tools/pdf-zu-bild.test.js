import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { openPdf } from "../../../tools/_pdf/pdf.js";
import { pageFileName, renderToImage, selectPages } from "../../../tools/pdf-zu-bild/render.js";
import { makeTextPdf } from "../../fixtures/pdf.js";

describe("pdf-zu-bild", () => {
  const doc = openPdf(mupdf, makeTextPdf(mupdf, 3));
  it("rendert PNG in der gewählten Auflösung", () => {
    const { bytes, width, height } = renderToImage(mupdf, doc, 0, { dpi: 72, format: "png" });
    expect([width, height]).toEqual([595, 842]);
    const img = new mupdf.Image(bytes);
    expect([img.getWidth(), img.getXResolution()]).toEqual([595, 72]);
  });
  it("rendert JPG mit 150 dpi", () => {
    const { bytes, width } = renderToImage(mupdf, doc, 1, { dpi: 150, format: "jpg" });
    expect(width).toBe(Math.round((595 * 150) / 72));
    expect([...bytes.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });
  it("wählt Seiten und benennt Dateien sortierbar", () => {
    expect(selectPages("", 3)).toEqual([0, 1, 2]);
    expect(selectPages("3, 1-2, 2", 3)).toEqual([2, 0, 1]);
    expect(() => selectPages("4", 3)).toThrow(/gibt es nicht/);
    expect(pageFileName("bericht", 2, 12, "png")).toBe("bericht-seite-03.png");
    expect(pageFileName("bericht", 0, 3, "jpg")).toBe("bericht-seite-1.jpg");
  });
});
