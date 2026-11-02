import { describe, expect, it } from "vitest";
import { buildCompressArgs, crfFor, QUALITY_MAX, QUALITY_MIN } from "../../../tools/video-komprimieren/args.js";
import { parseDurationLine, parseProgressLine, progressRatio, scaleFilter } from "../../../tools/_ffmpeg/logic.js";

describe("video-komprimieren: CRF", () => {
  it("höhere Qualität heißt kleinere CRF, Grenzen je Codec", () => {
    expect(crfFor("mp4", QUALITY_MIN)).toBe(35);
    expect(crfFor("mp4", QUALITY_MAX)).toBe(18);
    expect(crfFor("webm", QUALITY_MIN)).toBe(48);
    expect(crfFor("webm", QUALITY_MAX)).toBe(10);
    for (let q = QUALITY_MIN; q < QUALITY_MAX; q++) expect(crfFor("mp4", q)).toBeGreaterThanOrEqual(crfFor("mp4", q + 1));
  });

  it("lehnt Werte außerhalb des Reglers ab", () => {
    expect(() => crfFor("mp4", 0)).toThrow();
    expect(() => crfFor("mp4", 11)).toThrow();
    expect(() => crfFor("mp4", 2.5)).toThrow();
  });
});

describe("video-komprimieren: Argumente", () => {
  it("MP4 mit Ton, 720p", () => {
    const { args, output, mime } = buildCompressArgs({ inputName: "input.mov", container: "mp4", quality: 5, maxHeight: 720, audio: true });
    expect(args.slice(0, 6)).toEqual(["-i", "/in/input.mov", "-map", "0:v:0", "-map", "0:a:0?"]);
    expect(args).toEqual(expect.arrayContaining(["libx264", "aac", "+faststart"]));
    expect(args[args.indexOf("-crf") + 1]).toBe(String(crfFor("mp4", 5)));
    expect(args[args.indexOf("-vf") + 1]).toBe(scaleFilter(720));
    expect([output, mime]).toEqual(["output.mp4", "video/mp4"]);
  });

  it("WebM ohne Ton nutzt VP8 (VP9 stürzt im Core ab) und -an", () => {
    const { args, output } = buildCompressArgs({ inputName: "input", container: "webm", quality: 3, maxHeight: 0, audio: false });
    expect(args).toContain("libvpx");
    expect(args).not.toContain("libvpx-vp9");
    expect(args).toContain("-an");
    expect(args).not.toContain("libopus");
    expect(args).not.toContain("0:a:0?");
    expect(output).toBe("output.webm");
  });

  it("lehnt unbekannte Werte ab", () => {
    expect(() => buildCompressArgs({ inputName: "i", container: "avi" })).toThrow("Unbekanntes Format");
    expect(() => buildCompressArgs({ inputName: "i", maxHeight: 999 })).toThrow("Ungültige Auflösung");
  });
});

describe("_ffmpeg: Skalierung und Fortschritt", () => {
  it("begrenzt die kürzere Seite und erzwingt gerade Kanten", () => {
    expect(scaleFilter(0)).toBe("scale=trunc(iw/2)*2:trunc(ih/2)*2");
    expect(scaleFilter(720)).toBe("scale='if(gt(iw,ih),-2,trunc(min(720,iw)/2)*2)':'if(gt(iw,ih),trunc(min(720,ih)/2)*2,-2)'");
  });

  it("liest Dauer und Fortschritt aus dem Log", () => {
    expect(parseDurationLine("  Duration: 00:01:23.45, start: 0.000000, bitrate: 1200 kb/s")).toBeCloseTo(83.45);
    expect(parseDurationLine("  Duration: N/A, bitrate: N/A")).toBeNull();
    expect(parseProgressLine("frame=  42 fps= 12 q=28.0 size=  256kB time=00:00:02.50 bitrate= 838.9kbits/s")).toBeCloseTo(2.5);
    expect(parseProgressLine("size=N/A time=-00:00:00.04 bitrate=N/A")).toBeNull();
    expect(parseProgressLine("Stream mapping:")).toBeNull();
  });

  it("berechnet den Anteil nur mit bekannter Dauer", () => {
    expect(progressRatio(2.5, 10)).toBe(0.25);
    expect(progressRatio(12, 10)).toBe(1);
    expect(progressRatio(1, null)).toBeNull();
    expect(progressRatio(1, 0)).toBeNull();
  });
});
