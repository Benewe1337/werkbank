// Inhalte für QR-Codes (WLAN, vCard, E-Mail, Telefon) bauen und wieder lesen. Ohne DOM, damit testbar.

/** Sonderzeichen im WIFI:-Format: \ ; , : " werden mit Backslash geschützt. */
export function escapeWifi(value) {
  return String(value).replace(/([\\;,:"])/g, "\\$1");
}

export const WIFI_SECURITY = ["WPA", "WEP", "nopass"];

/**
 * @param {{ssid: string, password?: string, security?: "WPA"|"WEP"|"nopass", hidden?: boolean}} wifi
 * @returns {string} z. B. WIFI:T:WPA;S:Mein Netz;P:geheim;;
 */
export function buildWifi({ ssid, password = "", security = "WPA", hidden = false }) {
  if (!ssid) throw new Error("Gib den Netzwerknamen (SSID) ein.");
  if (!WIFI_SECURITY.includes(security)) throw new Error(`Unbekannte Verschlüsselung: ${security}`);
  if (security !== "nopass" && !password) throw new Error("Gib das WLAN-Passwort ein oder wähle „Offen“.");
  const parts = [`T:${security}`, `S:${escapeWifi(ssid)}`];
  if (security !== "nopass") parts.push(`P:${escapeWifi(password)}`);
  if (hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

/** Liest einen WIFI:-Code. Liefert null, wenn es keiner ist. */
export function parseWifi(text) {
  if (!/^WIFI:/i.test(text)) return null;
  const fields = {};
  let key = "";
  let value = "";
  let inValue = false;
  const body = text.slice(5);
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\" && i + 1 < body.length) {
      value += body[++i];
    } else if (!inValue && c === ":") {
      inValue = true;
    } else if (!inValue) {
      key += c;
    } else if (c === ";") {
      if (key) fields[key.toUpperCase()] = value;
      key = "";
      value = "";
      inValue = false;
    } else {
      value += c;
    }
  }
  if (key && inValue) fields[key.toUpperCase()] = value;
  if (fields.S === undefined) return null;
  return {
    ssid: fields.S,
    password: fields.P ?? "",
    security: fields.T || "nopass",
    hidden: /^true$/i.test(fields.H ?? ""),
  };
}

/** Wert in einer vCard-3.0-Zeile: \ , ; und Zeilenumbrüche schützen. */
export function escapeVCard(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

/**
 * vCard 3.0 (RFC 2426), Zeilenende CRLF.
 * @param {{firstName?: string, lastName?: string, org?: string, title?: string, phone?: string,
 *          email?: string, url?: string, street?: string, zip?: string, city?: string, country?: string}} c
 */
export function buildVCard(c) {
  const e = (v) => escapeVCard(v ?? "");
  const fn = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.org || "";
  if (!fn) throw new Error("Gib mindestens einen Namen oder eine Firma ein.");
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${e(c.lastName)};${e(c.firstName)};;;`, `FN:${e(fn)}`];
  if (c.org) lines.push(`ORG:${e(c.org)}`);
  if (c.title) lines.push(`TITLE:${e(c.title)}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL:${e(c.phone)}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${e(c.email)}`);
  if (c.url) lines.push(`URL:${e(c.url)}`);
  if (c.street || c.zip || c.city || c.country) {
    lines.push(`ADR;TYPE=WORK:;;${e(c.street)};${e(c.city)};;${e(c.zip)};${e(c.country)}`);
  }
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/** mailto:-Link mit Betreff und Text. */
export function buildMailto({ to, subject = "", body = "" }) {
  const address = String(to ?? "").trim();
  if (!address) throw new Error("Gib eine E-Mail-Adresse ein.");
  if (!/^[^\s@]+@[^\s@]+$/.test(address)) throw new Error("Das ist keine gültige E-Mail-Adresse.");
  const query = [];
  if (subject) query.push(`subject=${encodeURIComponent(subject)}`);
  if (body) query.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${address}${query.length ? `?${query.join("&")}` : ""}`;
}

/** tel:-Link; Leerzeichen, Klammern, Schrägstriche und Bindestriche fallen weg. */
export function buildTel(number) {
  const clean = String(number ?? "").replace(/[\s()/.-]/g, "");
  if (!clean) throw new Error("Gib eine Telefonnummer ein.");
  if (!/^\+?\d{3,}$/.test(clean)) throw new Error("Eine Telefonnummer besteht aus Ziffern und optional einem + am Anfang.");
  return `tel:${clean}`;
}

/** Inhalt eines QR-Codes aus dem gewählten Typ und den Feldern. */
export function buildPayload(type, fields) {
  switch (type) {
    case "text":
      if (!fields.text) throw new Error("Gib einen Text oder Link ein.");
      return fields.text;
    case "wifi":
      return buildWifi(fields);
    case "vcard":
      return buildVCard(fields);
    case "email":
      return buildMailto(fields);
    case "tel":
      return buildTel(fields.phone);
    default:
      throw new Error(`Unbekannter Inhaltstyp: ${type}`);
  }
}

/** Nur http(s)-Adressen gelten als Link (kein javascript:, data: usw.). */
export function asHttpUrl(text) {
  const t = String(text).trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  try {
    return new URL(t).href;
  } catch {
    return null;
  }
}

/** #rrggbb -> relative Leuchtdichte nach WCAG. */
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Ungültige Farbe: ${hex}`);
  const n = Number.parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const MIN_CONTRAST = 4;

/** Warnung für schwer lesbare Farbkombinationen, sonst null. */
export function contrastWarning(fg, bg) {
  const ratio = contrastRatio(fg, bg);
  if (ratio < MIN_CONTRAST) {
    return `Zu wenig Kontrast (${ratio.toFixed(1).replace(".", ",")} : 1). Viele Scanner lesen den Code dann nicht.`;
  }
  if (luminance(fg) > luminance(bg)) return "Heller Code auf dunklem Grund wird nicht von allen Scannern erkannt.";
  return null;
}
