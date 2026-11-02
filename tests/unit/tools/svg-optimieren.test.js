import { optimize } from "svgo/browser";
import { describe, expect, it } from "vitest";
import { byteLength, looksLikeSvg, optimizeSvg } from "../../../tools/svg-optimieren/svg.js";
import { BLOATED_SVG } from "../../fixtures/bild.js";

describe("svg-optimieren", () => {
  it("macht ein aufgeblähtes SVG deutlich kleiner und behält viewBox und Formen", () => {
    const out = optimizeSvg(optimize, BLOATED_SVG);
    expect(byteLength(out)).toBeLessThan(byteLength(BLOATED_SVG) / 2);
    expect(out).toContain('viewBox="0 0 100 100"');
    expect(out).toMatch(/<circle|<path|<rect/);
    expect(out).not.toContain("inkscape");
    expect(out).not.toContain("<!--");
    expect(out).toContain("80.123");
    expect(out).not.toContain("80.1234");
  });

  it("rundet auf die gewählten Nachkommastellen und rückt auf Wunsch ein", () => {
    const out = optimizeSvg(optimize, BLOATED_SVG, { precision: 1, pretty: true });
    expect(out).toContain("80.1");
    expect(out).not.toContain("80.12");
    expect(out.split("\n").length).toBeGreaterThan(2);
  });

  it("meldet Nicht-SVG und kaputtes SVG verständlich", () => {
    expect(looksLikeSvg("<html></html>")).toBe(false);
    expect(() => optimizeSvg(optimize, "einfach nur Text")).toThrow("Kein SVG");
    expect(() => optimizeSvg(optimize, "<svg><g></svg")).toThrow("SVG ließ sich nicht lesen");
  });

  it("zählt UTF-8-Bytes", () => {
    expect(byteLength("ä")).toBe(2);
  });
});
