import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { file, openTool } from "../helpers.js";

test("Prüfsummen: mehrere Dateien, Werte stimmen mit Node überein, Vergleich", async ({ page }) => {
  const errors = await openTool(page, "pruefsummen");
  await page.getByLabel("BLAKE3").check();
  await page.getByLabel("CRC32").check();
  // 9 MiB, damit mehrere Stücke gestreamt werden.
  const big = Buffer.alloc(9 * 1024 * 1024 + 7).map((_, i) => (i * 7) & 0xff);
  await page.locator("#drop input").setInputFiles([file("abc.txt", "text/plain", "abc"), file("gross.bin", "application/octet-stream", big)]);
  const abc = page.locator(".result-item").filter({ hasText: "abc.txt" });
  const gross = page.locator(".result-item").filter({ hasText: "gross.bin" });
  await expect(abc).toHaveAttribute("data-state", "done");
  await expect(gross).toHaveAttribute("data-state", "done");
  await expect(abc.locator("dd").nth(2).locator(".mono")).toHaveText("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  await expect(abc.locator("dd").nth(4).locator(".mono")).toHaveText("6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85");
  await expect(abc.locator("dd").nth(5).locator(".mono")).toHaveText("352441c2");
  const sha256 = createHash("sha256").update(big).digest("hex");
  await expect(gross.locator("dd").nth(2).locator(".mono")).toHaveText(sha256);
  await expect(gross.locator("dd").nth(0).locator(".mono")).toHaveText(createHash("md5").update(big).digest("hex"));
  await expect(gross.locator("dd").nth(3).locator(".mono")).toHaveText(createHash("sha512").update(big).digest("hex"));

  await page.getByLabel("Erwarteter Wert").fill(`${sha256.toUpperCase()}  gross.bin`);
  await expect(page.locator("#verdict")).toHaveText("✓ Stimmt überein: SHA-256 von gross.bin.");
  await page.getByLabel("Erwarteter Wert").fill(sha256.replace(/^./, "0"));
  await expect(page.locator("#verdict")).toContainText("✗ Keine Übereinstimmung.");
  expect(errors).toEqual([]);
});

test("Prüfsummen: ohne Verfahren gibt es eine Meldung", async ({ page }) => {
  await openTool(page, "pruefsummen");
  for (const name of ["MD5", "SHA-1", "SHA-256", "SHA-512"]) await page.getByLabel(name, { exact: true }).uncheck();
  await page.locator("#drop input").setInputFiles(file("a.txt", "text/plain", "a"));
  await expect(page.locator(".result-item").first()).toHaveAttribute("data-state", "error");
  await expect(page.locator(".result-item").first()).toContainText("Wähle mindestens ein Verfahren.");
});
