import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("PDFs zusammenfügen: Reihenfolge ändern und verbinden", async ({ page }) => {
  const errors = await openTool(page, "pdf-zusammenfuegen");
  await page.locator("#drop input").setInputFiles([
    file("a.pdf", "application/pdf", makeTextPdf(mupdf, 1, "A")),
    file("b.pdf", "application/pdf", makeTextPdf(mupdf, 1, "B")),
  ]);
  await page.getByRole("button", { name: "b.pdf nach oben" }).click();
  await page.getByRole("button", { name: "2 PDFs zusammenfügen" }).click();
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "done");
  const { bytes } = await downloadFirst(page);
  expect(pageTexts(mupdf, bytes)).toEqual(["B 1", "A 1"]);
  expect(errors).toEqual([]);
});
