import { expect, test } from "@playwright/test";
import { CSV_SEMICOLON } from "../../fixtures/daten.js";
import { file, openTool } from "../helpers.js";

const ORDERS = JSON.stringify([
  { kunde: "Anna", betrag: 12.5, datum: "2024-01-31" },
  { kunde: "Anna", betrag: 7.5, datum: "2024-02-01" },
  { kunde: "Bernd; der Zweite", betrag: 100, datum: "2024-02-02" },
]);

test("Tabellen mit SQL: CSV und JSON laden, verknüpfen, als CSV exportieren", async ({ page, baseURL }) => {
  // Alles außer der eigenen Herkunft (lokal oder Live-Domain) gilt als fremde Anfrage.
  const own = new URL(baseURL).origin;
  const requests = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.origin !== own && !url.protocol.startsWith("blob") && !url.protocol.startsWith("data")) requests.push(r.url());
  });
  const errors = await openTool(page, "tabellen-sql");
  await page.locator("#drop input").setInputFiles([file("Kunden Liste.csv", "text/csv", CSV_SEMICOLON), file("bestellungen.json", "application/json", ORDERS)]);
  const tables = page.locator("#tables .result-item");
  await expect(tables).toHaveCount(2);
  await expect(tables.nth(0)).toContainText("kunden_liste");
  await expect(tables.nth(0)).toContainText("2 Zeilen, 4 Spalten");
  await expect(tables.nth(0).locator(".schema")).toContainText("plz VARCHAR");
  await expect(tables.nth(1)).toContainText("bestellungen");
  await expect(tables.nth(1)).toContainText("3 Zeilen, 3 Spalten");
  await expect(page.locator("#sql")).toHaveValue('SELECT *\nFROM "kunden_liste"\nLIMIT 100;');

  await page.locator("#sql").fill(
    "SELECT k.name, k.plz, sum(b.betrag) AS summe, count(*) AS anzahl\nFROM kunden_liste k JOIN bestellungen b ON b.kunde = k.name\nGROUP BY ALL ORDER BY summe DESC;",
  );
  await page.getByRole("button", { name: "Abfrage ausführen" }).click();
  await expect(page.locator("#status")).toContainText("2 Zeilen.");
  const rows = page.locator("#result tbody tr");
  await expect(rows.nth(0).locator("td")).toHaveText(["Bernd; der Zweite", "20095", "100", "1"]);
  await expect(rows.nth(1).locator("td")).toHaveText(["Anna", "01067", "20", "2"]);

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Ergebnis als CSV" }).click()]);
  expect(dl.suggestedFilename()).toBe("ergebnis.csv");
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  expect(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "")).toBe('name,plz,summe,anzahl\r\nBernd; der Zweite,20095,100,1\r\nAnna,01067,20,2');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("Tabellen mit SQL: über 1000 Zeilen werden gekürzt angezeigt, Fehler verständlich", async ({ page }) => {
  await openTool(page, "tabellen-sql");
  await page.locator("#sql").fill("SELECT range AS n FROM range(2500)");
  await page.getByRole("button", { name: "Abfrage ausführen" }).click();
  await expect(page.locator("#status")).toContainText("2.500 Zeilen, die ersten 1.000 angezeigt.");
  await expect(page.locator("#result tbody tr")).toHaveCount(1000);

  // Parquet ist eingebaut: in DuckDBs Dateisystem schreiben und wieder lesen.
  await page.locator("#sql").fill("COPY (SELECT 1 AS a, 'zwei' AS b) TO 'probe.parquet' (FORMAT parquet)");
  await page.getByRole("button", { name: "Abfrage ausführen" }).click();
  await expect(page.locator("#error")).toBeHidden();
  await page.locator("#sql").fill("SELECT * FROM read_parquet('probe.parquet')");
  await page.getByRole("button", { name: "Abfrage ausführen" }).click();
  await expect(page.locator("#result tbody tr").first().locator("td")).toHaveText(["1", "zwei"]);

  await page.locator("#sql").fill("SELECT * FROM gibt_es_nicht");
  await page.getByRole("button", { name: "Abfrage ausführen" }).click();
  await expect(page.locator("#error")).toContainText("Diese Tabelle gibt es nicht.");
  await expect(page.getByRole("button", { name: "Ergebnis als CSV" })).toBeDisabled();

  await page.locator("#drop input").setInputFiles(file("tabelle.xlsx", "application/octet-stream", "x"));
  await expect(page.locator("#error")).toContainText("tabelle.xlsx: Passt nicht");
});
