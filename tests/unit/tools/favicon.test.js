import { beforeAll, describe, expect, it } from "vitest";
import * as codecs from "../../../tools/_bild/codecs.js";
import { buildIco, composeSquare, htmlSnippet, makeFavicons, manifest, svgSize, wrapSvg } from "../../../tools/favicon/icons.js";
import { decodeAs, initNodeCodecs, makePixels } from "../../fixtures/bild.js";

beforeAll(initNodeCodecs);

/** ICO-Verzeichnis lesen: [{width, height, bpp, size, offset}] */
function readIco(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect([v.getUint16(0, true), v.getUint16(2, true)]).toEqual([0, 1]);
  return Array.from({ length: v.getUint16(4, true) }, (_, i) => {
    const e = 6 + i * 16;
    return { width: bytes[e] || 256, height: bytes[e + 1] || 256, bpp: v.getUint16(e + 6, true), size: v.getUint32(e + 8, true), offset: v.getUint32(e + 12, true) };
  });
}

describe("favicon", () => {
  it("setzt ein Querformat mittig auf eine quadratische Fläche", () => {
    const img = { data: new Uint8ClampedArray(4 * 2).fill(255), width: 2, height: 1 };
    const sq = composeSquare(img);
    expect([sq.width, sq.height]).toEqual([2, 2]);
    expect([...sq.data.subarray(0, 8)]).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
    expect(sq.data[8 + 3]).toBe(0); // untere Zeile durchsichtig
    const padded = composeSquare(makePixels(60, 60), { padding: 0.25, background: [255, 0, 0] });
    expect(padded.width).toBe(120);
    expect([...padded.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(() => composeSquare(img, { padding: 0.5 })).toThrow("Innenabstand");
  });

  it("schreibt einen gültigen ICO-Container", () => {
    const ico = buildIco([
      { size: 16, png: new Uint8Array([1, 2, 3]) },
      { size: 256, png: new Uint8Array([4, 5]) },
    ]);
    const dir = readIco(ico);
    expect(dir).toEqual([
      { width: 16, height: 16, bpp: 32, size: 3, offset: 38 },
      { width: 256, height: 256, bpp: 32, size: 2, offset: 41 },
    ]);
    expect([...ico.subarray(41)]).toEqual([4, 5]);
    expect(() => buildIco([])).toThrow();
  });

  it("liest SVG-Maße und packt mit Abstand ein", () => {
    expect(svgSize('<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"/>')).toMatchObject({ width: 200, height: 100 });
    expect(svgSize('<svg width="40px" height="20"/>')).toMatchObject({ width: 40, height: 20 });
    expect(() => svgSize("<html/>")).toThrow("Kein SVG");
    const src = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle r="5" cx="5" cy="5"/></svg>';
    expect(wrapSvg(src)).toBe(src);
    const wrapped = wrapSvg(src, { padding: 0.25, background: [0, 128, 255] });
    expect(wrapped).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 20 20"><rect [^>]*fill="#0080ff"\/><svg /);
    expect(wrapped).toContain('x="5" y="5" width="10" height="10"');
    expect(wrapped).not.toContain("<?xml");
  });

  it("baut Manifest und HTML", () => {
    expect(JSON.parse(manifest({ name: "Test" })).icons).toHaveLength(2);
    expect(htmlSnippet({ svg: true })).toContain("favicon.svg");
    expect(htmlSnippet()).not.toContain("favicon.svg");
  });

  it("erzeugt alle Dateien in den richtigen Größen", async () => {
    const files = await makeFavicons(codecs, makePixels(300, 200, "half"), { name: "Werkbank", svgText: '<svg viewBox="0 0 1 1"/>' });
    expect(files.map((f) => f.name)).toEqual(["favicon.ico", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "site.webmanifest"]);
    const ico = files[0].bytes;
    const dir = readIco(ico);
    expect(dir.map((d) => d.width)).toEqual([16, 32, 48]);
    for (const d of dir) {
      const png = await decodeAs("png", ico.subarray(d.offset, d.offset + d.size));
      expect([png.width, png.height]).toEqual([d.width, d.width]);
    }
    const apple = await decodeAs("png", files[2].bytes);
    expect([apple.width, apple.data[3 + 4 * 90 * 180]]).toEqual([180, 255]); // deckend, auch links
    const big = await decodeAs("png", files[4].bytes);
    expect(big.width).toBe(512);
    expect(big.data[3]).toBe(0); // Ecke durchsichtig (Querformat, kein Hintergrund)
    expect(JSON.parse(new TextDecoder().decode(files[5].bytes)).name).toBe("Werkbank");
  });
});
