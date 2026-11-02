import { expect, test } from "@playwright/test";
import { decodeAs, encodeAs, makePixels } from "../../fixtures/bild.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("Bilder komprimieren: PNG wird als WebP kleiner und bleibt gleich groß", async ({ page }) => {
  const errors = await openTool(page, "bild-komprimieren");
  const png = await encodeAs("png", makePixels(120, 80));
  await page.locator("#format").selectOption("webp");
  await page.locator("#drop input").setInputFiles(file("grafik.png", "image/png", png));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("WebP, 120 × 80");
  await expect(job.locator(".job-preview")).toBeVisible();
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("grafik-klein.webp");
  expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
  expect(bytes.length).toBeLessThan(png.length);
  const decoded = await decodeAs("webp", bytes);
  expect([decoded.width, decoded.height]).toEqual([120, 80]);
  expect(errors).toEqual([]);
});

test("Bilder komprimieren: JPG mit Qualität und PNG verlustfrei", async ({ page }) => {
  await openTool(page, "bild-komprimieren");
  const jpeg = await encodeAs("jpeg", makePixels(200, 100), 98);
  await page.locator("#quality").fill("40");
  await page.locator("#drop input").setInputFiles(file("foto.jpg", "image/jpeg", jpeg));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("Qualität 40");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("foto-klein.jpg");
  expect(bytes.length).toBeLessThan(jpeg.length);
  expect((await decodeAs("jpeg", bytes)).width).toBe(200);

  // Gleiche Datei noch einmal, diesmal als PNG: Regler ist dann gesperrt, Pixel bleiben exakt.
  const png = await encodeAs("png", makePixels(50, 40, "half"));
  await page.locator("#format").selectOption("png");
  await expect(page.locator("#quality")).toBeDisabled();
  await page.locator("#drop input").setInputFiles(file("logo.png", "image/png", png));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "done");
  const out = await downloadFirst(page);
  expect(out.name).toBe("logo-klein.png");
  const a = await decodeAs("png", png);
  const b = await decodeAs("png", out.bytes);
  // Sichtbare Pixel exakt gleich (unter voll durchsichtigen darf oxipng die Farbe aufräumen).
  const visible = (img) => img.data.filter((_, i) => img.data[i - (i % 4) + 3] !== 0);
  expect(Buffer.from(visible(b)).equals(Buffer.from(visible(a)))).toBe(true);
  expect(b.data.filter((_, i) => i % 4 === 3)).toEqual(a.data.filter((_, i) => i % 4 === 3));
  // Ab zwei Ergebnissen gibt es das ZIP
  await expect(page.getByRole("button", { name: "Alle als ZIP herunterladen" })).toBeVisible();
});

test("Bilder komprimieren: kaputte Datei und falscher Typ melden einen Fehler", async ({ page }) => {
  await openTool(page, "bild-komprimieren");
  await page.locator("#drop input").setInputFiles(file("kaputt.jpg", "image/jpeg", Buffer.from("das ist kein bild, nur text")));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job.locator(".job-status")).toContainText("Kein unterstütztes Bild");
  await page.locator("#drop input").setInputFiles(file("text.txt", "text/plain", "x"));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "error");
});
