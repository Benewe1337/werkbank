// Ergebnis eines Scans einordnen (Link, WLAN, Kontakt, …). Ohne DOM, damit testbar.
import { asHttpUrl, parseWifi } from "../_codes/payloads.js";

const SECURITY_LABEL = { WPA: "WPA/WPA2/WPA3", WEP: "WEP", nopass: "offen (kein Passwort)", SAE: "WPA3" };

/** Lesbare Bezeichnung eines zxing-Formats. */
export function formatLabel(format) {
  const map = { QRCode: "QR-Code", MicroQRCode: "Micro-QR-Code", RMQRCode: "rMQR-Code", EAN13: "EAN-13", EAN8: "EAN-8", UPCA: "UPC-A", UPCE: "UPC-E", Code128: "Code 128", Code39: "Code 39", Code93: "Code 93", ITF: "ITF", DataMatrix: "DataMatrix", PDF417: "PDF417", Aztec: "Aztec", Codabar: "Codabar" };
  return map[format] ?? format;
}

/**
 * @param {string} text
 * @returns {{kind: "url", url: string} | {kind: "wifi", rows: [string, string][]} | {kind: "email"|"tel"|"vcard"|"text"}}
 */
export function describe(text) {
  const url = asHttpUrl(text);
  if (url) return { kind: "url", url };
  const wifi = parseWifi(text);
  if (wifi) {
    return {
      kind: "wifi",
      rows: [
        ["Netzwerk", wifi.ssid],
        ["Passwort", wifi.password || "–"],
        ["Verschlüsselung", SECURITY_LABEL[wifi.security] ?? wifi.security],
        ["Verstecktes Netz", wifi.hidden ? "ja" : "nein"],
      ],
    };
  }
  if (/^BEGIN:VCARD/i.test(text)) return { kind: "vcard" };
  if (/^mailto:/i.test(text)) return { kind: "email" };
  if (/^tel:/i.test(text)) return { kind: "tel" };
  return { kind: "text" };
}

export const KIND_LABEL = { url: "Link", wifi: "WLAN-Zugang", vcard: "Kontakt (vCard)", email: "E-Mail", tel: "Telefonnummer", text: "Text" };

/** Fehler von getUserMedia in verständliches Deutsch. */
export function explainCameraError(error) {
  const name = error?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Der Kamerazugriff wurde verweigert. Erlaube ihn in den Browser-Einstellungen oder lade ein Bild hoch.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Keine Kamera gefunden. Lade stattdessen ein Bild hoch.";
  if (name === "NotReadableError" || name === "AbortError") return "Die Kamera ist gerade belegt (z. B. von einer anderen App).";
  if (name === "TypeError" || !navigator?.mediaDevices) return "Dieser Browser erlaubt hier keinen Kamerazugriff (nur über HTTPS möglich).";
  return `Die Kamera ließ sich nicht starten (${error?.message || name || "unbekannter Fehler"}).`;
}
