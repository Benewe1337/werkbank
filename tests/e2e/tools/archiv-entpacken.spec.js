import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { makeEncryptedZip, makeTarGz, makeZip } from "../../fixtures/daten.js";
import { file, openTool } from "../helpers.js";

async function save(download) {
  const chunks = [];
  for await (const c of await download.createReadStream()) chunks.push(c);
  return Buffer.concat(chunks);
}

test("Archive entpacken: TAR.GZ auflisten, einzeln und alles als ZIP laden", async ({ page }) => {
  const errors = await openTool(page, "archiv-entpacken");
  const files = { "projekt/readme.txt": "Hallo Werkbank", "projekt/daten/zahlen.csv": "a;b\n1;2\n", "wurzel.txt": "x".repeat(5000) };
  await page.locator("#drop input").setInputFiles(file("projekt.tar.gz", "application/gzip", makeTarGz(files)));
  await expect(page.locator("#status")).toHaveText("projekt.tar.gz: 3 Dateien.");
  const rows = page.locator("#entries tr");
  await expect(rows.locator("td:first-child")).toHaveText(["projekt/daten/zahlen.csv", "projekt/readme.txt", "wurzel.txt"]);
  await expect(rows.nth(2).locator("td").nth(1)).toHaveText("5 KB");

  const [one] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "projekt/readme.txt herunterladen" }).click()]);
  expect(one.suggestedFilename()).toBe("readme.txt");
  expect((await save(one)).toString("utf8")).toBe("Hallo Werkbank");

  const [all] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Alles als ZIP herunterladen" }).click()]);
  expect(all.suggestedFilename()).toBe("projekt-entpackt.zip");
  const out = unzipSync(new Uint8Array(await save(all)));
  expect(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, strFromU8(v)]))).toEqual(files);
  expect(errors).toEqual([]);
});

test("Archive entpacken: ZIP mit Passwort", async ({ page }) => {
  await openTool(page, "archiv-entpacken");
  await page.locator("#drop input").setInputFiles(file("geheim.zip", "application/zip", makeEncryptedZip({ "akte/geheim.txt": "streng geheim" }, "sesam")));
  await expect(page.locator("#password-form")).toBeVisible();
  await expect(page.locator("#entries td").first()).toHaveText("akte/geheim.txt");

  await page.getByLabel("Passwort des Archivs").fill("falsch");
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page.locator("#error")).toHaveText("Das Passwort ist falsch.");

  await page.getByLabel("Passwort des Archivs").fill("sesam");
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page.locator("#status")).toHaveText("geheim.zip: 1 Datei, entsperrt.");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "akte/geheim.txt herunterladen" }).click()]);
  expect((await save(dl)).toString("utf8")).toBe("streng geheim");
});

test("Archive entpacken: kaputte Datei und falscher Typ werden gemeldet", async ({ page }) => {
  await openTool(page, "archiv-entpacken");
  await page.locator("#drop input").setInputFiles(file("kaputt.zip", "application/zip", Buffer.from("das ist kein zip")));
  await expect(page.locator("#error")).toHaveText(/Keine Dateien gefunden|kein lesbares Archiv/);
  await page.locator("#drop input").setInputFiles(file("bild.png", "image/png", Buffer.from("x")));
  await expect(page.locator("#error")).toContainText("bild.png: Passt nicht");
  // Ein normales ZIP danach geht wieder.
  await page.locator("#drop input").setInputFiles(file("ok.zip", "application/zip", makeZip({ "a.txt": "a" })));
  await expect(page.locator("#status")).toHaveText("ok.zip: 1 Datei.");
});
