import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { SAMPLE_MARKDOWN, docxText } from "../../fixtures/text.js";
import { downloadFirst, file, openTool } from "../helpers.js";

// Pandoc ist ~59 MB; der erste Lauf braucht etwas länger.
test.setTimeout(240_000);

test("Dokumente umwandeln: Markdown → DOCX und HTML", async ({ page }) => {
  const errors = await openTool(page, "dokument-umwandeln");
  await expect(page.locator("#engine")).toHaveCount(0); // erst bei Bedarf laden

  await page.locator("#drop input").setInputFiles(file("bericht.md", "text/markdown", SAMPLE_MARKDOWN));
  await expect(page.locator("#engine")).toHaveAttribute("data-state", "ready", { timeout: 180_000 });
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "done", { timeout: 120_000 });
  await expect(job.locator(".job-status")).toContainText("Markdown → Word (DOCX)");
  const docx = await downloadFirst(page);
  expect(docx.name).toBe("bericht.docx");
  const text = docxText(unzipSync, docx.bytes);
  expect(text).toContain("Werkbank Bericht");
  expect(text).toContain("Grüße aus Köln");

  await page.getByLabel("Ausgabe").selectOption("html");
  await page.locator("#drop input").setInputFiles(file("bericht.md", "text/markdown", SAMPLE_MARKDOWN));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "done");
  const html = await downloadFirst(page);
  expect(html.name).toBe("bericht.html");
  expect(html.bytes.toString("utf8")).toContain("<strong>fett</strong>");
  expect(errors).toEqual([]);
});

test("Dokumente umwandeln: kaputte DOCX zeigt Fehler, unbekanntes Format wird abgelehnt", async ({ page }) => {
  await openTool(page, "dokument-umwandeln");
  await page.locator("#drop input").setInputFiles(file("bild.png", "image/png", "x"));
  await expect(page.locator(".job").first()).toHaveAttribute("data-state", "error");
  await expect(page.locator(".job").first()).toContainText("Format wird nicht erkannt");

  await page.locator("#drop input").setInputFiles(file("kaputt.docx", "application/octet-stream", "kein zip"));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error", { timeout: 180_000 });
  await expect(job.locator(".job-status")).toContainText("Umwandlung fehlgeschlagen");
});
