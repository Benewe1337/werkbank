import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { splitGroups, splitPdf } from "../../../tools/pdf-aufteilen/split.js";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";

describe("pdf-aufteilen", () => {
  it("berechnet Gruppen je Modus", () => {
    expect(splitGroups("single", 3)).toEqual([[0], [1], [2]]);
    expect(splitGroups("every", 5, { n: 2 })).toEqual([[0, 1], [2, 3], [4]]);
    expect(splitGroups("ranges", 6, { ranges: "1-3, 4-6" })).toEqual([[0, 1, 2], [3, 4, 5]]);
    expect(splitGroups("ranges", 6, { ranges: "5-; 1 2" })).toEqual([[4, 5], [0, 1]]);
    expect(splitGroups("extract", 6, { ranges: "2, 4-5" })).toEqual([[1, 3, 4]]);
  });
  it("meldet ungültige Eingaben verständlich", () => {
    expect(() => splitGroups("every", 3, { n: 0 })).toThrow(/ganze Zahl/);
    expect(() => splitGroups("ranges", 3, { ranges: " " })).toThrow(/Bereiche angeben/);
    expect(() => splitGroups("ranges", 3, { ranges: "1-9" })).toThrow(/gibt es nicht/);
    expect(() => splitGroups("extract", 3, { ranges: "" })).toThrow(/Seiten angeben/);
  });
  it("teilt nach Bereichen mit echtem Inhalt", () => {
    const { pagesIn, parts } = splitPdf(mupdf, makeTextPdf(mupdf, 5), "ranges", { ranges: "1-2, 5, 3-4" });
    expect(pagesIn).toBe(5);
    expect(parts.map((p) => p.label)).toEqual(["1-2", "5", "3-4"]);
    expect(parts.map((p) => pageTexts(mupdf, p.bytes))).toEqual([["Seite 1", "Seite 2"], ["Seite 5"], ["Seite 3", "Seite 4"]]);
  });
  it("extrahiert Seiten in eine Datei", () => {
    const { parts } = splitPdf(mupdf, makeTextPdf(mupdf, 4), "extract", { ranges: "4, 1" });
    expect(parts).toHaveLength(1);
    expect(pageTexts(mupdf, parts[0].bytes)).toEqual(["Seite 4", "Seite 1"]);
  });
});
