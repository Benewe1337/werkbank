import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_RATE,
  dropHallucinations,
  formatDuration,
  formatTimestamp,
  mixToMono,
  shiftChunks,
  splitWindows,
  toSrt,
  toText,
  toVtt,
} from "../../../tools/transkribieren/subtitles.js";

const chunks = [
  { text: "Hallo Welt.", start: 0, end: 1.5 },
  { text: "Zweiter Satz.", start: 1.5, end: 3.25 },
  { text: "Nach der Pause.", start: 6, end: 3725.5 },
];

describe("transkribieren: Zeitstempel und Untertitel", () => {
  it("formatiert Zeitstempel für SRT und VTT", () => {
    expect(formatTimestamp(0)).toBe("00:00:00,000");
    expect(formatTimestamp(3725.5)).toBe("01:02:05,500");
    expect(formatTimestamp(61.0004, ".")).toBe("00:01:01.000");
    expect(formatTimestamp(-1)).toBe("00:00:00,000");
  });

  it("schreibt SRT", () => {
    expect(toSrt(chunks.slice(0, 2))).toBe(
      "1\n00:00:00,000 --> 00:00:01,500\nHallo Welt.\n\n2\n00:00:01,500 --> 00:00:03,250\nZweiter Satz.\n",
    );
  });

  it("schreibt VTT", () => {
    expect(toVtt(chunks.slice(0, 1))).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nHallo Welt.\n");
  });

  it("macht nach langen Pausen einen neuen Absatz", () => {
    expect(toText(chunks)).toBe("Hallo Welt. Zweiter Satz.\n\nNach der Pause.\n");
    expect(toText([])).toBe("");
  });

  it("verschiebt Chunks und füllt fehlende Endzeiten", () => {
    const shifted = shiftChunks(
      [
        { text: " Eins ", timestamp: [0, 2] },
        { text: "  ", timestamp: [2, 2.4] },
        { text: "Zwei", timestamp: [2.5, null] },
        { text: "Drei", timestamp: [3, null] },
      ],
      30,
      45,
    );
    // Ohne Endzeit: bis zum nächsten Chunk, beim letzten bis zum Fensterende; Leere fallen weg.
    expect(shifted).toEqual([
      { text: "Eins", start: 30, end: 32 },
      { text: "Zwei", start: 32.5, end: 33 },
      { text: "Drei", start: 33, end: 45 },
    ]);
  });

  it("entfernt typische Whisper-Halluzinationen", () => {
    const out = dropHallucinations([
      { text: "Untertitel im Auftrag des ZDF, 2021" },
      { text: "[Musik]" },
      { text: "Echter Satz." },
    ]);
    expect(out.map((c) => c.text)).toEqual(["Echter Satz."]);
  });

  it("formatiert Dauern", () => {
    expect([formatDuration(5), formatDuration(65), formatDuration(120), formatDuration(3720)]).toEqual([
      "5 s", "1 Min. 5 s", "2 Min.", "1 Std. 2 Min.",
    ]);
  });
});

describe("transkribieren: Audio", () => {
  it("mischt Kanäle zu Mono", () => {
    expect([...mixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])])]).toEqual([0.5, 0.5]);
    expect(() => mixToMono([])).toThrow(/Tonspur/);
  });

  it("teilt lange Aufnahmen an leisen Stellen in Fenster bis 30 s", () => {
    const seconds = 70;
    const samples = new Float32Array(seconds * SAMPLE_RATE).fill(0.5);
    // Stille bei 27 s und 55 s: dort soll geschnitten werden.
    for (const at of [27, 55]) samples.fill(0, at * SAMPLE_RATE, (at + 0.2) * SAMPLE_RATE);
    const windows = splitWindows(samples);
    expect(windows).toHaveLength(3);
    expect(windows[0].start).toBe(0);
    expect(windows.at(-1).end).toBe(samples.length);
    for (const w of windows) expect(w.end - w.start).toBeLessThanOrEqual(30 * SAMPLE_RATE);
    expect(Math.abs(windows[0].end / SAMPLE_RATE - 27.1)).toBeLessThan(0.15);
    expect(Math.abs(windows[1].end / SAMPLE_RATE - 55.1)).toBeLessThan(0.15);
    for (let i = 1; i < windows.length; i++) expect(windows[i].start).toBe(windows[i - 1].end);
  });

  it("lässt kurze Aufnahmen am Stück", () => {
    expect(splitWindows(new Float32Array(5 * SAMPLE_RATE))).toEqual([{ start: 0, end: 5 * SAMPLE_RATE }]);
  });
});

describe("transkribieren: ausgelieferte Dateien", () => {
  it("findet die onnxruntime-Dateien in der Version von transformers.js", () => {
    const worker = fs.readFileSync("tools/transkribieren/worker.js", "utf8");
    const paths = [...worker.matchAll(/from "\.\.\/\.\.\/(node_modules\/[^"?]+)\?url"/g)].map((m) => m[1]);
    expect(paths).toHaveLength(2);
    for (const p of paths) expect(fs.existsSync(p), p).toBe(true);
    const ort = JSON.parse(fs.readFileSync("node_modules/@huggingface/transformers/node_modules/onnxruntime-web/package.json", "utf8"));
    const wanted = JSON.parse(fs.readFileSync("node_modules/@huggingface/transformers/package.json", "utf8")).dependencies["onnxruntime-web"];
    expect(ort.version).toBe(wanted);
  });

  it("pinnt das Modell auf eine feste Revision", () => {
    const assets = JSON.parse(fs.readFileSync("tools/transkribieren/assets.json", "utf8"));
    for (const a of assets) {
      expect(a.url).toMatch(/\/resolve\/[0-9a-f]{40}\//);
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.path).toMatch(/^models\/whisper-base\//);
    }
  });
});
