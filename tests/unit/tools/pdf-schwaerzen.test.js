import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { findInLine, parseTerms, redactPdf, remainingHits } from "../../../tools/pdf-schwaerzen/redact.js";
import { pageTexts } from "../../fixtures/pdf.js";
import { makeLinesPdf } from "../../fixtures/pdf-extra.js";

const sample = () =>
  makeLinesPdf(mupdf, [
    ["Max Mustermann wohnt in Berlin", "Kontakt: max@example.org"],
    ["Keine Treffer hier"],
    ["MUSTERMANN und mustermann"],
  ]);

describe("pdf-schwaerzen", () => {
  it("liest Begriffe zeilenweise ohne Doppelte", () => {
    expect(parseTerms(" Max \n\nBerlin\nMax\r\n")).toEqual(["Max", "Berlin"]);
  });
  it("findet Treffer mit und ohne Groß-/Kleinschreibung", () => {
    expect(findInLine("Max max MAX", "max", false)).toEqual([[0, 3], [4, 7], [8, 11]]);
    expect(findInLine("Max max MAX", "max", true)).toEqual([[4, 7]]);
    expect(findInLine("aaaa", "aa", false)).toEqual([[0, 2], [2, 4]]);
  });
  it("entfernt den Text wirklich und zählt Treffer je Seite", () => {
    const r = redactPdf(mupdf, sample(), ["Mustermann", "max@example.org"]);
    expect(r.total).toBe(4);
    expect(r.pages.map((p) => [p.page, p.hits])).toEqual([[1, 2], [3, 2]]);
    const texts = pageTexts(mupdf, r.bytes);
    expect(texts.join(" ")).not.toMatch(/mustermann|example/i);
    expect(texts[0]).toContain("wohnt in Berlin");
    expect(remainingHits(mupdf, r.bytes, ["Mustermann"])).toBe(0);
    // Auch im Rohinhalt der Datei darf nichts übrig sein.
    const raw = mupdf.Document.openDocument(r.bytes, "application/pdf").asPDF().saveToBuffer("decompress").asString();
    expect(raw).not.toMatch(/Mustermann|example\.org/);
  });
  it("beachtet Groß-/Kleinschreibung auf Wunsch", () => {
    const r = redactPdf(mupdf, sample(), ["mustermann"], { caseSensitive: true });
    expect(r.total).toBe(1);
    expect(pageTexts(mupdf, r.bytes)[2]).toContain("MUSTERMANN");
  });
  it("meldet, wenn nichts gefunden wurde", () => {
    const r = redactPdf(mupdf, sample(), ["Hamburg"]);
    expect([r.total, r.bytes]).toEqual([0, null]);
    expect(() => redactPdf(mupdf, sample(), [])).toThrow(/Suchbegriff/);
  });
});
