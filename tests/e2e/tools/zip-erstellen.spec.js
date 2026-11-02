import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { file, openTool } from "../helpers.js";

async function save(download) {
  const chunks = [];
  for await (const c of await download.createReadStream()) chunks.push(c);
  return Buffer.concat(chunks);
}

test("ZIP erstellen: Dateien und Ordner packen, Pfade bleiben erhalten", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "werkbank-zip-"));
  const folder = path.join(dir, "fotos");
  fs.mkdirSync(path.join(folder, "urlaub"), { recursive: true });
  fs.writeFileSync(path.join(folder, "liste.txt"), "eins\nzwei");
  fs.writeFileSync(path.join(folder, "urlaub", "notiz.md"), "# Notiz");
  try {
    const errors = await openTool(page, "zip-erstellen");
    await page.locator("#drop input").setInputFiles([file("brief.txt", "text/plain", "Lieber Leser ".repeat(500)), file("brief.txt", "text/plain", "zweiter")]);
    await page.locator("#folder").setInputFiles(folder);
    await expect(page.locator("#queue .queue-item")).toHaveCount(4);
    await expect(page.locator("#queue")).toContainText("brief (2).txt");
    await expect(page.locator("#queue")).toContainText("fotos/urlaub/notiz.md");
    await page.getByLabel("Dateiname").fill("Mein Paket");
    await page.locator("#level").fill("9");
    await expect(page.locator("#level-out")).toHaveText("9");
    await page.getByRole("button", { name: "4 Dateien packen" }).click();
    const job = page.locator(".job").first();
    await expect(job).toHaveAttribute("data-state", "done");
    const [dl] = await Promise.all([page.waitForEvent("download"), job.locator(".job-download").click()]);
    expect(dl.suggestedFilename()).toBe("Mein Paket.zip");
    const out = unzipSync(new Uint8Array(await save(dl)));
    expect(Object.keys(out).sort()).toEqual(["brief (2).txt", "brief.txt", "fotos/liste.txt", "fotos/urlaub/notiz.md"]);
    expect(strFromU8(out["fotos/urlaub/notiz.md"])).toBe("# Notiz");
    expect(strFromU8(out["brief (2).txt"])).toBe("zweiter");
    expect(errors).toEqual([]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ZIP erstellen: ohne Dateien geht nichts, Entfernen funktioniert", async ({ page }) => {
  await openTool(page, "zip-erstellen");
  await expect(page.locator("#run")).toBeDisabled();
  await expect(page.locator("#run")).toHaveText("Dateien auswählen");
  await page.locator("#drop input").setInputFiles(file("a.txt", "text/plain", "a"));
  await page.getByRole("button", { name: "a.txt entfernen" }).click();
  await expect(page.locator("#queue .queue-item")).toHaveCount(0);
  await expect(page.locator("#run")).toBeDisabled();
});
