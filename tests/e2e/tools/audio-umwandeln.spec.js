import { expect, test } from "@playwright/test";
import { makeAvi, makeGarbage, makeWav, mp4Codecs, startsWith, wavDuration } from "../../fixtures/media.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test.describe.configure({ timeout: 180_000 });

const drop = (page, f) => page.locator("#drop input").setInputFiles(f);
const newest = (page) => page.locator(".job").first();

test("Audio umwandeln: WAV wird MP3 mit ID3-Kopf", async ({ page }) => {
  const errors = await openTool(page, "audio-umwandeln");
  await page.getByLabel("Format").selectOption("mp3");
  await page.getByLabel("Bitrate").selectOption("128");
  await drop(page, file("ton.wav", "audio/wav", makeWav({ seconds: 2 })));
  await expect(newest(page)).toHaveAttribute("data-state", "done");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("ton.mp3");
  expect(startsWith(bytes, "ID3")).toBe(true);
  // Nach dem ID3-Block beginnt ein MPEG-Audio-Frame (Frame-Sync 0xFFE).
  const id3Size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  const frame = 10 + id3Size;
  expect(bytes[frame]).toBe(0xff);
  expect(bytes[frame + 1] & 0xe0).toBe(0xe0);
  expect(errors).toEqual([]);
});

test("Audio umwandeln: Ton aus Video ziehen und alle Formate", async ({ page }) => {
  const errors = await openTool(page, "audio-umwandeln");
  const video = makeAvi({ seconds: 3 });
  const cases = [
    ["wav", "clip.wav", (b) => startsWith(b, "RIFF") && startsWith(b, "WAVE", 8) && Math.abs(wavDuration(b) - 3) < 0.05],
    ["flac", "clip.flac", (b) => startsWith(b, "fLaC")],
    ["ogg", "clip.ogg", (b) => startsWith(b, "OggS") && b.includes(Buffer.from("vorbis"))],
    ["opus", "clip.opus", (b) => startsWith(b, "OggS") && b.includes(Buffer.from("OpusHead"))],
    ["m4a", "clip.m4a", (b) => startsWith(b, "ftyp", 4) && mp4Codecs(b).join() === "mp4a"],
  ];
  for (const [format, expectedName, check] of cases) {
    await page.getByLabel("Format").selectOption(format);
    await drop(page, file("clip.avi", "video/x-msvideo", video));
    await expect(newest(page)).toHaveAttribute("data-state", "done");
    const { name, bytes } = await downloadFirst(page);
    expect(name).toBe(expectedName);
    expect(check(bytes), format).toBe(true);
  }
  // Verlustfreie Formate haben keine Bitrate.
  await page.getByLabel("Format").selectOption("flac");
  await expect(page.getByLabel("Bitrate")).toBeHidden();
  expect(errors).toEqual([]);
});

test("Audio umwandeln: Video ohne Ton und kaputte Datei geben verständliche Fehler", async ({ page }) => {
  await openTool(page, "audio-umwandeln");
  await drop(page, file("stumm.avi", "video/x-msvideo", makeAvi({ audio: false })));
  await expect(newest(page)).toHaveAttribute("data-state", "error");
  await expect(newest(page).locator(".job-status")).toHaveText("Keine Tonspur gefunden.");
  await expect(newest(page).locator(".job-notes")).toContainText("ffmpeg:");

  await drop(page, file("kaputt.mp3", "audio/mpeg", makeGarbage()));
  await expect(newest(page)).toHaveAttribute("data-state", "error");
  await expect(newest(page).locator(".job-status")).toHaveText("Die Datei ist kein lesbares Video- oder Audioformat.");

  // Danach läuft die nächste Datei normal.
  await drop(page, file("ton.wav", "audio/wav", makeWav({ seconds: 1 })));
  await expect(newest(page)).toHaveAttribute("data-state", "done");
});
