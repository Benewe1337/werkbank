import { describe, expect, it } from "vitest";
import { decodeText } from "../../../tools/_text/text.js";
import { compareTexts, countLines, makePatch, summarize, toRows } from "../../../tools/text-vergleich/compare.js";

describe("text-vergleich", () => {
  it("zählt hinzugefügte und entfernte Zeilen", () => {
    const { parts, stats } = compareTexts("a\nb\nc\n", "a\nB\nc\nd\n");
    expect(stats).toEqual({ added: 2, removed: 1, same: 2 });
    expect(parts.map((p) => p.kind)).toEqual(["same", "removed", "added", "same", "added"]);
    expect(summarize(stats)).toBe("2 Zeilen hinzugefügt, 1 entfernt");
  });

  it("vergleicht wortweise", () => {
    const { parts, stats } = compareTexts("Der Hund bellt laut", "Der Kater bellt sehr laut", { mode: "words" });
    expect(parts.filter((p) => p.kind === "removed").map((p) => p.value)).toEqual(["Hund"]);
    expect(parts.filter((p) => p.kind === "added").map((p) => p.value.trim())).toEqual(["Kater", "sehr"]);
    expect(summarize(stats, "words")).toBe("2 Wörter hinzugefügt, 1 entfernt");
  });

  it("behandelt CRLF wie LF und kann Groß-/Kleinschreibung ignorieren", () => {
    expect(compareTexts("a\r\nb\r\n", "a\nb\n").stats).toMatchObject({ added: 0, removed: 0 });
    expect(compareTexts("Hallo\n", "hallo\n", { ignoreCase: true }).stats).toMatchObject({ added: 0, removed: 0 });
  });

  it("formuliert Sonderfälle der Zusammenfassung", () => {
    expect(summarize({ added: 0, removed: 0 })).toBe("Keine Unterschiede.");
    expect(summarize({ added: 1, removed: 0 })).toBe("1 Zeile hinzugefügt");
    expect(summarize({ added: 0, removed: 1 }, "words")).toBe("1 Wort entfernt");
  });

  it("nummeriert Zeilen links und rechts", () => {
    const rows = toRows(compareTexts("a\nb\n", "a\nc\n").parts);
    expect(rows).toEqual([
      { kind: "same", text: "a", left: 1, right: 1 },
      { kind: "removed", text: "b", left: 2, right: null },
      { kind: "added", text: "c", left: null, right: 2 },
    ]);
  });

  it("zählt Zeilen ohne abschließenden Umbruch", () => {
    expect([countLines(""), countLines("a"), countLines("a\n"), countLines("a\nb")]).toEqual([0, 1, 1, 2]);
  });

  it("erzeugt einen Unified-Diff", () => {
    const patch = makePatch("a\nb\n", "a\nc\n", "alt.txt", "neu.txt");
    expect(patch).toContain("--- alt.txt");
    expect(patch).toContain("-b\n+c");
  });

  it("ignoriert fehlenden Umbruch am Textende", () => {
    expect(compareTexts("a\nb", "a\nb\nc").stats).toEqual({ added: 1, removed: 0, same: 2 });
  });

  it("lehnt unbekannte Vergleichsart ab", () => {
    expect(() => compareTexts("a", "b", { mode: "zeichen" })).toThrow(/Vergleichsart/);
  });

  it("dekodiert UTF-8, UTF-16 und Windows-1252, lehnt Binärdaten ab", () => {
    expect(decodeText(new TextEncoder().encode("Grüße"))).toBe("Grüße");
    expect(decodeText(new Uint8Array([0x47, 0x72, 0xfc, 0xdf, 0x65]))).toBe("Grüße");
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe("A");
    expect(() => decodeText(new Uint8Array([0x89, 0x50, 0x00, 0x01]))).toThrow(/Textdatei/);
  });
});
