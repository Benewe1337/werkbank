import { expect, test } from "@playwright/test";
import exifr from "exifr";
import { makeHeic, makeJpegWithMetadata, makePngWithMetadata } from "../../fixtures/bild.js";
import { downloadFirst, file, openTool } from "../helpers.js";

const ALL = { tiff: true, xmp: true, iptc: true, gps: true, exif: true, userComment: true, ihdr: false };

test("Metadaten entfernen: GPS wird angezeigt und ist danach wirklich weg", async ({ page }) => {
  const errors = await openTool(page, "exif-entfernen");
  const jpeg = await makeJpegWithMetadata({ orientation: 1, gps: { lat: 48.137, lon: 11.575 } });
  await page.locator("#drop input").setInputFiles(file("urlaub.jpg", "image/jpeg", jpeg));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".alert")).toContainText("GPS-Position gespeichert");
  await expect(job.locator(".alert")).toContainText("48,13700° N, 11,57500° O");
  await expect(job.locator(".job-meta table").first()).toContainText("Testkamera");
  await expect(job.locator(".job-status")).toContainText("entfernt: EXIF, XMP, IPTC, Kommentar");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("urlaub-ohne-metadaten.jpg");
  expect(await exifr.parse(bytes, ALL)).toBeUndefined();
  expect(await exifr.gps(bytes)).toBeUndefined();
  expect(bytes.includes(Buffer.from("Erika"))).toBe(false);
  expect(errors).toEqual([]);
});

test("Metadaten entfernen: Drehung bleibt auf Wunsch, PNG wird gesäubert", async ({ page }) => {
  await openTool(page, "exif-entfernen");
  await page.locator("#drop input").setInputFiles(file("hoch.jpg", "image/jpeg", await makeJpegWithMetadata({ orientation: 6 })));
  let job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-notes")).toContainText("Drehung ist als einziger Eintrag geblieben");
  const kept = await downloadFirst(page);
  expect(await exifr.parse(kept.bytes, ALL)).toEqual({ Orientation: "Rotate 90 CW" });

  await page.locator("#drop input").setInputFiles(file("grafik.png", "image/png", await makePngWithMetadata()));
  job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  const png = await downloadFirst(page);
  expect(png.name).toBe("grafik-ohne-metadaten.png");
  expect(await exifr.parse(png.bytes, ALL)).toBeUndefined();
});

test("Metadaten entfernen: HEIC wird als JPG neu gespeichert", async ({ page }) => {
  await openTool(page, "exif-entfernen");
  await page.locator("#drop input").setInputFiles(file("IMG_1.heic", "image/heic", makeHeic(1)));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-notes")).toContainText("HEIC wurde dafür neu gespeichert (als JPG)");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("IMG_1-ohne-metadaten.jpg");
  expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
});

test("Metadaten entfernen: kaputtes JPEG meldet Fehler", async ({ page }) => {
  await openTool(page, "exif-entfernen");
  await page.locator("#drop input").setInputFiles(file("kaputt.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x40, 0x00, 1, 2, 3, 4, 5, 6, 7])));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job.locator(".job-status")).toContainText("abgeschnitten");
});
