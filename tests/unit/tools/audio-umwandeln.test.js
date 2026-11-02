import { describe, expect, it } from "vitest";
import { buildAudioArgs, FORMATS } from "../../../tools/audio-umwandeln/args.js";
import { explainFailure, extensionOf, inputNameFor, isLargeFile, LARGE_FILE_BYTES } from "../../../tools/_ffmpeg/logic.js";
import { makeWav, wavDuration } from "../../fixtures/media.js";

describe("audio-umwandeln: Argumente", () => {
  it("MP3 mit Bitrate, nur erste Tonspur, ID3v2.3", () => {
    const { args, output, mime } = buildAudioArgs({ inputName: "input.mp4", format: "mp3", bitrate: 128 });
    expect(args).toEqual([
      "-i", "/in/input.mp4", "-map", "0:a:0", "-vn", "-sn", "-dn", "-c:a", "libmp3lame",
      "-b:a", "128k", "-af", "aformat=sample_rates=48000|44100|32000", "-id3v2_version", "3",
      "-map_metadata", "0", "output.mp3",
    ]);
    expect([output, mime]).toEqual(["output.mp3", "audio/mpeg"]);
  });

  it("verlustfreie Formate ignorieren die Bitrate", () => {
    for (const format of ["wav", "flac"]) {
      const { args } = buildAudioArgs({ inputName: "input.wav", format, bitrate: 320 });
      expect(args).not.toContain("-b:a");
    }
  });

  it("jedes Format hat Encoder, Endung und MIME-Typ", () => {
    for (const format of Object.keys(FORMATS)) {
      const { args, output, mime } = buildAudioArgs({ inputName: "input", format });
      expect(args).toContain("-c:a");
      expect(output).toBe(`output.${FORMATS[format].ext}`);
      expect(mime).toMatch(/^audio\//);
    }
  });

  it("Vorbis nutzt Qualitätsstufen statt fester Bitrate", () => {
    const { args } = buildAudioArgs({ inputName: "input.wav", format: "ogg", bitrate: 192 });
    expect(args).not.toContain("-b:a");
    expect(args[args.indexOf("-q:a") + 1]).toBe("6");
  });

  it("lehnt unbekannte Formate und Bitraten ab", () => {
    expect(() => buildAudioArgs({ inputName: "input", format: "wma" })).toThrow("Unbekanntes Format");
    expect(() => buildAudioArgs({ inputName: "input", format: "mp3", bitrate: 1000 })).toThrow("Ungültige Bitrate");
  });
});

describe("_ffmpeg: Fehlertexte", () => {
  it("erkennt fehlende Tonspur", () => {
    const r = explainFailure(["Input #0, avi, from '/in/input.avi':", "Stream map '0:a:0' matches no streams.", "To ignore this, add a trailing '?' to the map."]);
    expect(r.message).toBe("Keine Tonspur gefunden.");
    expect(r.detail).toContain("matches no streams");
  });

  it("erkennt fehlenden Videostream, kaputte Dateien, Speicher und unbekannte Encoder", () => {
    expect(explainFailure(["Stream map '0:v:0' matches no streams."]).message).toBe("Kein Videostream gefunden.");
    expect(explainFailure(["/in/input.mp4: Invalid data found when processing input"]).message).toMatch("kein lesbares");
    expect(explainFailure(["[mov,mp4] moov atom not found"]).message).toMatch("moov atom fehlt");
    expect(explainFailure(["RuntimeError: memory access out of bounds"]).message).toMatch("Speicher");
    expect(explainFailure(["Unknown encoder 'libfdk_aac'"]).message).toMatch("nicht schreiben");
    expect(explainFailure(["Output file is empty, nothing was encoded (check -ss / -t / -frames parameters if used)"]).message).toMatch("nichts gefunden");
  });

  it("fällt auf eine allgemeine Meldung zurück und filtert Fortschrittsrauschen", () => {
    const r = explainFailure(["frame=   10 fps=0.0 q=0.0 size=0kB time=00:00:01.00", "Conversion failed!", "Aborted()"]);
    expect(r.message).toBe("ffmpeg ist mit einem Fehler abgebrochen.");
    expect(r.detail).toBe("ffmpeg: Conversion failed!");
    expect(explainFailure([]).detail).toBe("");
  });
});

describe("_ffmpeg: Dateinamen und Größe", () => {
  it("Eingabename behält nur die Endung", () => {
    expect(inputNameFor("Mein Urlaub (2).MOV")).toBe("input.mov");
    expect(inputNameFor("ohne-endung")).toBe("input");
    expect(extensionOf("a.tar.webm")).toBe("webm");
  });

  it("Hinweis ab 500 MB", () => {
    expect(isLargeFile(LARGE_FILE_BYTES - 1)).toBe(false);
    expect(isLargeFile(LARGE_FILE_BYTES)).toBe(true);
  });

  it("Test-WAV hat die erwartete Dauer", () => {
    expect(wavDuration(makeWav({ seconds: 1.5 }))).toBeCloseTo(1.5, 3);
  });
});
