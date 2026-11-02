import { expect, test } from "@playwright/test";
import { aviTotalFrames, makeAvi, mp4Codecs, mp4Duration, startsWith } from "../../fixtures/media.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test.describe.configure({ timeout: 180_000 });

const drop = (page, f) => page.locator("#drop input").setInputFiles(f);
const newest = (page) => page.locator(".job").first();

test("Video schneiden: schnell ohne Neukodieren, exakte Bildanzahl", async ({ page }) => {
  const errors = await openTool(page, "video-schneiden");
  await drop(page, file("clip.avi", "video/x-msvideo", makeAvi({ seconds: 3, fps: 10 })));
  // rawvideo-AVI kann der Browser nicht abspielen: Hinweis statt Vorschau.
  await expect(page.locator("#preview")).toContainText("nicht abspielen");
  await page.getByLabel("Start", { exact: true }).fill("1");
  await page.getByLabel("Ende", { exact: true }).fill("0:02");
  await page.getByRole("button", { name: "Schneiden" }).click();
  await expect(newest(page)).toHaveAttribute("data-state", "done");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("clip-schnitt-0-01.avi");
  expect(startsWith(bytes, "RIFF")).toBe(true);
  expect(aviTotalFrames(bytes)).toBe(10);
  expect(errors).toEqual([]);
});

test("Video schneiden: genau, neu kodiert als MP4", async ({ page }) => {
  await openTool(page, "video-schneiden");
  await drop(page, file("clip.avi", "video/x-msvideo", makeAvi({ seconds: 3 })));
  await page.getByLabel("Start", { exact: true }).fill("0:00,5");
  await page.getByLabel("Ende", { exact: true }).fill("2");
  await page.getByLabel("Genau, neu kodiert").check();
  await page.getByRole("button", { name: "Schneiden" }).click();
  await expect(newest(page)).toHaveAttribute("data-state", "done");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toMatch(/\.mp4$/);
  expect(mp4Codecs(bytes).sort()).toEqual(["avc1", "mp4a"]);
  expect(mp4Duration(bytes)).toBeGreaterThan(1.4);
  expect(mp4Duration(bytes)).toBeLessThan(1.65);
});

test("Video schneiden: aktuelle Position aus der Vorschau übernehmen", async ({ page }) => {
  // Abspielbares WebM mit dem Werkzeug „Video verkleinern“ erzeugen.
  await openTool(page, "video-komprimieren");
  await page.getByLabel("Format").selectOption("webm");
  await page.locator("#drop input").setInputFiles(file("clip.avi", "video/x-msvideo", makeAvi({ seconds: 4 })));
  await expect(newest(page)).toHaveAttribute("data-state", "done");
  const webm = (await downloadFirst(page)).bytes;

  await openTool(page, "video-schneiden");
  await drop(page, file("clip.webm", "video/webm", webm));
  const video = page.locator("#preview video");
  await expect(video).toBeVisible();
  await expect(page.locator("#preview")).toContainText("0:04");
  await video.evaluate((v) => new Promise((resolve) => {
    v.addEventListener("seeked", resolve, { once: true });
    v.currentTime = 1.5;
  }));
  await page.getByRole("button", { name: "Aktuelle Position als Start" }).click();
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue("0:01.5");
  await page.getByLabel("Ende", { exact: true }).fill("9");
  await page.getByLabel("Genau, neu kodiert").check();
  await page.getByRole("button", { name: "Schneiden" }).click();
  await expect(newest(page)).toHaveAttribute("data-state", "done");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("clip-schnitt-0-02.webm");
  expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
});

test("Video schneiden: Ende vor Start wird abgefangen", async ({ page }) => {
  await openTool(page, "video-schneiden");
  await drop(page, file("clip.avi", "video/x-msvideo", makeAvi({ seconds: 2 })));
  await page.getByLabel("Start", { exact: true }).fill("1,5");
  await page.getByLabel("Ende", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Schneiden" }).click();
  await expect(page.locator("#form-error")).toHaveText("Das Ende muss nach dem Start liegen.");
  await page.getByLabel("Start", { exact: true }).fill("1:75");
  await page.getByRole("button", { name: "Schneiden" }).click();
  await expect(page.locator("#form-error")).toContainText("Ungültige Zeitangabe");
  await expect(page.locator(".job")).toHaveCount(0);
});
