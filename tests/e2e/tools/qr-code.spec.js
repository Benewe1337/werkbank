import { expect, test } from "@playwright/test";
import { parseWifi } from "../../../tools/_codes/payloads.js";
import { makeCodePng, readCodes } from "../../fixtures/daten.js";
import { file, openTool } from "../helpers.js";

/** Klickt einen Download-Button und liefert den Inhalt. */
async function download(page, name) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  return { name: dl.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

/** SVG in einer leeren Seite (ohne CSP) auf ein Canvas zeichnen und als PNG zurückgeben. */
async function svgToPng(browser, svg, size = 800) {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(
    async ({ svg, size }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d").drawImage(img, 0, 0, size, size);
      return canvas.toDataURL("image/png");
    },
    { svg, size },
  );
  await page.close();
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

test("QR-Code: Link mit runden Modulen als PNG und SVG, zurückgelesen", async ({ page, browser }) => {
  const errors = await openTool(page, "qr-code");
  const text = "https://example.org/werkbank?q=Grüße&x=1";
  await page.getByLabel("Text oder Link").fill(text);
  await page.getByLabel("Module").selectOption("dots");
  await page.getByLabel("Eckmarker").selectOption("circle");
  await page.getByLabel("Fehlerkorrektur").selectOption("Q");
  await expect(page.locator("#info")).toContainText("Fehlerkorrektur Q");
  await page.getByLabel("PNG-Größe").selectOption("512");

  const png = await download(page, "PNG herunterladen");
  expect(png.name).toBe("qr-code.png");
  expect((await readCodes(png.bytes, ["QRCode"])).map((r) => r.text)).toEqual([text]);

  const svg = await download(page, "SVG herunterladen");
  expect(svg.name).toBe("qr-code.svg");
  const svgText = svg.bytes.toString("utf8");
  expect(svgText).toMatch(/^<\?xml/);
  expect(svgText).not.toContain("<script");
  expect((await readCodes(await svgToPng(browser, svgText), ["QRCode"])).map((r) => r.text)).toEqual([text]);
  expect(errors).toEqual([]);
});

test("QR-Code: WLAN mit Logo bleibt lesbar, Fehlerkorrektur wird H", async ({ page, browser }) => {
  const errors = await openTool(page, "qr-code");
  await page.getByRole("radio", { name: "WLAN" }).check();
  await page.getByLabel("Netzwerkname (SSID)").fill('Büro;5G "oben"');
  await page.getByLabel("Passwort", { exact: true }).fill("ge:heim\\123");
  await page.getByLabel("Module").selectOption("rounded");
  await page.getByLabel("Vordergrund").fill("#1d3557");
  // Logo: irgendein Bild, hier ein DataMatrix-PNG.
  const logo = await makeCodePng("Logo", "DataMatrix", 8);
  await page.getByLabel("Logo in der Mitte (optional)").setInputFiles(file("logo.png", "image/png", logo));
  await expect(page.getByLabel("Fehlerkorrektur")).toBeDisabled();
  await expect(page.locator("#info")).toContainText("Fehlerkorrektur H");
  await expect(page.locator("#preview svg image")).toHaveCount(1);
  await page.getByLabel("Logogröße").fill("16");

  const png = await download(page, "PNG herunterladen");
  const read = await readCodes(png.bytes, ["QRCode"]);
  expect(parseWifi(read[0].text)).toEqual({ ssid: 'Büro;5G "oben"', password: "ge:heim\\123", security: "WPA", hidden: false });

  const svg = await download(page, "SVG herunterladen");
  const fromSvg = await readCodes(await svgToPng(browser, svg.bytes.toString("utf8")), ["QRCode"]);
  expect(fromSvg[0].text).toBe(read[0].text);
  expect(errors).toEqual([]);
});

test("QR-Code: ungültige E-Mail und schwacher Kontrast werden gemeldet", async ({ page }) => {
  await openTool(page, "qr-code");
  await page.getByRole("radio", { name: "E-Mail" }).check();
  await page.getByLabel("An", { exact: true }).fill("keine-adresse");
  await expect(page.locator("#error")).toHaveText("Das ist keine gültige E-Mail-Adresse.");
  await expect(page.getByRole("button", { name: "PNG herunterladen" })).toBeDisabled();
  await page.getByLabel("An", { exact: true }).fill("post@example.org");
  await expect(page.locator("#error")).toBeHidden();
  await page.getByLabel("Vordergrund").fill("#cccccc");
  await expect(page.locator("#warning")).toContainText("Zu wenig Kontrast");
});
