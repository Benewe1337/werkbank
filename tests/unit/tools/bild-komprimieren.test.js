import { beforeAll, describe, expect, it } from "vitest";
import * as codecs from "../../../tools/_bild/codecs.js";
import { detectFormat, flattenAlpha, parseHexColor, parseQuality } from "../../../tools/_bild/format.js";
import { compressImage, targetFormat } from "../../../tools/bild-komprimieren/compress.js";
import { decodeAs, encodeAs, initNodeCodecs, makeHeic, makePixels } from "../../fixtures/bild.js";

beforeAll(initNodeCodecs);

describe("_bild/format", () => {
  it("erkennt Formate an den ersten Bytes", async () => {
    const img = makePixels(8, 8);
    expect(detectFormat(await encodeAs("jpeg", img))).toBe("jpeg");
    expect(detectFormat(await encodeAs("png", img))).toBe("png");
    expect(detectFormat(await encodeAs("webp", img))).toBe("webp");
    expect(detectFormat(await encodeAs("avif", img))).toBe("avif");
    expect(detectFormat(makeHeic())).toBe("heic");
    expect(detectFormat(new TextEncoder().encode("hallo welt, kein bild"))).toBe(null);
  });

  it("legt Transparenz auf Weiß, ohne das Original zu ändern", () => {
    const img = { data: new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]), width: 2, height: 1 };
    const flat = flattenAlpha(img);
    expect([...flat.data]).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(img.data[3]).toBe(0);
  });

  it("prüft Farben und Qualität", () => {
    expect(parseHexColor("#ff8800")).toEqual([255, 136, 0]);
    expect(() => parseHexColor("rot")).toThrow("Ungültige Farbe");
    expect(parseQuality("75")).toBe(75);
    expect(() => parseQuality(0)).toThrow("zwischen 1 und 100");
  });
});

describe("bild-komprimieren", () => {
  it("wählt das Zielformat", () => {
    expect(targetFormat("png", "same")).toBe("png");
    expect(targetFormat("png", "webp")).toBe("webp");
    expect(() => targetFormat("png", "bmp")).toThrow("Unbekanntes Zielformat");
  });

  it("macht ein hochwertiges JPG mit niedriger Qualität kleiner", async () => {
    const jpeg = await encodeAs("jpeg", makePixels(160, 120), 98);
    const r = await compressImage(codecs, jpeg, { target: "same", quality: 40 });
    expect(r.format).toBe("jpeg");
    expect(r.bytes.length).toBeLessThan(jpeg.length);
    expect((await decodeAs("jpeg", r.bytes)).width).toBe(160);
  });

  it("wandelt PNG mit Transparenz in AVIF und WebP, Alpha bleibt", async () => {
    const png = await encodeAs("png", makePixels(64, 32, "half"));
    for (const target of ["webp", "avif"]) {
      const r = await compressImage(codecs, png, { target, quality: 70 });
      expect(detectFormat(r.bytes)).toBe(target);
      const back = await decodeAs(target, r.bytes);
      expect([back.width, back.height]).toEqual([64, 32]);
      expect(back.data[3]).toBeLessThan(10); // links oben durchsichtig
      expect(back.data[(64 - 1) * 4 + 3]).toBeGreaterThan(245); // rechts oben deckend
    }
  });

  it("optimiert PNG verlustfrei", async () => {
    const png = await encodeAs("png", makePixels(100, 60));
    const r = await compressImage(codecs, png, { target: "png", quality: 10 });
    expect(r.lossless).toBe(true);
    expect([r.width, r.height]).toEqual([100, 60]);
    const a = await decodeAs("png", png);
    const b = await decodeAs("png", r.bytes);
    expect(Buffer.from(b.data).equals(Buffer.from(a.data))).toBe(true);
  });

  it("lehnt Unbekanntes verständlich ab", async () => {
    await expect(compressImage(codecs, new TextEncoder().encode("kein bild, nur ein text"), { target: "same", quality: 75 })).rejects.toThrow(
      "Kein unterstütztes Bild",
    );
  });
});
