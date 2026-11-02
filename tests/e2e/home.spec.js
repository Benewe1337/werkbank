import { expect, test } from "@playwright/test";
import fs from "node:fs";

const toolIds = fs.readdirSync("tools").filter((d) => fs.existsSync(`tools/${d}/tool.json`));

test("Startseite listet alle Werkzeuge mit funktionierenden Links", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Werkbank");
  for (const id of toolIds) await expect(page.locator(`a[href="/tools/${id}/"]`)).toHaveCount(1);
  expect(errors).toEqual([]);
});

for (const id of toolIds) {
  test(`Startup: ${id} lädt ohne Fehler`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(`/tools/${id}/`);
    expect(res.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".topbar .brand")).toHaveAttribute("href", "/");
    const engine = page.locator("#engine");
    if (await engine.count()) await expect(engine).toHaveAttribute("data-state", "ready");
    expect(errors).toEqual([]);
  });
}
