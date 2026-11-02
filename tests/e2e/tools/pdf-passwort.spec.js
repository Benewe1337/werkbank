import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";
import { downloadFirst, file, openTool } from "../helpers.js";

const lock = (bytes, password) =>
  mupdf.Document.openDocument(bytes, "application/pdf")
    .asPDF()
    .saveToBuffer(`encrypt=aes-256,user-password=${password},owner-password=${password}`)
    .asUint8Array()
    .slice();

test("PDF-Passwort: schützen, danach braucht die Datei das Passwort", async ({ page }) => {
  const errors = await openTool(page, "pdf-passwort");
  await page.getByLabel("Mit Passwort schützen").check();
  await page.getByLabel("Passwort zum Öffnen").fill("Sommer2026");
  await page.getByLabel("Passwort wiederholen").fill("Sommer2026");
  await page.locator("#drop input").setInputFiles(file("vertrag.pdf", "application/pdf", makeTextPdf(mupdf, 2)));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "done");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("vertrag-geschuetzt.pdf");
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  expect(doc.needsPassword()).toBe(true);
  expect(doc.getMetaData("encryption")).toMatch(/256-bit AES/);
  expect(doc.authenticatePassword("falsch")).toBe(0);
  expect(doc.authenticatePassword("Sommer2026")).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("PDF-Passwort: Schutz entfernen", async ({ page }) => {
  await openTool(page, "pdf-passwort");
  await page.getByLabel("Passwort der PDF").fill("geheim");
  await page.locator("#drop input").setInputFiles(file("akte.pdf", "application/pdf", lock(makeTextPdf(mupdf, 2), "geheim")));
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("akte-offen.pdf");
  expect(mupdf.Document.openDocument(bytes, "application/pdf").needsPassword()).toBe(false);
  expect(pageTexts(mupdf, bytes)).toEqual(["Seite 1", "Seite 2"]);
});

test("PDF-Passwort: falsches Passwort und abweichende Wiederholung", async ({ page }) => {
  await openTool(page, "pdf-passwort");
  await page.getByLabel("Passwort der PDF").fill("falsch");
  await page.locator("#drop input").setInputFiles(file("akte.pdf", "application/pdf", lock(makeTextPdf(mupdf, 1), "geheim")));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "error");
  await expect(page.locator(".job").first()).toContainText("Passwort stimmt nicht");

  await page.getByLabel("Mit Passwort schützen").check();
  await page.getByLabel("Passwort zum Öffnen").fill("eins");
  await page.getByLabel("Passwort wiederholen").fill("zwei");
  await page.locator("#drop input").setInputFiles(file("b.pdf", "application/pdf", makeTextPdf(mupdf, 1)));
  await expect(page.locator(".job").first()).toContainText("stimmen nicht überein");
});
