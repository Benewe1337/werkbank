import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { makeJpeg, makePng, withExifOrientation } from "../../fixtures/pdf-extra.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("Bilder in PDF: Reihenfolge ändern, A4 quer", async ({ page }) => {
  const errors = await openTool(page, "bild-zu-pdf");
  await page.locator("#drop input").setInputFiles([
    file("hoch.png", "image/png", makePng(mupdf, 100, 200)),
    file("quer.jpg", "image/jpeg", makeJpeg(mupdf, 300, 150)),
  ]);
  await page.getByRole("button", { name: "quer.jpg nach oben" }).click();
  await page.getByLabel("Seitengröße").selectOption("a4-quer");
  await page.getByRole("button", { name: "2 Bilder in PDF umwandeln" }).click();
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "done");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("bilder.pdf");
  const doc = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
  expect(doc.countPages()).toBe(2);
  expect(Math.round(doc.loadPage(0).getBounds()[2])).toBe(842);
  // Erste Seite enthält das JPEG unverändert (DCT), zweite das PNG (Flate).
  const filters = [0, 1].map((i) =>
    String(doc.findPage(i).get("Resources").get("XObject").get("Im0").get("Filter")),
  );
  expect(filters).toEqual(["/DCTDecode", "/FlateDecode"]);
  expect(errors).toEqual([]);
});

test("Bilder in PDF: WebP wird über den Browser gelesen", async ({ page }) => {
  await openTool(page, "bild-zu-pdf");
  const webp = await page.evaluate(async () => {
    const c = new OffscreenCanvas(64, 32);
    const g = c.getContext("2d");
    g.fillStyle = "#c00";
    g.fillRect(0, 0, 64, 32);
    const blob = await c.convertToBlob({ type: "image/webp" });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.locator("#drop input").setInputFiles(file("rot.webp", "image/webp", new Uint8Array(webp)));
  await page.getByRole("button", { name: "1 Bild in PDF umwandeln" }).click();
  const { bytes } = await downloadFirst(page);
  const p = mupdf.Document.openDocument(bytes, "application/pdf").loadPage(0);
  expect(p.getBounds()).toEqual([0, 0, 48, 24]);
});

test("Bilder in PDF: Handyfoto mit EXIF-Drehung steht richtig", async ({ page }) => {
  await openTool(page, "bild-zu-pdf");
  const photo = withExifOrientation(makeJpeg(mupdf, 160, 80), 6);
  await page.locator("#drop input").setInputFiles(file("foto.jpg", "image/jpeg", photo));
  await page.getByRole("button", { name: "1 Bild in PDF umwandeln" }).click();
  const { bytes } = await downloadFirst(page);
  // 160 × 80 px bei 96 dpi, um 90° gedreht: 60 × 120 pt
  expect(mupdf.Document.openDocument(bytes, "application/pdf").loadPage(0).getBounds()).toEqual([0, 0, 60, 120]);
});

test("Bilder in PDF: falsche Datei und kaputtes Bild", async ({ page }) => {
  await openTool(page, "bild-zu-pdf");
  await page.locator("#drop input").setInputFiles(file("text.txt", "text/plain", "hallo"));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "error");
  await page.locator("#drop input").setInputFiles(file("kaputt.png", "image/png", "kein bild"));
  await page.getByRole("button", { name: "1 Bild in PDF umwandeln" }).click();
  await expect(page.locator(".job").first()).toContainText("kaputt.png");
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "error");
});
