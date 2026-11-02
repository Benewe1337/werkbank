import { expect, test } from "@playwright/test";
import { file, openTool } from "../helpers.js";

test("Texte vergleichen: zeilenweise mit Zusammenfassung und Markierung", async ({ page }) => {
  const errors = await openTool(page, "text-vergleich");
  await page.getByLabel("Original").fill("Erste Zeile\nZweite Zeile\nDritte Zeile");
  await page.getByLabel("Geändert").fill("Erste Zeile\nZweite Zeile, geändert\nDritte Zeile\nVierte Zeile");
  await page.getByRole("button", { name: "Vergleichen" }).click();
  await expect(page.locator("#summary")).toHaveText("2 Zeilen hinzugefügt, 1 entfernt");
  await expect(page.locator("#result del")).toHaveText(["Zweite Zeile"]);
  await expect(page.locator("#result ins")).toHaveText(["Zweite Zeile, geändert", "Vierte Zeile"]);
  // Nicht nur Farbe: entfernt ist durchgestrichen, hinzugefügt unterstrichen.
  expect(await page.locator("#result del").first().evaluate((e) => getComputedStyle(e).textDecorationLine)).toBe("line-through");
  expect(await page.locator("#result ins").first().evaluate((e) => getComputedStyle(e).textDecorationLine)).toBe("underline");
  expect(errors).toEqual([]);
});

test("Texte vergleichen: wortweise, Dateien laden, Nutzertext bleibt Text", async ({ page }) => {
  const errors = await openTool(page, "text-vergleich");
  await page.locator("#before-file").setInputFiles(file("alt.txt", "text/plain", "Der Hund <b>bellt</b> laut"));
  await page.locator("#after-file").setInputFiles(file("neu.txt", "text/plain", "Der Kater <b>bellt</b> sehr laut"));
  await expect(page.getByLabel("Original")).toHaveValue("Der Hund <b>bellt</b> laut");
  await page.getByLabel("Vergleich").selectOption("words");
  await page.getByLabel("Geändert").press("Control+Enter");
  await expect(page.locator("#summary")).toHaveText("2 Wörter hinzugefügt, 1 entfernt");
  await expect(page.locator("#result del")).toHaveText(["Hund"]);
  await expect(page.locator("#result b")).toHaveCount(0);
  await expect(page.locator("#result")).toContainText("<b>bellt</b>");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Als .diff herunterladen" }).click()]);
  expect(download.suggestedFilename()).toBe("unterschiede.diff");
  expect(errors).toEqual([]);
});

test("Texte vergleichen: Binärdatei wird abgelehnt", async ({ page }) => {
  await openTool(page, "text-vergleich");
  await page.locator("#before-file").setInputFiles(file("bild.png", "text/plain", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1])));
  await expect(page.locator("#error")).toContainText("nicht nach einer Textdatei");
});

test("Texte vergleichen: gleiche Texte", async ({ page }) => {
  await openTool(page, "text-vergleich");
  await page.getByLabel("Original").fill("gleich");
  await page.getByLabel("Geändert").fill("gleich");
  await page.getByRole("button", { name: "Vergleichen" }).click();
  await expect(page.locator("#summary")).toHaveText("Keine Unterschiede.");
});
