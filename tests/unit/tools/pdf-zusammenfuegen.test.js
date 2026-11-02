import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { mergePdfs } from "../../../tools/pdf-zusammenfuegen/merge.js";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";

describe("pdf-zusammenfuegen", () => {
  it("verbindet PDFs in der angegebenen Reihenfolge", () => {
    const a = makeTextPdf(mupdf, 2, "A");
    const b = makeTextPdf(mupdf, 1, "B");
    const { bytes, pages } = mergePdfs(mupdf, [b, a]);
    expect(pages).toBe(3);
    expect(pageTexts(mupdf, bytes)).toEqual(["B 1", "A 1", "A 2"]);
  });
  it("meldet kaputte Dateien mit Position", () => {
    expect(() => mergePdfs(mupdf, [makeTextPdf(mupdf, 1), new TextEncoder().encode("x")])).toThrow(/Datei 2/);
  });
  it("braucht mindestens eine Datei", () => {
    expect(() => mergePdfs(mupdf, [])).toThrow(/Keine Dateien/);
  });
});
