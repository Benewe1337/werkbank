import { expect, test } from "@playwright/test";
import { readCodes } from "../../fixtures/daten.js";
import { openTool } from "../helpers.js";

async function download(page, name) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  return { name: dl.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

// [Format, Eingabe, erwarteter Lesewert, Leseformat]
const CASES = [
  ["EAN13", "400638133393", "4006381333931", "EAN13"],
  ["EAN8", "9638507", "96385074", "EAN8"],
  // zxing liest UPC-A als EAN-13 mit führender 0.
  ["UPCA", "036000291452", "0036000291452", "UPCA", "036000291452"],
  ["Code128", "Werkbank-2024 ä", "Werkbank-2024 ä", "Code128"],
  ["Code39", "werkbank-42", "WERKBANK-42", "Code39"],
  ["ITF", "1234567", "01234567", "ITF"],
  ["DataMatrix", "Grüße aus der Werkbank", "Grüße aus der Werkbank", "DataMatrix"],
  ["PDF417", "Werkbank PDF417", "Werkbank PDF417", "PDF417"],
  ["Aztec", "Aztec: äöü", "Aztec: äöü", "Aztec"],
];

test("Barcode: alle Formate als PNG erzeugen und zurücklesen", async ({ page }) => {
  const errors = await openTool(page, "barcode");
  for (const [format, input, expected, readFormat, shown = expected] of CASES) {
    await page.getByLabel("Format").selectOption(format);
    await page.getByLabel("Inhalt").fill(input);
    await expect(page.locator("#note")).toContainText(shown);
    const { name, bytes } = await download(page, "PNG herunterladen");
    expect(name).toBe(`barcode-${format.toLowerCase()}.png`);
    const results = await readCodes(bytes, [readFormat]);
    expect(results.map((r) => r.text), format).toEqual([expected]);
  }
  expect(errors).toEqual([]);
});

test("Barcode: SVG ist ein gültiges Bild", async ({ page }) => {
  await openTool(page, "barcode");
  await page.getByLabel("Format").selectOption("EAN13");
  await page.getByLabel("Inhalt").fill("4006381333931");
  await expect(page.locator("#note")).toContainText("Prüfziffer stimmt");
  const { bytes } = await download(page, "SVG herunterladen");
  expect(bytes.toString("utf8")).toContain("<svg");
  await expect(page.locator("#preview img")).toHaveJSProperty("complete", true);
  expect(await page.locator("#preview img").evaluate((img) => img.naturalWidth)).toBeGreaterThan(50);
});

test("Barcode: falsche Prüfziffer und ungültige Zeichen werden gemeldet", async ({ page }) => {
  await openTool(page, "barcode");
  await page.getByLabel("Format").selectOption("EAN13");
  await page.getByLabel("Inhalt").fill("4006381333932");
  await expect(page.locator("#error")).toHaveText("Prüfziffer falsch: Am Ende muss 1 stehen, nicht 2.");
  await expect(page.getByRole("button", { name: "PNG herunterladen" })).toBeDisabled();
  await page.getByLabel("Format").selectOption("ITF");
  await page.getByLabel("Inhalt").fill("12a4");
  await expect(page.locator("#error")).toHaveText("ITF besteht nur aus Ziffern.");
});
