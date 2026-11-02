import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeBarcode } from "zxing-wasm/full";
import { buildWifi } from "../../../tools/_codes/payloads.js";
import { makeCodePng } from "../../fixtures/daten.js";
import { file, openTool } from "../helpers.js";

const CAMERA_TEXT = "https://example.org/kamera";

/** Y4M-Video (640×480, 2 Bilder) mit einem QR-Code: Chromium spielt es als Fake-Kamera ab. */
async function makeCameraVideo() {
  const { symbol, error } = await writeBarcode(CAMERA_TEXT, { format: "QRCode", scale: 1 });
  if (error) throw new Error(error);
  const [w, h, scale] = [640, 480, 10];
  const y = new Uint8Array(w * h).fill(235);
  const ox = Math.floor((w - symbol.width * scale) / 2);
  const oy = Math.floor((h - symbol.height * scale) / 2);
  for (let r = 0; r < symbol.height; r++) {
    for (let c = 0; c < symbol.width; c++) {
      if (symbol.data[r * symbol.width + c] > 127) continue;
      for (let dy = 0; dy < scale; dy++) y.fill(16, (oy + r * scale + dy) * w + ox + c * scale, (oy + r * scale + dy) * w + ox + (c + 1) * scale);
    }
  }
  const chroma = new Uint8Array((w / 2) * (h / 2) * 2).fill(128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma]);
  const file = path.join(os.tmpdir(), `werkbank-qr-kamera-${process.pid}.y4m`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${w} H${h} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]));
  return file;
}
const video = await makeCameraVideo();

test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`] },
});

test("QR-Scanner: Bild hochladen, Link und WLAN werden erkannt", async ({ page }) => {
  const errors = await openTool(page, "qr-scanner");
  const wifi = buildWifi({ ssid: "Werkbank;Gast", password: 'p:w"1', security: "WPA" });
  await page.locator("#drop input").setInputFiles([
    file("link.png", "image/png", await makeCodePng("https://example.org/a?b=1")),
    file("wlan.png", "image/png", await makeCodePng(wifi)),
    file("ean.png", "image/png", await makeCodePng("4006381333931", "EAN13", 3)),
  ]);
  const items = page.locator(".result-item");
  await expect(items).toHaveCount(3);
  await expect(items.filter({ hasText: "EAN-13" }).locator("pre")).toHaveText("4006381333931");
  const link = items.filter({ hasText: "Link" }).getByRole("link");
  await expect(link).toHaveAttribute("href", "https://example.org/a?b=1");
  await expect(link).toHaveAttribute("rel", /noopener/);
  const wlan = items.filter({ hasText: "WLAN-Zugang" });
  await expect(wlan.locator("dd").nth(0)).toHaveText("Werkbank;Gast");
  await expect(wlan.locator("dd").nth(1)).toHaveText('p:w"1');
  await expect(wlan.locator("pre")).toHaveText(wifi);
  expect(errors).toEqual([]);
});

test("QR-Scanner: Bild ohne Code und Nicht-Bild werden gemeldet", async ({ page }) => {
  await openTool(page, "qr-scanner");
  const blank = await page.evaluate(async () => {
    const c = new OffscreenCanvas(200, 200);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 200, 200);
    return [...new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer())];
  });
  await page.locator("#drop input").setInputFiles(file("leer.png", "image/png", Buffer.from(blank)));
  await expect(page.locator("#status")).toContainText("leer.png: Kein Code gefunden");
  await page.locator("#drop input").setInputFiles(file("notiz.txt", "text/plain", "hallo"));
  await expect(page.locator("#status")).toHaveText("notiz.txt: Das ist kein Bild.");
  await expect(page.locator(".result-item")).toHaveCount(0);
});

test("QR-Scanner: Kamera (Fake-Gerät) liest den Code und stoppt sauber", async ({ page }) => {
  await openTool(page, "qr-scanner");
  await page.getByRole("button", { name: "Kamera starten" }).click();
  await expect(page.locator(".result-item").first()).toContainText(CAMERA_TEXT);
  await page.getByRole("button", { name: "Kamera beenden" }).click();
  await expect(page.locator("#camera")).toBeHidden();
  expect(await page.locator("#video").evaluate((v) => v.srcObject)).toBeNull();
});
