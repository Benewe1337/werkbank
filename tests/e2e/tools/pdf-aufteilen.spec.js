import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("PDF aufteilen: nach Bereichen in mehrere Dateien", async ({ page }) => {
  const errors = await openTool(page, "pdf-aufteilen");
  await page.locator("#drop input").setInputFiles(file("bericht.pdf", "application/pdf", makeTextPdf(mupdf, 5)));
  await expect(page.locator("#file")).toContainText("5 Seiten");
  await page.getByLabel("Aufteilen").selectOption("ranges");
  await page.getByLabel("Bereiche, getrennt durch Komma").fill("1-2, 3-5");
  await page.getByRole("button", { name: "Aufteilen" }).click();
  await expect(page.locator(".job").first()).toContainText("2 Dateien, 5 Seiten");
  const second = page.locator(".job", { hasText: "bericht-3-5.pdf" });
  await expect(second).toHaveAttribute("data-state", "done");
  const { name, bytes } = await downloadFirst(page, second);
  expect(name).toBe("bericht-3-5.pdf");
  expect(pageTexts(mupdf, bytes)).toEqual(["Seite 3", "Seite 4", "Seite 5"]);
  await expect(page.getByRole("button", { name: "Alle als ZIP herunterladen" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("PDF aufteilen: Seiten extrahieren", async ({ page }) => {
  await openTool(page, "pdf-aufteilen");
  await page.locator("#drop input").setInputFiles(file("bericht.pdf", "application/pdf", makeTextPdf(mupdf, 4)));
  await expect(page.locator("#file")).toContainText("4 Seiten");
  await page.getByLabel("Aufteilen").selectOption("extract");
  await page.getByLabel("Seiten", { exact: true }).fill("4, 2");
  await page.getByRole("button", { name: "Seiten extrahieren" }).click();
  const job = page.locator(".job", { hasText: "bericht-auszug.pdf" });
  const { bytes } = await downloadFirst(page, job);
  expect(pageTexts(mupdf, bytes)).toEqual(["Seite 4", "Seite 2"]);
});

test("PDF aufteilen: ungültiger Bereich wird gemeldet", async ({ page }) => {
  await openTool(page, "pdf-aufteilen");
  await page.locator("#drop input").setInputFiles(file("kurz.pdf", "application/pdf", makeTextPdf(mupdf, 2)));
  await expect(page.locator("#file")).toContainText("2 Seiten");
  await page.getByLabel("Aufteilen").selectOption("ranges");
  await page.getByLabel("Bereiche, getrennt durch Komma").fill("1-9");
  await page.getByRole("button", { name: "Aufteilen" }).click();
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job).toContainText("gibt es nicht");
});
