import { describe, expect, it } from "vitest";
import { buildTrimArgs, validateRange } from "../../../tools/video-schneiden/args.js";
import { formatTime, parseTime } from "../../../tools/_ffmpeg/logic.js";
import { aviTotalFrames, makeAvi } from "../../fixtures/media.js";

describe("_ffmpeg: Zeitangaben", () => {
  it.each([
    ["83.5", 83.5],
    ["1:23.5", 83.5],
    ["1:23,5", 83.5],
    ["0:05", 5],
    ["1:02:03", 3723],
    [".5", 0.5],
    ["  12 ", 12],
  ])("parseTime(%j) = %d", (input, expected) => expect(parseTime(input)).toBeCloseTo(expected));

  it("leer heißt null", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime(undefined)).toBeNull();
  });

  it.each(["abc", "1:75", "1::2", "-3", "1:2:3:4", "1.5:20", "1:2e3"])("lehnt %j ab", (input) => {
    expect(() => parseTime(input)).toThrow("Zeitangabe");
  });

  it("formatiert Sekunden zurück", () => {
    expect(formatTime(83.5)).toBe("1:23.5");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(3723)).toBe("1:02:03");
    expect(formatTime(1.25, { decimals: 2 })).toBe("0:01.25");
    expect(formatTime(59.96)).toBe("1:00");
    expect(formatTime(NaN)).toBe("");
    expect(parseTime(formatTime(754.3))).toBeCloseTo(754.3);
  });
});

describe("video-schneiden: Bereich prüfen", () => {
  it("rechnet Länge mit und ohne Ende", () => {
    expect(validateRange(1, 3, 10)).toEqual({ start: 1, end: 3, length: 2 });
    expect(validateRange(null, null, 10)).toEqual({ start: 0, end: null, length: 10 });
    expect(validateRange(2, null, null)).toEqual({ start: 2, end: null, length: null });
    expect(validateRange(8, 20, 10)).toEqual({ start: 8, end: 10, length: 2 });
  });

  it("lehnt unsinnige Bereiche ab", () => {
    expect(() => validateRange(3, 2)).toThrow("Ende muss nach dem Start");
    expect(() => validateRange(2, 2)).toThrow("Ende muss nach dem Start");
    expect(() => validateRange(12, null, 10)).toThrow("hinter dem Ende");
    expect(() => validateRange(1, 1.01)).toThrow("zu kurz");
  });
});

describe("video-schneiden: Argumente", () => {
  it("schnell: Stream-Copy im selben Container, Suche vor der Eingabe", () => {
    const { args, output, mime } = buildTrimArgs({ inputName: "input.mp4", fileName: "a.mp4", start: 1.5, end: 4, mode: "fast" });
    expect(args).toEqual([
      "-ss", "1.5", "-i", "/in/input.mp4", "-t", "2.5", "-map", "0:v?", "-map", "0:a?", "-c", "copy",
      "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", "-map_metadata", "0", "output.mp4",
    ]);
    expect(mime).toBe("video/mp4");
    expect(output).toBe("output.mp4");
  });

  it("schnell: unbekannter Container wird MKV, ohne Start kein -ss, ohne Ende kein -t", () => {
    const { args, output } = buildTrimArgs({ inputName: "input.wmv", fileName: "a.wmv", start: 0, end: null, mode: "fast" });
    expect(args).not.toContain("-ss");
    expect(args).not.toContain("-t");
    expect(output).toBe("output.mkv");
  });

  it("genau: neu kodiert, WebM bleibt WebM", () => {
    expect(buildTrimArgs({ inputName: "i.mov", fileName: "a.mov", start: 1, end: 2, mode: "exact" }).args).toContain("libx264");
    const webm = buildTrimArgs({ inputName: "i.webm", fileName: "a.webm", start: 1, end: 2, mode: "exact" });
    expect(webm.args).toContain("libvpx");
    expect(webm.output).toBe("output.webm");
    expect(() => buildTrimArgs({ inputName: "i", fileName: "a", start: 0, end: 1, mode: "egal" })).toThrow();
  });

  it("Test-AVI trägt die erwartete Bildanzahl im Kopf", () => {
    expect(aviTotalFrames(makeAvi({ fps: 10, seconds: 2, audio: false }))).toBe(20);
  });
});
