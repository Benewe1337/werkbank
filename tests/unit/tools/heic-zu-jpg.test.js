import { beforeAll, describe, expect, it } from "vitest";
import * as codecs from "../../../tools/_bild/codecs.js";
import { detectFormat } from "../../../tools/_bild/format.js";
import { convertHeic, imageNames } from "../../../tools/heic-zu-jpg/convert.js";
import { decodeAs, encodeAs, initNodeCodecs, makeHeic, makePixels } from "../../fixtures/bild.js";

beforeAll(initNodeCodecs);

describe("heic-zu-jpg", () => {
  it("benennt Serien durchnummeriert", () => {
    expect(imageNames("IMG_1", 1, "jpg")).toEqual(["IMG_1.jpg"]);
    expect(imageNames("IMG_1", 2, "png")).toEqual(["IMG_1-1.png", "IMG_1-2.png"]);
  });

  it("wandelt ein HEIC in JPG mit richtigen Abmessungen und Farben", async () => {
    const { images } = await convertHeic(codecs, makeHeic(1), { format: "jpeg", quality: 90 });
    expect(images).toHaveLength(1);
    expect(detectFormat(images[0].bytes)).toBe("jpeg");
    const img = await decodeAs("jpeg", images[0].bytes);
    expect([img.width, img.height]).toEqual([64, 48]);
    // oben links orange
    expect(img.data[0]).toBeGreaterThan(220);
    expect(img.data[2]).toBeLessThan(40);
  });

  it("gibt alle Bilder einer HEIC-Datei aus", async () => {
    const { images } = await convertHeic(codecs, makeHeic(2), { format: "png", quality: 90 });
    expect(images).toHaveLength(2);
    const second = await decodeAs("png", images[1].bytes);
    expect(second.data[2]).toBeGreaterThan(220); // zweites Bild ist blau
  });

  it("lehnt Nicht-HEIC verständlich ab", async () => {
    const jpeg = await encodeAs("jpeg", makePixels(8, 8));
    await expect(convertHeic(codecs, jpeg, { format: "jpeg", quality: 90 })).rejects.toThrow("schon ein JPG");
    await expect(convertHeic(codecs, new Uint8Array(40), { format: "jpeg", quality: 90 })).rejects.toThrow("Keine HEIC-Datei");
  });

  it("meldet kaputte HEIC-Dateien", async () => {
    const broken = makeHeic(1).slice(0, 300);
    await expect(convertHeic(codecs, broken, { format: "jpeg", quality: 90 })).rejects.toThrow();
  });
});
