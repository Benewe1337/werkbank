import { describe as group, expect, it } from "vitest";
import { buildWifi } from "../../../tools/_codes/payloads.js";
import { describe, explainCameraError, formatLabel } from "../../../tools/qr-scanner/describe.js";
import { makeCodePng, readCodes } from "../../fixtures/daten.js";

group("qr-scanner", () => {
  it("erkennt nur http(s) als Link", () => {
    expect(describe("https://example.org/x")).toEqual({ kind: "url", url: "https://example.org/x" });
    expect(describe("javascript:alert(1)").kind).toBe("text");
    expect(describe("http://exa mple.org").kind).toBe("text");
  });
  it("schlüsselt WLAN-Codes auf", () => {
    const info = describe(buildWifi({ ssid: "Netz;1", password: "a:b", security: "WPA", hidden: true }));
    expect(info).toEqual({
      kind: "wifi",
      rows: [
        ["Netzwerk", "Netz;1"],
        ["Passwort", "a:b"],
        ["Verschlüsselung", "WPA/WPA2/WPA3"],
        ["Verstecktes Netz", "ja"],
      ],
    });
  });
  it("ordnet weitere Inhalte ein", () => {
    expect(describe("BEGIN:VCARD\r\nVERSION:3.0").kind).toBe("vcard");
    expect(describe("mailto:a@b.de").kind).toBe("email");
    expect(describe("tel:+4940").kind).toBe("tel");
    expect(formatLabel("EAN13")).toBe("EAN-13");
  });
  it("erklärt Kamera-Fehler", () => {
    expect(explainCameraError({ name: "NotAllowedError" })).toMatch(/verweigert/);
    expect(explainCameraError({ name: "NotFoundError" })).toMatch(/Keine Kamera/);
    expect(explainCameraError({ name: "NotReadableError" })).toMatch(/belegt/);
  });
  it("liest erzeugte Codes zurück (zxing-Reader)", async () => {
    const results = await readCodes(await makeCodePng("Werkbank ✓"));
    expect(results).toEqual([{ format: "QRCode", text: "Werkbank ✓" }]);
  });
});
