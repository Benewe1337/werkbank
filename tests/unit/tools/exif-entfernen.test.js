import exifr from "exifr";
import { beforeAll, describe, expect, it } from "vitest";
import { EXIFR_OPTIONS, formatCoordinate, readMetadata, strategy, stripLossless, summarize } from "../../../tools/exif-entfernen/meta.js";
import { stripJpeg, stripPng, stripWebp, tiffOrientation } from "../../../tools/exif-entfernen/strip.js";
import {
  decodeAs,
  initNodeCodecs,
  makeExifTiff,
  makeJpegWithMetadata,
  makePngWithMetadata,
  makeWebpWithMetadata,
} from "../../fixtures/bild.js";

beforeAll(initNodeCodecs);

const hasText = (bytes, text) => Buffer.from(bytes).includes(Buffer.from(text));

describe("exif-entfernen: JPEG", () => {
  it("findet GPS und Kamera vorher", async () => {
    const jpeg = await makeJpegWithMetadata({ orientation: 6 });
    const s = summarize(await readMetadata(exifr, jpeg));
    expect(s.gps).toEqual({ latitude: 52.5, longitude: 13.25 });
    expect(s.rows).toContainEqual(["Hersteller", "Testkamera"]);
    expect(s.rows).toContainEqual(["Urheber", "Erika M."]);
  });

  it("entfernt alles bis auf die Drehung, Bilddaten bleiben gleich", async () => {
    const jpeg = await makeJpegWithMetadata({ orientation: 6 });
    const r = stripJpeg(jpeg, { keepOrientation: true });
    expect(r.removed).toEqual(["EXIF", "XMP", "IPTC", "Kommentar"]);
    expect(r.orientation).toBe(6);
    const meta = await exifr.parse(r.bytes, EXIFR_OPTIONS);
    expect(Object.keys(meta)).toEqual(["Orientation"]);
    expect(await exifr.gps(r.bytes)).toBeUndefined();
    for (const t of ["Testkamera", "Erika", "geheimer Kommentar", "8BIM"]) expect(hasText(r.bytes, t)).toBe(false);
    // Pixel exakt wie vorher (gleiche komprimierte Daten)
    const a = await decodeAs("jpeg", jpeg);
    const b = await decodeAs("jpeg", r.bytes);
    expect(Buffer.from(b.data).equals(Buffer.from(a.data))).toBe(true);
  });

  it("entfernt auf Wunsch auch die Drehung", async () => {
    const jpeg = await makeJpegWithMetadata({ orientation: 6 });
    const r = stripJpeg(jpeg, { keepOrientation: false });
    expect(await exifr.parse(r.bytes, EXIFR_OPTIONS)).toBeUndefined();
    expect(hasText(r.bytes, "Exif")).toBe(false);
  });

  it("schneidet angehängte Daten hinter dem Bildende ab", async () => {
    const jpeg = await makeJpegWithMetadata();
    const withTrailer = Buffer.concat([jpeg, Buffer.from("ANHANG mit GPS")]);
    const r = stripJpeg(new Uint8Array(withTrailer));
    expect(r.removed).toContain("angehängte Daten");
    expect(hasText(r.bytes, "ANHANG")).toBe(false);
    expect([...r.bytes.subarray(-2)]).toEqual([0xff, 0xd9]);
  });

  it("meldet kaputte Dateien", () => {
    expect(() => stripJpeg(new Uint8Array([1, 2, 3]))).toThrow("Kein gültiges JPEG");
    expect(() => stripJpeg(Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0x40, 0))).toThrow("abgeschnitten");
  });
});

describe("exif-entfernen: PNG und WebP", () => {
  it("entfernt Text-, EXIF- und Zeit-Chunks aus PNG, Pixel bleiben", async () => {
    const png = await makePngWithMetadata();
    expect((await readMetadata(exifr, png)).latitude).toBe(52.5);
    const r = stripPng(png);
    expect(r.removed).toEqual(["Text", "EXIF", "Zeitstempel"]);
    expect(await exifr.parse(r.bytes, EXIFR_OPTIONS)).toBeUndefined();
    expect(hasText(r.bytes, "Erika")).toBe(false);
    const a = await decodeAs("png", png);
    const b = await decodeAs("png", r.bytes);
    expect(Buffer.from(b.data).equals(Buffer.from(a.data))).toBe(true);
  });

  it("entfernt EXIF und XMP aus WebP und löscht die Flags", async () => {
    const webp = await makeWebpWithMetadata();
    expect(summarize(await readMetadata(exifr, webp)).gps).not.toBeNull();
    const r = stripWebp(webp);
    expect(r.removed).toEqual(["EXIF", "XMP"]);
    expect(hasText(r.bytes, "Testkamera")).toBe(false);
    expect(hasText(r.bytes, "Erika")).toBe(false);
    expect(r.bytes[20] & 0x0c).toBe(0); // VP8X-Flags
    expect(new DataView(r.bytes.buffer).getUint32(4, true)).toBe(r.bytes.length - 8);
    expect(await readMetadata(exifr, r.bytes)).toBeUndefined();
    expect((await decodeAs("webp", r.bytes)).width).toBe(30);
  });

  it("wählt den Weg nach Format", async () => {
    expect(strategy("jpeg")).toBe("lossless");
    expect(strategy("heic")).toBe("reencode");
    expect(strategy("gif")).toBe(null);
    expect(stripLossless(await makePngWithMetadata()).format).toBe("png");
  });
});

describe("exif-entfernen: Hilfen", () => {
  it("liest die Ausrichtung aus TIFF", () => {
    expect(tiffOrientation(makeExifTiff({ orientation: 8 }))).toBe(8);
    expect(tiffOrientation(new Uint8Array(4))).toBe(1);
  });

  it("formatiert Koordinaten", () => {
    expect(formatCoordinate(52.5, ["N", "S"])).toBe("52,50000° N");
    expect(formatCoordinate(-13.25, ["O", "W"])).toBe("13,25000° W");
  });

  it("fasst leere Metadaten zusammen", () => {
    expect(summarize(undefined)).toEqual({ gps: null, rows: [], all: [] });
  });
});
