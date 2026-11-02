import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { makeTextPdf, pageTexts } from "../../fixtures/pdf.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test.setTimeout(180_000);

/** PNG mit gut lesbarem Text, im Browser per Canvas gezeichnet. */
async function textImage(page, lines) {
  const base64 = await page.evaluate(async (lines) => {
    const canvas = new OffscreenCanvas(1400, 120 + lines.length * 90);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.font = "56px Arial, Helvetica, sans-serif";
    lines.forEach((line, i) => ctx.fillText(line, 60, 110 + i * 90));
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }, lines);
  return Buffer.from(base64, "base64");
}

test("OCR: erkennt Text in einem Bild", async ({ page }) => {
  const errors = await openTool(page, "ocr");
  const png = await textImage(page, ["Die Werkbank erkennt Text", "Grüße aus Hamburg 2026"]);
  await page.locator("#drop input").setInputFiles(file("scan.png", "image/png", png));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  const text = await job.locator("textarea").inputValue();
  expect(text).toContain("Werkbank erkennt Text");
  expect(text).toContain("Grüße aus Hamburg");
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("scan.txt");
  expect(bytes.toString("utf8")).toContain("Werkbank");
  expect(errors).toEqual([]);
});

test("OCR: gescanntes PDF auf Englisch, mit durchsuchbarem PDF", async ({ page }) => {
  const errors = await openTool(page, "ocr");
  await page.getByLabel("Sprache").selectOption("eng");
  await page.getByLabel("Durchsuchbares PDF erzeugen").check();
  await expect(page.locator("#engine")).toHaveAttribute("data-state", "ready");
  await page.locator("#drop input").setInputFiles(file("scan.pdf", "application/pdf", makeTextPdf(mupdf, 2, "Workbench")));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("2 Seiten");
  const text = await job.locator("textarea").inputValue();
  expect(text).toMatch(/Seite 1 ---\s+Workbench 1/);
  expect(text).toMatch(/Seite 2 ---\s+Workbench 2/);
  const [download] = await Promise.all([page.waitForEvent("download"), job.getByRole("link", { name: /PDF herunterladen/ }).click()]);
  expect(download.suggestedFilename()).toBe("scan-durchsuchbar.pdf");
  const chunks = [];
  for await (const c of await download.createReadStream()) chunks.push(c);
  const pdfBytes = Buffer.concat(chunks);
  const texts = pageTexts(mupdf, pdfBytes);
  expect(texts).toHaveLength(2);
  expect(texts[1]).toContain("Workbench 2");
  expect(errors).toEqual([]);
});

test("OCR: kaputtes PDF und falscher Dateityp", async ({ page }) => {
  await openTool(page, "ocr");
  await page.locator("#drop input").setInputFiles(file("text.txt", "text/plain", "hallo"));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "error");
  await page.locator("#drop input").setInputFiles(file("kaputt.pdf", "application/pdf", "kein pdf"));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job.locator(".job-status")).toContainText("Keine lesbare PDF");
});
