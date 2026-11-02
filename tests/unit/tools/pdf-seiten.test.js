import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { editPages, normalizeRotation } from "../../../tools/pdf-seiten/pages.js";
import { thumbnail } from "../../../tools/_pdf/pdf.js";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";

const rotations = (bytes) => {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
  return Array.from({ length: doc.countPages() }, (_, i) => doc.findPage(i).getInheritable("Rotate").valueOf() || 0);
};

describe("pdf-seiten", () => {
  it("sortiert um, löscht und dreht Seiten", () => {
    const { bytes, pages } = editPages(mupdf, makeTextPdf(mupdf, 4), [
      { index: 3, rotate: 90 },
      { index: 0 },
      { index: 2, rotate: -90 },
    ]);
    expect(pages).toBe(3);
    expect(pageTexts(mupdf, bytes)).toEqual(["Seite 4", "Seite 1", "Seite 3"]);
    expect(rotations(bytes)).toEqual([90, 0, 270]);
  });
  it("addiert die Drehung zur vorhandenen", () => {
    const once = editPages(mupdf, makeTextPdf(mupdf, 1), [{ index: 0, rotate: 270 }]).bytes;
    expect(rotations(editPages(mupdf, once, [{ index: 0, rotate: 180 }]).bytes)).toEqual([90]);
  });
  it("normalisiert Drehwinkel", () => {
    expect([0, 90, -90, 360, 450, -180].map(normalizeRotation)).toEqual([0, 90, 270, 0, 90, 180]);
  });
  it("lehnt leere Auswahl und falsche Seiten ab", () => {
    expect(() => editPages(mupdf, makeTextPdf(mupdf, 2), [])).toThrow(/Mindestens eine Seite/);
    expect(() => editPages(mupdf, makeTextPdf(mupdf, 2), [{ index: 5 }])).toThrow(/Seite 6/);
    expect(() => editPages(mupdf, new TextEncoder().encode("kein pdf"), [{ index: 0 }])).toThrow(/keine lesbare PDF/);
  });
  it("rendert kleine Vorschaubilder", () => {
    const doc = mupdf.Document.openDocument(makeTextPdf(mupdf, 1), "application/pdf");
    const t = thumbnail(mupdf, doc.loadPage(0), 200);
    expect(t.height).toBe(200);
    expect(t.width).toBeLessThan(200);
    expect([...t.png.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });
});
