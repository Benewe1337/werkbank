import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("PDF-Seiten: umsortieren, drehen, löschen und speichern", async ({ page }) => {
  const errors = await openTool(page, "pdf-seiten");
  await page.locator("#drop input").setInputFiles(file("skript.pdf", "application/pdf", makeTextPdf(mupdf, 4)));
  const cards = page.locator(".page-card");
  await expect(cards).toHaveCount(4);
  // Vorschaubilder kommen aus dem Worker
  await expect(cards.nth(3).locator("img")).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: "Seite 3 nach vorne" }).click();
  await page.getByRole("button", { name: "Seite 4 drehen" }).click();
  await page.getByRole("button", { name: "Seite 1 löschen" }).click();
  await expect(page.locator("#file")).toContainText("3 von 4 Seiten (1 gelöscht)");
  // Ziehen: Seite 4 vor Seite 2
  await cards.nth(2).dragTo(cards.nth(0));
  await expect(cards.locator(".page-label")).toHaveText(["Seite 4 · 90°", "Seite 3", "Seite 2"]);
  await page.getByRole("button", { name: "Speichern" }).click();
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("skript-bearbeitet.pdf");
  expect(pageTexts(mupdf, bytes)).toEqual(["Seite 4", "Seite 3", "Seite 2"]);
  const doc = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
  expect(doc.findPage(0).get("Rotate").valueOf()).toBe(90);
  expect(errors).toEqual([]);
});

test("PDF-Seiten: kaputte Datei wird gemeldet", async ({ page }) => {
  await openTool(page, "pdf-seiten");
  await page.locator("#drop input").setInputFiles(file("kaputt.pdf", "application/pdf", "kein pdf"));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "error");
  await expect(page.locator("#editor")).toBeHidden();
});
