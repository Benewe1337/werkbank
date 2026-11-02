import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { pageTexts } from "../../fixtures/pdf.js";
import { makeLinesPdf } from "../../fixtures/pdf-extra.js";
import { downloadFirst, file, openTool } from "../helpers.js";

const sample = () =>
  makeLinesPdf(mupdf, [["Max Mustermann wohnt in Berlin"], ["Nichts"], ["Gruss, MUSTERMANN"]]);

test("PDF schwärzen: Begriffe werden echt entfernt", async ({ page }) => {
  const errors = await openTool(page, "pdf-schwaerzen");
  await page.getByLabel("Begriffe, einer pro Zeile").fill("mustermann\nBerlin\nHamburg");
  await page.locator("#drop input").setInputFiles(file("akte.pdf", "application/pdf", sample()));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toHaveText("3 Stellen auf 2 Seiten geschwärzt");
  await expect(job.locator(".job-notes")).toContainText("S. 1: „mustermann“ 1×, „Berlin“ 1×");
  await expect(job.locator(".job-notes")).toContainText("S. 3: „mustermann“ 1×");
  await expect(job.locator(".job-notes")).toContainText("Nicht gefunden: „Hamburg“");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("akte-geschwaerzt.pdf");
  const texts = pageTexts(mupdf, bytes);
  expect(texts.join(" ")).not.toMatch(/mustermann|berlin/i);
  expect(texts[0]).toContain("wohnt in");
  expect(errors).toEqual([]);
});

test("PDF schwärzen: ohne Begriffe gibt es einen Hinweis", async ({ page }) => {
  await openTool(page, "pdf-schwaerzen");
  await page.locator("#drop input").setInputFiles(file("akte.pdf", "application/pdf", sample()));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job).toContainText("Suchbegriff");
});

test("PDF schwärzen: Groß-/Kleinschreibung beachten", async ({ page }) => {
  await openTool(page, "pdf-schwaerzen");
  await page.getByLabel("Begriffe, einer pro Zeile").fill("mustermann");
  await page.getByLabel("Groß-/Kleinschreibung beachten").check();
  await page.locator("#drop input").setInputFiles(file("akte.pdf", "application/pdf", sample()));
  await expect(page.locator(".job").first()).toContainText("Keiner der Begriffe");
  await expect(page.locator(".job-download")).toHaveCount(0);
});
