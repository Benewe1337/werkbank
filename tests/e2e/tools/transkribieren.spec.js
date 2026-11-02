import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SPEECH_TEXT } from "../../fixtures/text.js";
import { file, openTool } from "../helpers.js";

// Sprachaudio wird zur Laufzeit mit macOS `say` erzeugt; ohne `say` (z. B. Linux-CI) wird übersprungen.
function speechWav() {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "werkbank-say-"));
    const out = path.join(dir, "ansage.wav");
    execFileSync("say", ["-v", "Anna", "-o", out, "--data-format=LEI16@22050", SPEECH_TEXT]);
    const bytes = fs.readFileSync(out);
    fs.rmSync(dir, { recursive: true, force: true });
    return bytes;
  } catch {
    return null;
  }
}

test("Transkribieren: deutsche Ansage wird zu Text und Untertiteln", async ({ page }) => {
  test.setTimeout(300_000);
  const wav = speechWav();
  test.skip(!wav, "macOS `say` nicht verfügbar");
  const errors = await openTool(page, "transkribieren");
  await expect(page.locator("#engine")).toHaveCount(0); // Modell erst bei Bedarf
  await page.locator("#drop input").setInputFiles(file("ansage.wav", "audio/wav", wav));
  await expect(page.locator("#engine")).toHaveAttribute("data-state", "ready", { timeout: 180_000 });
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done", { timeout: 180_000 });
  const text = (await job.locator("textarea").inputValue()).toLowerCase();
  for (const word of ["test", "sonne", "berlin"]) expect(text).toContain(word);

  const [srt] = await Promise.all([page.waitForEvent("download"), job.getByRole("link", { name: ".srt" }).click()]);
  expect(srt.suggestedFilename()).toBe("ansage.srt");
  const srtText = fs.readFileSync(await srt.path(), "utf8");
  expect(srtText).toMatch(/^1\n00:00:0\d,\d{3} --> 00:00:\d\d,\d{3}\n/);
  const [vtt] = await Promise.all([page.waitForEvent("download"), job.getByRole("link", { name: ".vtt" }).click()]);
  expect(fs.readFileSync(await vtt.path(), "utf8")).toMatch(/^WEBVTT\n\n00:00:0\d\.\d{3} --> /);
  expect(errors).toEqual([]);
});

test("Transkribieren: unlesbare Datei und falscher Typ", async ({ page }) => {
  await openTool(page, "transkribieren");
  await page.locator("#drop input").setInputFiles(file("notiz.txt", "text/plain", "hallo"));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "error");
  await page.locator("#drop input").setInputFiles(file("kaputt.mp3", "audio/mpeg", "kein audio"));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job.locator(".job-status")).toContainText("Tonspur lässt sich nicht lesen");
});
