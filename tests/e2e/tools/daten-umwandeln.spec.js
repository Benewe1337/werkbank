import { expect, test } from "@playwright/test";
import * as yaml from "js-yaml";
import { CSV_SEMICOLON, SAMPLE_ROWS } from "../../fixtures/daten.js";
import { file, openTool } from "../helpers.js";

test("Daten umwandeln: CSV-Datei (Semikolon) wird zu JSON und YAML", async ({ page }) => {
  const errors = await openTool(page, "daten-umwandeln");
  await page.locator("#drop input").setInputFiles(file("kunden.csv", "text/csv", CSV_SEMICOLON));
  await expect(page.locator("#status")).toContainText("CSV (erkannt) → JSON");
  expect(JSON.parse(await page.locator("#output").inputValue())).toEqual(SAMPLE_ROWS);

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Herunterladen" }).click()]);
  expect(dl.suggestedFilename()).toBe("kunden.json");

  await page.locator("#to").selectOption("yaml");
  expect(yaml.load(await page.locator("#output").inputValue())).toEqual(SAMPLE_ROWS);
  expect(errors).toEqual([]);
});

test("Daten umwandeln: JSON formatieren, minimieren und als XML", async ({ page }) => {
  await openTool(page, "daten-umwandeln");
  await page.getByLabel("Eingabe", { exact: true }).fill('{ "buch": { "@id": 7, "titel": "Faust" } }');
  await expect(page.locator("#output")).toHaveValue('{\n  "buch": {\n    "@id": 7,\n    "titel": "Faust"\n  }\n}');
  await page.getByLabel("Minimieren").check();
  await expect(page.locator("#output")).toHaveValue('{"buch":{"@id":7,"titel":"Faust"}}');
  await page.locator("#to").selectOption("xml");
  await expect(page.locator("#output")).toHaveValue('<?xml version="1.0" encoding="UTF-8"?><buch id="7"><titel>Faust</titel></buch>');
});

test("Daten umwandeln: Syntaxfehler mit Zeile und Spalte", async ({ page }) => {
  await openTool(page, "daten-umwandeln");
  await page.getByLabel("Eingabe", { exact: true }).fill('{\n  "a": 1,\n  "b": }');
  await expect(page.locator("#error")).toHaveText("Ungültiges JSON: Unerwartetes Zeichen (Zeile 3, Spalte 8)");
  await expect(page.locator("#output")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Herunterladen" })).toBeDisabled();
});
