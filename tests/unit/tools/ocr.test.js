import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { MAX_SIDE_PX, checkLanguage, fileKind, joinPages, percent, renderDpi } from "../../../tools/ocr/ocr.js";
import { openPdf, renderPage } from "../../../tools/ocr/render.js";
import { makeTextPdf } from "../../fixtures/pdf.js";

describe("ocr: Logik", () => {
  it("erkennt Bild, PDF und Unpassendes", () => {
    expect(fileKind({ name: "a.PNG", type: "" })).toBe("image");
    expect(fileKind({ name: "x", type: "image/webp" })).toBe("image");
    expect(fileKind({ name: "scan.pdf", type: "" })).toBe("pdf");
    expect(fileKind({ name: "bild.gif", type: "image/gif" })).toBeNull();
  });

  it("prüft Sprachen", () => {
    expect(checkLanguage("deu+eng")).toBe("deu+eng");
    expect(() => checkLanguage("fra")).toThrow(/Sprache/);
  });

  it("rendert A4 mit 300 dpi und begrenzt riesige Seiten", () => {
    expect(renderDpi(595, 842)).toBe(300);
    const dpi = renderDpi(2384, 3370); // A0
    expect((3370 / 72) * dpi).toBeLessThanOrEqual(MAX_SIDE_PX);
    expect(renderDpi(100000, 100000)).toBe(72);
    expect(() => renderDpi(0, 0)).toThrow();
  });

  it("setzt Seiten zusammen", () => {
    expect(joinPages(["  Hallo  \nWelt \n"])).toBe("Hallo\nWelt\n");
    expect(joinPages([""])).toBe("");
    expect(joinPages(["A", "B"])).toBe("--- Seite 1 ---\n\nA\n\n--- Seite 2 ---\n\nB\n");
  });

  it("formatiert Fortschritt", () => {
    expect([percent(0), percent(0.456), percent(2), percent(undefined)]).toEqual(["0 %", "46 %", "100 %", "0 %"]);
  });
});

describe("ocr: PDF-Seiten rendern", () => {
  it("rendert eine A4-Seite als PNG mit 300 dpi", () => {
    const doc = openPdf(mupdf, makeTextPdf(mupdf, 2));
    expect(doc.countPages()).toBe(2);
    const { png, dpi, width, height } = renderPage(mupdf, doc, 1);
    expect(dpi).toBe(300);
    expect(Math.abs(width - (595 * 300) / 72)).toBeLessThan(2);
    expect(Math.abs(height - (842 * 300) / 72)).toBeLessThan(2);
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });

  it("meldet kaputte PDFs", () => {
    expect(() => openPdf(mupdf, new TextEncoder().encode("kein pdf"))).toThrow(/Keine lesbare PDF/);
  });
});
