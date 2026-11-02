import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { cleanPageText, extractText } from "../../../tools/pdf-text/text.js";
import { makeTextPdf } from "../../fixtures/pdf.js";
import { makeImagePdf, makeLinesPdf } from "../../fixtures/pdf-extra.js";

describe("pdf-text", () => {
  it("liest Text seitenweise", () => {
    const r = extractText(mupdf, makeLinesPdf(mupdf, [["Erste Zeile", "Zweite Zeile"], ["Andere Seite"]]));
    expect(r.pages[0]).toMatch(/^Erste Zeile\n+Zweite Zeile$/);
    expect(r.pages[1]).toBe("Andere Seite");
    expect(r.text).toContain("── Seite 2 ──\n\nAndere Seite");
    expect(r.likelyScanned).toBe(false);
  });
  it("erkennt Seiten ohne eingebetteten Text", () => {
    const blank = new mupdf.PDFDocument();
    blank.insertPage(-1, blank.addPage([0, 0, 595, 842], 0, {}, ""));
    const r = extractText(mupdf, blank.saveToBuffer("").asUint8Array().slice());
    expect(r.chars).toBe(0);
    expect(r.likelyScanned).toBe(true);
    expect(extractText(mupdf, makeImagePdf(mupdf, { width: 100, height: 100, text: null })).likelyScanned).toBe(true);
  });
  it("räumt Leerraum auf", () => {
    expect(cleanPageText("a  \r\n\n\n\nb \n")).toBe("a\n\nb");
    expect(extractText(mupdf, makeTextPdf(mupdf, 1)).text).toBe("Seite 1");
  });
});
