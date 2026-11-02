import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { makeTextPdf } from "../../fixtures/pdf.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("PDF in Bilder: gewählte Seiten als JPG mit 72 dpi", async ({ page }) => {
  const errors = await openTool(page, "pdf-zu-bild");
  await page.getByLabel("Format").selectOption("jpg");
  await page.getByLabel("Auflösung").selectOption("72");
  await page.getByLabel("Seiten (leer = alle)").fill("2-3");
  await page.locator("#drop input").setInputFiles(file("folien.pdf", "application/pdf", makeTextPdf(mupdf, 3)));
  await expect(page.locator(".job").first()).toContainText("2 Bilder als JPG, 72 dpi");
  await expect(page.locator(".job")).toHaveCount(3);
  const job = page.locator(".job", { hasText: "folien-seite-2.jpg" });
  const { name, bytes } = await downloadFirst(page, job);
  expect(name).toBe("folien-seite-2.jpg");
  const img = new mupdf.Image(bytes);
  expect([img.getWidth(), img.getHeight()]).toEqual([595, 842]);
  await expect(page.getByRole("button", { name: "Alle als ZIP herunterladen" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("PDF in Bilder: PNG mit 150 dpi", async ({ page }) => {
  await openTool(page, "pdf-zu-bild");
  await page.locator("#drop input").setInputFiles(file("eins.pdf", "application/pdf", makeTextPdf(mupdf, 1)));
  const job = page.locator(".job", { hasText: "eins-seite-1.png" });
  const { bytes } = await downloadFirst(page, job);
  const img = new mupdf.Image(bytes);
  expect(img.getWidth()).toBe(Math.round((595 * 150) / 72));
  expect(img.getXResolution()).toBe(150);
});

test("PDF in Bilder: Seite außerhalb des Bereichs", async ({ page }) => {
  await openTool(page, "pdf-zu-bild");
  await page.getByLabel("Seiten (leer = alle)").fill("5");
  await page.locator("#drop input").setInputFiles(file("kurz.pdf", "application/pdf", makeTextPdf(mupdf, 2)));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job).toContainText("gibt es nicht");
});
