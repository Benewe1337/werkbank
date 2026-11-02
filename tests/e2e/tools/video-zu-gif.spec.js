import { expect, test } from "@playwright/test";
import { gifInfo, makeAvi, startsWith } from "../../fixtures/media.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test.describe.configure({ timeout: 180_000 });

const drop = (page, f) => page.locator("#drop input").setInputFiles(f);
const newest = (page) => page.locator(".job").first();

test("Video in GIF: Ausschnitt mit eigener Palette und Vorschau", async ({ page }) => {
  const errors = await openTool(page, "video-zu-gif");
  await drop(page, file("clip.avi", "video/x-msvideo", makeAvi({ width: 320, height: 240, seconds: 3 })));
  await page.getByLabel("Start", { exact: true }).fill("0:00.5");
  await page.getByLabel("Dauer in Sekunden").fill("2");
  await page.getByLabel("Bilder pro Sekunde").selectOption("10");
  await page.getByLabel("Breite").selectOption("240");
  await page.getByRole("button", { name: "GIF erstellen" }).click();
  await expect(newest(page)).toHaveAttribute("data-state", "done");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("clip.gif");
  expect(startsWith(bytes, "GIF89a")).toBe(true);
  const info = gifInfo(bytes);
  expect(info.width).toBe(240);
  expect(info.height).toBe(180);
  expect(info.frames).toBeGreaterThanOrEqual(19);
  expect(info.frames).toBeLessThanOrEqual(21);
  const preview = page.locator("#result-image");
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((img) => img.naturalWidth)).toBe(240);
  expect(errors).toEqual([]);
});

test("Video in GIF: kleineres Video wird nicht vergrößert", async ({ page }) => {
  await openTool(page, "video-zu-gif");
  await drop(page, file("klein.avi", "video/x-msvideo", makeAvi({ width: 160, height: 120, seconds: 1 })));
  await page.getByLabel("Breite").selectOption("640");
  await page.getByRole("button", { name: "GIF erstellen" }).click();
  await expect(newest(page)).toHaveAttribute("data-state", "done");
  const { bytes } = await downloadFirst(page);
  expect(gifInfo(bytes).width).toBe(160);
});

test("Video in GIF: Start hinter dem Ende gibt einen verständlichen Fehler", async ({ page }) => {
  await openTool(page, "video-zu-gif");
  await drop(page, file("clip.avi", "video/x-msvideo", makeAvi({ seconds: 2 })));
  await page.getByLabel("Start", { exact: true }).fill("10");
  await page.getByRole("button", { name: "GIF erstellen" }).click();
  await expect(newest(page)).toHaveAttribute("data-state", "error");
  await expect(newest(page).locator(".job-status")).toHaveText(/nichts gefunden|kein lesbares/);
  await page.getByLabel("Dauer in Sekunden").fill("31");
  await page.getByRole("button", { name: "GIF erstellen" }).click();
  await expect(page.locator("#form-error")).toContainText("Höchstens 30 Sekunden");
});
