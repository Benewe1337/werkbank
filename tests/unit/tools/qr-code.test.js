import { describe, expect, it } from "vitest";
import {
  buildMailto,
  buildPayload,
  buildTel,
  buildVCard,
  buildWifi,
  contrastRatio,
  contrastWarning,
  escapeVCard,
  escapeWifi,
  parseWifi,
} from "../../../tools/_codes/payloads.js";
import { buildQr, containsPoint, logoBox, MAX_LOGO_AREA, rasterize } from "../../../tools/qr-code/render.js";
import { readCodes } from "../../fixtures/daten.js";

describe("qr-code: Inhalte", () => {
  it("schützt Sonderzeichen im WIFI-Format", () => {
    expect(escapeWifi('a;b,c:d\\e"f')).toBe('a\\;b\\,c\\:d\\\\e\\"f');
    expect(buildWifi({ ssid: "Café;Netz", password: 'p:w"1', security: "WPA" })).toBe('WIFI:T:WPA;S:Café\\;Netz;P:p\\:w\\"1;;');
    expect(buildWifi({ ssid: "Gast", security: "nopass", hidden: true })).toBe("WIFI:T:nopass;S:Gast;H:true;;");
  });
  it("liest WIFI-Codes wieder ein (Rundweg)", () => {
    const wifi = { ssid: 'Mein;Netz,"x"', password: "a\\b:c;d", security: "WPA", hidden: true };
    expect(parseWifi(buildWifi(wifi))).toEqual(wifi);
    expect(parseWifi("WIFI:S:Offen;;")).toEqual({ ssid: "Offen", password: "", security: "nopass", hidden: false });
    expect(parseWifi("https://example.org")).toBeNull();
  });
  it("verlangt SSID und Passwort", () => {
    expect(() => buildWifi({ ssid: "" })).toThrow(/SSID/);
    expect(() => buildWifi({ ssid: "x", security: "WPA" })).toThrow(/Passwort/);
  });
  it("baut eine vCard 3.0 mit Escaping und CRLF", () => {
    expect(escapeVCard("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const card = buildVCard({ firstName: "Erika", lastName: "Muster;mann", org: "Firma, GmbH", phone: "+49 40 123", email: "e@x.de" });
    expect(card.split("\r\n")).toEqual([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Muster\\;mann;Erika;;;",
      "FN:Erika Muster\\;mann",
      "ORG:Firma\\, GmbH",
      "TEL;TYPE=CELL:+49 40 123",
      "EMAIL;TYPE=INTERNET:e@x.de",
      "END:VCARD",
    ]);
    expect(() => buildVCard({})).toThrow(/Namen/);
  });
  it("baut mailto- und tel-Links", () => {
    expect(buildMailto({ to: "a@b.de", subject: "Hallo & tschüss", body: "Zeile 1\nZeile 2" })).toBe(
      "mailto:a@b.de?subject=Hallo%20%26%20tsch%C3%BCss&body=Zeile%201%0AZeile%202",
    );
    expect(() => buildMailto({ to: "kein-at" })).toThrow(/gültige/);
    expect(buildTel("+49 (40) 123-45/6")).toBe("tel:+4940123456");
    expect(() => buildTel("abc")).toThrow(/Ziffern/);
    expect(buildPayload("text", { text: "x" })).toBe("x");
  });
  it("prüft Kontraste", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastWarning("#000000", "#ffffff")).toBeNull();
    expect(contrastWarning("#999999", "#aaaaaa")).toMatch(/Kontrast/);
    expect(contrastWarning("#ffffff", "#000000")).toMatch(/Heller Code/);
  });
});

describe("qr-code: Geometrie", () => {
  it("prüft Punkte in abgerundeten Formen", () => {
    const circle = { x: 0, y: 0, w: 2, h: 2, r: [1, 1, 1, 1] };
    expect(containsPoint(circle, 1, 1)).toBe(true);
    expect(containsPoint(circle, 0.05, 0.05)).toBe(false);
  });
  it("begrenzt das Logo auf höchstens 20 % der Fläche", () => {
    const box = logoBox(33, 0.5);
    expect((box.size * box.size) / (33 * 33)).toBeCloseTo(MAX_LOGO_AREA, 5);
    expect(MAX_LOGO_AREA).toBeLessThanOrEqual(0.2);
  });
  it("erzwingt Fehlerkorrektur H mit Logo", () => {
    expect(buildQr("x", { ecLevel: "L", logoRatio: 0.1 }).ecLevel).toBe("H");
    expect(buildQr("x", { ecLevel: "L" }).ecLevel).toBe("L");
  });
  it("meldet zu viel Inhalt verständlich", () => {
    expect(() => buildQr("x".repeat(5000), { ecLevel: "H" })).toThrow(/Zu viel Inhalt/);
  });

  const variants = [
    { moduleShape: "square", finderShape: "square", ecLevel: "L" },
    { moduleShape: "rounded", finderShape: "rounded", ecLevel: "M" },
    { moduleShape: "dots", finderShape: "circle", ecLevel: "Q" },
    { moduleShape: "rounded", finderShape: "circle", logoRatio: MAX_LOGO_AREA },
    { moduleShape: "dots", finderShape: "rounded", logoRatio: 0.12 },
  ];
  for (const v of variants) {
    it(`lässt sich zurücklesen: ${JSON.stringify(v)}`, async () => {
      const text = "https://example.org/Grüße?a=1&b=zwei";
      const qr = buildQr(text, { margin: 4, ...v });
      const results = await readCodes(rasterize(qr, 6), ["QRCode"]);
      expect(results.map((r) => r.text)).toEqual([text]);
    });
  }
  it("bleibt mit größtem Logo lesbar, auch bei kurzen und langen Inhalten", async () => {
    const texts = ["x", "https://example.org/Grüße?a=1&b=zwei", "WIFI:T:WPA;S:Büro;P:geheimes-passwort-123;;", "a".repeat(120)];
    for (const text of texts) {
      for (const moduleShape of ["square", "rounded", "dots"]) {
        const qr = buildQr(text, { logoRatio: MAX_LOGO_AREA, moduleShape, finderShape: "rounded" });
        const results = await readCodes(rasterize(qr, 5), ["QRCode"]);
        expect(results[0]?.text, `${moduleShape}: ${text}`).toBe(text);
      }
    }
  });
  it("WLAN-Code mit Sonderzeichen übersteht den Rundweg", async () => {
    const wifi = { ssid: "Büro;5G", password: 'x:y"z\\', security: "WPA", hidden: false };
    const results = await readCodes(rasterize(buildQr(buildWifi(wifi), { moduleShape: "rounded" }), 6));
    expect(parseWifi(results[0].text)).toEqual(wifi);
  });
});
