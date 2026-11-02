import { expect, test } from "@playwright/test";
import { decodeAs, encodeAs, makePixels } from "../../fixtures/bild.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("Bildgröße ändern: JPG auf 300 px Breite, Seitenverhältnis bleibt", async ({ page }) => {
  const errors = await openTool(page, "bild-groesse");
  await page.locator("#width").fill("300");
  await page.locator("#drop input").setInputFiles(file("urlaub.jpg", "image/jpeg", await encodeAs("jpeg", makePixels(800, 600))));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("800 × 600 → 300 × 225");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("urlaub-300x225.jpg");
  const img = await decodeAs("jpeg", bytes);
  expect([img.width, img.height]).toEqual([300, 225]);
  expect(errors).toEqual([]);
});

test("Bildgröße ändern: Prozent und PNG-Ausgabe", async ({ page }) => {
  await openTool(page, "bild-groesse");
  await page.locator("#unit").selectOption("percent");
  await expect(page.locator("#height")).toBeDisabled();
  await page.locator("#width").fill("25");
  await page.locator("#format").selectOption("png");
  await page.locator("#drop input").setInputFiles(file("grafik.webp", "image/webp", await encodeAs("webp", makePixels(400, 200))));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "done");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("grafik-100x50.png");
  const img = await decodeAs("png", bytes);
  expect([img.width, img.height]).toEqual([100, 50]);
});

test("Bildgröße ändern: fehlende Maße melden einen Fehler", async ({ page }) => {
  await openTool(page, "bild-groesse");
  await page.locator("#width").fill("");
  await page.locator("#drop input").setInputFiles(file("a.png", "image/png", await encodeAs("png", makePixels(10, 10))));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job.locator(".job-status")).toContainText("Breite oder eine Höhe");
});
