import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";
import { makeImagePdf, pdfImages } from "../../fixtures/pdf-extra.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("PDF verkleinern: Bilder werden heruntergerechnet", async ({ page }) => {
  const errors = await openTool(page, "pdf-komprimieren");
  const input = makeImagePdf(mupdf, { pages: 2 });
  await page.getByLabel("Stufe").selectOption("stark");
  await expect(page.getByLabel("Bilder höchstens (dpi)")).toHaveValue("96");
  await page.locator("#drop input").setInputFiles(file("scan.pdf", "application/pdf", input));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("→");
  await expect(job.locator(".job-status")).toContainText("−");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("scan-klein.pdf");
  expect(bytes.byteLength).toBeLessThan(input.byteLength / 10);
  expect(pdfImages(mupdf, bytes).map((i) => i.width)).toEqual([400, 400]);
  expect(pageTexts(mupdf, bytes)).toEqual(["Bildseite 1", "Bildseite 2"]);
  expect(errors).toEqual([]);
});

test("PDF verkleinern: schon kleine Datei bleibt das Original", async ({ page }) => {
  await openTool(page, "pdf-komprimieren");
  const tiny = makeTextPdf(mupdf, 1);
  // Erst aufräumen lassen, dann das Ergebnis erneut einwerfen.
  await page.locator("#drop input").setInputFiles(file("a.pdf", "application/pdf", tiny));
  const first = await downloadFirst(page);
  await page.locator("#drop input").setInputFiles(file("b.pdf", "application/pdf", first.bytes));
  const job = page.locator(".job", { hasText: "b.pdf" });
  await expect(job).toContainText("Original zurück");
  const { name, bytes } = await downloadFirst(page, job);
  expect(name).toBe("b.pdf");
  expect(Buffer.compare(bytes, first.bytes)).toBe(0);
});

test("PDF verkleinern: kaputte Datei wird gemeldet", async ({ page }) => {
  await openTool(page, "pdf-komprimieren");
  await page.locator("#drop input").setInputFiles(file("kaputt.pdf", "application/pdf", "kein pdf"));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job).toContainText("keine lesbare PDF");
});
