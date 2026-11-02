import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { makeTextPdf } from "../../fixtures/pdf.js";
import { makeImagePdf } from "../../fixtures/pdf-extra.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("Text aus PDF: Vorschau, Kopieren und .txt", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = await openTool(page, "pdf-text");
  await page.locator("#drop input").setInputFiles(file("notizen.pdf", "application/pdf", makeTextPdf(mupdf, 2)));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("2 Seiten");
  await expect(page.locator("#text")).toContainText("Seite 1");
  await expect(page.locator("#text")).toContainText("Seite 2");
  await expect(page.locator("#scan-hint")).toBeHidden();
  await page.getByRole("button", { name: "Text kopieren" }).click();
  await expect(page.locator("#copy-status")).toHaveText("Kopiert.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Seite 2");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("notizen.txt");
  expect(bytes.toString("utf8")).toMatch(/Seite 1[\s\S]*Seite 2/);
  expect(errors).toEqual([]);
});

test("Text aus PDF: Scan ohne Text verweist auf OCR", async ({ page }) => {
  await openTool(page, "pdf-text");
  const scan = makeImagePdf(mupdf, { width: 200, height: 200, text: null });
  await page.locator("#drop input").setInputFiles(file("scan.pdf", "application/pdf", scan));
  await expect(page.locator("#scan-hint")).toBeVisible();
  await expect(page.locator("#scan-hint a")).toHaveAttribute("href", "/tools/ocr/");
  await expect(page.locator(".job").first()).toContainText("Texterkennung");
});

test("Text aus PDF: kaputte Datei", async ({ page }) => {
  await openTool(page, "pdf-text");
  await page.locator("#drop input").setInputFiles(file("x.pdf", "application/pdf", "nope"));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "error");
});
