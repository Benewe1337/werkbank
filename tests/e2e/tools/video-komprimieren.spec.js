import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeAvi, makeGarbage, mp4Codecs, mp4Duration, startsWith } from "../../fixtures/media.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test.describe.configure({ timeout: 180_000 });

const drop = (page, f) => page.locator("#drop input").setInputFiles(f);
const newest = (page) => page.locator(".job").first();

test("Video verkleinern: AVI wird MP4 (H.264 + AAC) mit gleicher Dauer", async ({ page }) => {
  const errors = await openTool(page, "video-komprimieren");
  const input = makeAvi({ width: 320, height: 240, seconds: 3 });
  await drop(page, file("clip.avi", "video/x-msvideo", input));
  const job = newest(page);
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("→");
  await expect(job.locator(".job-status")).toContainText("−");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("clip-klein.mp4");
  expect(startsWith(bytes, "ftyp", 4)).toBe(true);
  expect(mp4Codecs(bytes).sort()).toEqual(["avc1", "mp4a"]);
  expect(mp4Duration(bytes)).toBeGreaterThan(2.9);
  expect(mp4Duration(bytes)).toBeLessThan(3.2);
  expect(bytes.length).toBeLessThan(input.length / 10);
  expect(errors).toEqual([]);
});

test("Video verkleinern: WebM ohne Ton", async ({ page }) => {
  await openTool(page, "video-komprimieren");
  await page.getByLabel("Format").selectOption("webm");
  await page.getByLabel("Ton behalten").uncheck();
  await drop(page, file("clip.avi", "video/x-msvideo", makeAvi({ seconds: 2 })));
  await expect(newest(page)).toHaveAttribute("data-state", "done");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("clip-klein.webm");
  expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  expect(bytes.includes(Buffer.from("V_VP8"))).toBe(true);
  expect(bytes.includes(Buffer.from("A_OPUS"))).toBe(false);
});

test("Video verkleinern: Abbrechen, danach läuft die nächste Datei", async ({ page }) => {
  await openTool(page, "video-komprimieren");
  await page.getByLabel("Format").selectOption("webm");
  await page.getByLabel("Höchstens").selectOption("0");
  // Über 50 MB: Playwright nimmt so große Puffer nur als Datei an.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "werkbank-"));
  const big = path.join(dir, "lang.avi");
  fs.writeFileSync(big, makeAvi({ width: 320, height: 240, fps: 25, seconds: 20 }));
  await drop(page, big);
  const job = newest(page);
  await expect(job.locator(".job-status")).toContainText("%");
  await job.getByRole("button", { name: "Abbrechen" }).click();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job.locator(".job-status")).toHaveText("Abgebrochen.");
  await expect(page.locator("#engine")).toHaveAttribute("data-state", "ready");

  await page.getByLabel("Format").selectOption("mp4");
  await drop(page, file("kurz.avi", "video/x-msvideo", makeAvi({ seconds: 1 })));
  await expect(newest(page)).toHaveAttribute("data-state", "done");
  const { bytes } = await downloadFirst(page);
  expect(startsWith(bytes, "ftyp", 4)).toBe(true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Video verkleinern: kaputte Datei gibt einen verständlichen Fehler", async ({ page }) => {
  await openTool(page, "video-komprimieren");
  await drop(page, file("kaputt.mp4", "video/mp4", makeGarbage()));
  await expect(newest(page)).toHaveAttribute("data-state", "error");
  await expect(newest(page).locator(".job-status")).toHaveText(/kein lesbares|unvollständig oder beschädigt/);
});
