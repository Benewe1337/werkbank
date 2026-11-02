// Gegen eine Live-Bereitstellung (BASE_URL) einmal anmelden und die Sitzung für alle Tests speichern.
import { chromium } from "@playwright/test";

export const STORAGE = "test-results/.auth/state.json";

export default async function globalSetup() {
  const base = process.env.BASE_URL;
  if (!base) return;
  const password = process.env.WERKBANK_PASSWORD;
  if (!password) throw new Error("WERKBANK_PASSWORD fehlt (nötig für Tests gegen BASE_URL).");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}/login/`);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Öffnen" }).click();
  await page.waitForURL(`${base}/`);
  await page.context().storageState({ path: STORAGE });
  await browser.close();
}
