import { defineConfig, devices } from "@playwright/test";

// PORT erlaubt parallele Läufe; E2E_DEV=1 testet gegen den Vite-Dev-Server statt gegen den Build.
const port = Number(process.env.PORT ?? 4173);
const dev = process.env.E2E_DEV === "1";
// BASE_URL=https://… testet gegen eine echte Bereitstellung, ohne lokalen Server.
const remote = process.env.BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 60_000 },
  fullyParallel: true,
  use: { baseURL: remote ?? `http://localhost:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: remote ? undefined : {
    command: dev
      ? `node scripts/fetch-assets.mjs && npx vite --port ${port} --strictPort`
      : process.env.PORT
        ? `node scripts/fetch-assets.mjs && OUT_DIR=dist-${port} npx vite build && OUT_DIR=dist-${port} npx vite preview --port ${port} --strictPort`
        : `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
