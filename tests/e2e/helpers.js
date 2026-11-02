import { expect } from "@playwright/test";

/** Öffnet ein Werkzeug, sammelt Seitenfehler und wartet (falls vorhanden) auf die WebAssembly. */
export async function openTool(page, id) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/tools/${id}/`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const engine = page.locator("#engine");
  if (await engine.count()) await expect(engine).toHaveAttribute("data-state", "ready");
  return errors;
}

/** Klickt den ersten Download im neuesten Job und liefert Dateiname + Inhalt. */
export async function downloadFirst(page, scope = page.locator(".job").first()) {
  const [download] = await Promise.all([page.waitForEvent("download"), scope.locator(".job-download").first().click()]);
  const chunks = [];
  for await (const c of await download.createReadStream()) chunks.push(c);
  return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

export const file = (name, mimeType, buffer) => ({ name, mimeType, buffer: Buffer.from(buffer) });
