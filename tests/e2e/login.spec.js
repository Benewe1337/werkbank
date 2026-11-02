import { expect, test } from "@playwright/test";

// Der Passwortschutz läuft als Vercel-Middleware, lokal also nicht. Lokal wird nur die Login-Seite geprüft.
const remote = Boolean(process.env.BASE_URL);

test("Login-Seite lädt ohne Fehler", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: undefined })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login/?fehler=1");
  await expect(page.getByLabel("Passwort")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Falsches Passwort.");
  expect(errors).toEqual([]);
});

test.describe("Passwortschutz live", () => {
  test.skip(!remote, "nur gegen eine Vercel-Bereitstellung (BASE_URL)");

  test("ohne Anmeldung kein Zugriff, falsches Passwort abgelehnt, richtiges öffnet das Ziel", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: undefined })).newPage();
    await page.goto("/tools/qr-code/");
    await expect(page).toHaveURL(/\/login\/\?next=%2Ftools%2Fqr-code%2F/);
    for (const path of ["/", "/models/whisper-base/config.json", "/vendor/duckdb/"]) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(303);
    }
    await page.getByLabel("Passwort").fill("falsch");
    await page.getByRole("button", { name: "Öffnen" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByLabel("Passwort").fill(process.env.WERKBANK_PASSWORD);
    await page.getByRole("button", { name: "Öffnen" }).click();
    await expect(page).toHaveURL(/\/tools\/qr-code\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("QR-Code erstellen");
    await page.getByRole("link", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/login\/$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\//);
  });
});
