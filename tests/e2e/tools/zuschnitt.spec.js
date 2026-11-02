import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { makeHandoutPdf } from "../../fixtures/pdf.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("Zuschnitt: Handout hochladen und zerlegt herunterladen", async ({ page }) => {
  const errors = await openTool(page, "zuschnitt");
  await page.locator("#drop input").setInputFiles(file("vorlesung.pdf", "application/pdf", makeHandoutPdf(mupdf, ["full", "half"])));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("2 Seiten → 3 Folien");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("vorlesung-zugeschnitten.pdf");
  expect(mupdf.Document.openDocument(bytes, "application/pdf").countPages()).toBe(3);
  expect(errors).toEqual([]);
});

test("Zuschnitt: Nicht-PDF wird abgelehnt", async ({ page }) => {
  await openTool(page, "zuschnitt");
  await page.locator("#drop input").setInputFiles(file("bild.png", "image/png", "x"));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "error");
});
