import { describe, expect, it } from "vitest";
import { baseName, formatSaving, formatSize, matchesAccept, outputName, parsePageRanges } from "../../src/shared/format.js";

describe("format", () => {
  it("formatiert Größen deutsch", () => {
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(6.6 * 1024 * 1024)).toBe("6,6 MB");
  });
  it("berechnet Ersparnis", () => {
    expect(formatSaving(100, 62)).toBe("−38 %");
    expect(formatSaving(100, 120)).toBe("+20 %");
  });
  it("baut Dateinamen", () => {
    expect(baseName("a.b.pdf")).toBe("a.b");
    expect(outputName("foto.HEIC", "", "jpg")).toBe("foto.jpg");
    expect(outputName("bericht.pdf", "-klein")).toBe("bericht-klein.pdf");
    expect(outputName("ohne", "-x", "zip")).toBe("ohne-x.zip");
  });
  it("prüft accept-Listen", () => {
    expect(matchesAccept({ name: "a.PDF", type: "" }, ".pdf")).toBe(true);
    expect(matchesAccept({ name: "a.png", type: "image/png" }, "image/*")).toBe(true);
    expect(matchesAccept({ name: "a.txt", type: "text/plain" }, ".pdf,image/*")).toBe(false);
    expect(matchesAccept({ name: "x", type: "" }, "")).toBe(true);
  });
  it("liest Seitenbereiche", () => {
    expect(parsePageRanges("", 3)).toEqual([0, 1, 2]);
    expect(parsePageRanges("1-2, 5", 5)).toEqual([0, 1, 4]);
    expect(parsePageRanges("4-", 5)).toEqual([3, 4]);
    expect(parsePageRanges("-2", 5)).toEqual([0, 1]);
    expect(() => parsePageRanges("7", 5)).toThrow(/gibt es nicht/);
    expect(() => parsePageRanges("abc", 5)).toThrow(/Ungültige/);
  });
});
