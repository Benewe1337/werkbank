import { beforeAll, describe, expect, it } from "vitest";
import * as codecs from "../../../tools/_bild/codecs.js";
import { detectFormat } from "../../../tools/_bild/format.js";
import { resizeImage, targetSize } from "../../../tools/bild-groesse/size.js";
import { decodeAs, encodeAs, initNodeCodecs, makePixels } from "../../fixtures/bild.js";

beforeAll(initNodeCodecs);

const src = { width: 4000, height: 3000 };

describe("bild-groesse: Zielmaße", () => {
  it("rechnet die fehlende Seite aus", () => {
    expect(targetSize(src, { unit: "px", width: "1200", height: "", keepRatio: true })).toEqual({ width: 1200, height: 900 });
    expect(targetSize(src, { unit: "px", width: "", height: "600", keepRatio: false })).toEqual({ width: 800, height: 600 });
  });

  it("passt bei gehaltenem Seitenverhältnis in den Rahmen", () => {
    expect(targetSize(src, { unit: "px", width: "1000", height: "1000", keepRatio: true })).toEqual({ width: 1000, height: 750 });
  });

  it("verzerrt ohne Seitenverhältnis", () => {
    expect(targetSize(src, { unit: "px", width: "500", height: "500", keepRatio: false })).toEqual({ width: 500, height: 500 });
  });

  it("rechnet Prozent", () => {
    expect(targetSize(src, { unit: "percent", width: "25", keepRatio: true })).toEqual({ width: 1000, height: 750 });
    expect(targetSize(src, { unit: "percent", width: "50", height: "10", keepRatio: false })).toEqual({ width: 2000, height: 300 });
    expect(targetSize({ width: 3, height: 3 }, { unit: "percent", width: "1", keepRatio: true })).toEqual({ width: 1, height: 1 });
  });

  it("meldet ungültige Eingaben", () => {
    expect(() => targetSize(src, { unit: "px", width: "", height: "", keepRatio: true })).toThrow("Breite oder eine Höhe");
    expect(() => targetSize(src, { unit: "px", width: "-5", keepRatio: true })).toThrow("keine gültige Größe");
    expect(() => targetSize(src, { unit: "percent", width: "1000", keepRatio: true })).toThrow("Höchstens");
  });
});

describe("bild-groesse: Skalieren", () => {
  it("verkleinert ein PNG mit Alpha und behält das Format", async () => {
    const png = await encodeAs("png", makePixels(200, 100, "half"));
    const r = await resizeImage(codecs, png, { unit: "px", width: "50", height: "", keepRatio: true, target: "same", quality: 85 });
    expect(r.to).toEqual({ width: 50, height: 25 });
    expect(detectFormat(r.bytes)).toBe("png");
    const img = await decodeAs("png", r.bytes);
    expect([img.width, img.height]).toEqual([50, 25]);
    expect(img.data[3]).toBe(0);
    expect(img.data[(49) * 4 + 3]).toBe(255);
  });

  it("wandelt beim Skalieren in ein anderes Format", async () => {
    const jpeg = await encodeAs("jpeg", makePixels(120, 80));
    const r = await resizeImage(codecs, jpeg, { unit: "percent", width: "50", keepRatio: true, target: "webp", quality: 80 });
    expect(detectFormat(r.bytes)).toBe("webp");
    expect(r.to).toEqual({ width: 60, height: 40 });
  });
});
