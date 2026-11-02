import { expect, test } from "@playwright/test";
import { decodeAs, encodeAs } from "../../fixtures/bild.js";
import { downloadFirst, file, openTool } from "../helpers.js";

// Das Modell (55 MB) muss geladen und einmal gerechnet werden.
test.setTimeout(300_000);

/** Heller, leicht verrauschter Hintergrund mit einer dunklen, schattierten Kugel in der Mitte. */
function ballOnBackground(width = 320, height = 240) {
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const r = height * 0.32;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const d = Math.hypot(x - cx, y - cy);
      if (d < r) {
        const shade = 1 - Math.hypot(x - cx + r / 3, y - cy + r / 3) / (2 * r);
        data.set([200 * shade, 40 * shade, 30 * shade, 255], i);
      } else {
        const n = ((x * 7 + y * 13) % 9) - 4;
        data.set([232 + n, 236 + n, 240 + n, 255], i);
      }
    }
  }
  return new ImageData(data, width, height);
}

test("Hintergrund entfernen: Ergebnis ist ein PNG mit echtem Alphakanal, alles von der eigenen Seite", async ({ page, context, baseURL }) => {
  const foreign = [];
  context.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith(baseURL) && !url.startsWith("blob:") && !url.startsWith("data:")) foreign.push(url);
  });
  const errors = await openTool(page, "hintergrund-entfernen");
  await page.locator("#drop input").setInputFiles(file("kugel.jpg", "image/jpeg", await encodeAs("jpeg", ballOnBackground(), 92)));
  const job = page.locator(".job").first();
  await expect(job).not.toHaveAttribute("data-state", "working", { timeout: 240_000 });
  await expect(job.locator(".job-status")).toContainText("PNG mit Transparenz"); // zeigt sonst die Fehlermeldung
  await expect(job).toHaveAttribute("data-state", "done");
  await expect(page.locator("#preview-img")).toHaveAttribute("src", /^blob:/);

  const { name, bytes } = await downloadFirst(page);
  expect(name).toBe("kugel-freigestellt.png");
  const img = await decodeAs("png", bytes);
  expect([img.width, img.height]).toEqual([320, 240]);
  const alpha = (x, y) => img.data[(y * img.width + x) * 4 + 3];
  expect(alpha(5, 5)).toBeLessThan(40); // Ecke: Hintergrund weg
  expect(alpha(315, 235)).toBeLessThan(40);
  expect(alpha(160, 120)).toBeGreaterThan(200); // Mitte: Kugel bleibt
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test("Hintergrund entfernen: kaputtes Bild meldet einen Fehler", async ({ page }) => {
  await openTool(page, "hintergrund-entfernen");
  await page.locator("#drop input").setInputFiles(file("kaputt.png", "image/png", Buffer.from("kein bild, nur text")));
  const job = page.locator(".job").first();
  await expect(job).toHaveAttribute("data-state", "error");
  await expect(job.locator(".job-status")).toContainText("Kein unterstütztes Bild");
});
