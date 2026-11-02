import { expect, test } from "@playwright/test";
import { BLOATED_SVG } from "../../fixtures/bild.js";
import { downloadFirst, file, openTool } from "../helpers.js";

test("SVG optimieren: Datei wird kleiner, Vorschau als Bild, Download korrekt", async ({ page }) => {
  const errors = await openTool(page, "svg-optimieren");
  await page.locator("#drop input").setInputFiles(file("logo.svg", "image/svg+xml", BLOATED_SVG));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(job.locator(".job-status")).toContainText("→");
  // Vorschau: <img> mit Blob-URL, die wirklich gerendert wurde
  const after = page.locator("#after");
  await expect(page.locator("#compare")).toBeVisible();
  await expect(after).toHaveAttribute("src", /^blob:/);
  expect(await after.evaluate((img) => img.complete && img.naturalWidth)).toBe(100);
  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("logo-optimiert.svg");
  const text = bytes.toString("utf8");
  expect(bytes.length).toBeLessThan(Buffer.byteLength(BLOATED_SVG) / 2);
  expect(text).toMatch(/^<svg/);
  expect(text).not.toContain("inkscape");
  expect(errors).toEqual([]);
});

test("SVG optimieren: eingefügter Code und Kopieren", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openTool(page, "svg-optimieren");
  await page.getByText("Oder SVG-Code einfügen").click();
  await page.locator("#code").fill(BLOATED_SVG);
  await page.locator("#run-code").click();
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done");
  await job.getByRole("button", { name: "Code kopieren" }).click();
  await expect(job.getByRole("button", { name: "Kopiert" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^<svg[^]*<\/svg>$/);
});

test("SVG optimieren: kaputtes SVG meldet einen Fehler", async ({ page }) => {
  await openTool(page, "svg-optimieren");
  await page.locator("#drop input").setInputFiles(file("kaputt.svg", "image/svg+xml", "<svg><g></svg"));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job.locator(".job-status")).toContainText("SVG ließ sich nicht lesen");
});
