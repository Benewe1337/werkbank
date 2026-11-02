import { expect, test } from "@playwright/test";
import { decodeAs, makeHeic } from "../../fixtures/bild.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("HEIC in JPG: Foto umwandeln und als echtes JPG herunterladen", async ({ page }) => {
  const errors = await openTool(page, "heic-zu-jpg");
  await page.locator("#drop input").setInputFiles(file("IMG_0001.HEIC", "image/heic", makeHeic(1)));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("JPG, 64 × 48");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("IMG_0001.jpg");
  const img = await decodeAs("jpeg", bytes);
  expect([img.width, img.height]).toEqual([64, 48]);
  expect(img.data[0]).toBeGreaterThan(220);
  expect(errors).toEqual([]);
});

test("HEIC in JPG: Datei mit zwei Bildern ergibt zwei PNGs", async ({ page }) => {
  await openTool(page, "heic-zu-jpg");
  await page.locator("#format").selectOption("png");
  await page.locator("#drop input").setInputFiles(file("serie.heic", "image/heic", makeHeic(2)));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("2 Bilder als PNG");
  await expect(job.locator(".job-download")).toHaveCount(2);
  const [download] = await Promise.all([page.waitForEvent("download"), job.locator(".job-download").nth(1).click()]);
  expect(download.suggestedFilename()).toBe("serie-2.png");
});

test("HEIC in JPG: kaputte Datei meldet Fehler", async ({ page }) => {
  await openTool(page, "heic-zu-jpg");
  await page.locator("#drop input").setInputFiles(file("kaputt.heic", "image/heic", Buffer.from("kein heic, nur text, wirklich")));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job.locator(".job-status")).toContainText("Keine HEIC-Datei");
});
