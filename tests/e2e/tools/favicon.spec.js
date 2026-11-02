import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { decodeAs, encodeAs, makePixels } from "../../fixtures/bild.js";
import { file, openTool } from "../helpers.js";

const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><rect width="64" height="32" rx="6" fill="#b2432b"/></svg>';

async function download(page, locator) {
  const [d] = await Promise.all([page.waitForEvent("download"), locator.click()]);
  const chunks = [];
  for await (const c of await d.createReadStream()) chunks.push(c);
  return { name: d.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

function readIco(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    reserved: v.getUint16(0, true),
    type: v.getUint16(2, true),
    images: Array.from({ length: v.getUint16(4, true) }, (_, i) => {
      const e = 6 + i * 16;
      return { size: bytes[e], bpp: v.getUint16(e + 6, true), length: v.getUint32(e + 8, true), offset: v.getUint32(e + 12, true) };
    }),
  };
}

test("Favicon: aus SVG entstehen ICO, PNGs, Manifest und ZIP", async ({ page }) => {
  const errors = await openTool(page, "favicon");
  await page.locator("#name").fill("Testseite");
  await page.locator("#drop input").setInputFiles(file("logo.svg", "image/svg+xml", LOGO_SVG));
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#snippet")).toContainText('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');

  const zip = await download(page, page.locator("#zip"));
  expect(zip.name).toBe("favicon.zip");
  const files = unzipSync(new Uint8Array(zip.bytes));
  expect(Object.keys(files).sort()).toEqual(["apple-touch-icon.png", "favicon.ico", "favicon.svg", "icon-192.png", "icon-512.png", "site.webmanifest"]);

  const ico = readIco(Buffer.from(files["favicon.ico"]));
  expect([ico.reserved, ico.type]).toEqual([0, 1]);
  expect(ico.images.map((i) => [i.size, i.bpp])).toEqual([[16, 32], [32, 32], [48, 32]]);
  for (const img of ico.images) {
    const png = await decodeAs("png", files["favicon.ico"].subarray(img.offset, img.offset + img.length));
    expect(png.width).toBe(img.size);
  }
  const big = await decodeAs("png", files["icon-512.png"]);
  expect(big.width).toBe(512);
  const mid = (256 * 512 + 256) * 4;
  expect(Math.abs(big.data[mid] - 178)).toBeLessThanOrEqual(2); // Siegelrot in der Mitte (Rundung beim Skalieren)
  expect(big.data[mid + 3]).toBe(255);
  expect(big.data[3]).toBe(0); // oben links durchsichtig (Querformat)
  expect(JSON.parse(new TextDecoder().decode(files["site.webmanifest"])).name).toBe("Testseite");

  const single = await download(page, page.getByRole("link", { name: /^apple-touch-icon\.png/ }));
  expect(single.name).toBe("apple-touch-icon.png");
  expect((await decodeAs("png", single.bytes)).width).toBe(180);
  expect(errors).toEqual([]);
});

test("Favicon: PNG mit Hintergrund und Abstand", async ({ page }) => {
  await openTool(page, "favicon");
  await page.locator("#fill").check();
  await page.locator("#color").fill("#00ff00");
  await page.locator("#padding").fill("20");
  await page.locator("#drop input").setInputFiles(file("logo.png", "image/png", await encodeAs("png", makePixels(100, 100, "half"))));
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#snippet")).not.toContainText("favicon.svg");
  const icon = await download(page, page.getByRole("link", { name: /^icon-192\.png/ }));
  const img = await decodeAs("png", icon.bytes);
  const corner = [...img.data.subarray(0, 4)];
  expect(corner[0]).toBeLessThanOrEqual(2);
  expect(corner[1]).toBeGreaterThanOrEqual(253);
  expect(corner[3]).toBe(255);
});

test("Favicon: kaputtes Bild meldet Fehler", async ({ page }) => {
  await openTool(page, "favicon");
  await page.locator("#drop input").setInputFiles(file("logo.png", "image/png", Buffer.from("kein png, nur text hier")));
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#error")).toContainText("Kein unterstütztes Bild");
  await expect(page.locator("#result")).toBeHidden();
});
