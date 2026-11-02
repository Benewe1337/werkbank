// Formate und Eingabeprüfung für Barcodes. Ohne DOM, damit testbar.

/** Formate, die der zxing-wasm-Writer (zint) erzeugen kann; id = zxing-Formatname. */
export const FORMATS = [
  { id: "EAN13", label: "EAN-13", linear: true, example: "400638133393" },
  { id: "EAN8", label: "EAN-8", linear: true, example: "9638507" },
  { id: "UPCA", label: "UPC-A", linear: true, example: "03600029145" },
  { id: "Code128", label: "Code 128", linear: true, example: "Werkbank-2024" },
  { id: "Code39", label: "Code 39", linear: true, example: "WERKBANK-42" },
  { id: "ITF", label: "ITF (2 aus 5 verschachtelt)", linear: true, example: "12345678" },
  { id: "DataMatrix", label: "DataMatrix", linear: false, example: "Werkbank: Datei-Werkzeuge" },
  { id: "PDF417", label: "PDF417", linear: false, example: "Werkbank: Datei-Werkzeuge" },
  { id: "Aztec", label: "Aztec", linear: false, example: "Werkbank: Datei-Werkzeuge" },
];

/** GTIN-Prüfziffer (EAN-8, EAN-13, UPC-A): von rechts abwechselnd ×3 und ×1. */
export function gtinCheckDigit(digits) {
  if (!/^\d+$/.test(digits)) throw new Error("Nur Ziffern erlaubt.");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[digits.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return String((10 - (sum % 10)) % 10);
}

const GTIN_LENGTH = { EAN13: 13, EAN8: 8, UPCA: 12 };
const CODE39 = /^[0-9A-Z \-.$/+%]+$/;

/**
 * Prüft und normalisiert die Eingabe.
 * @returns {{value: string, note: string | null}} value = was codiert wird
 */
export function validate(format, input) {
  const text = String(input ?? "");
  if (!text.trim()) throw new Error("Gib den Inhalt des Barcodes ein.");

  if (format in GTIN_LENGTH) {
    const length = GTIN_LENGTH[format];
    const digits = text.replace(/[\s-]/g, "");
    const name = FORMATS.find((f) => f.id === format).label;
    if (!/^\d+$/.test(digits)) throw new Error(`${name} besteht nur aus Ziffern.`);
    if (digits.length === length - 1) {
      const check = gtinCheckDigit(digits);
      return { value: digits + check, note: `Prüfziffer ${check} ergänzt.` };
    }
    if (digits.length !== length) {
      throw new Error(`${name} braucht ${length - 1} Ziffern (ohne Prüfziffer) oder ${length} (mit Prüfziffer), nicht ${digits.length}.`);
    }
    const expected = gtinCheckDigit(digits.slice(0, -1));
    if (digits.at(-1) !== expected) {
      throw new Error(`Prüfziffer falsch: Am Ende muss ${expected} stehen, nicht ${digits.at(-1)}.`);
    }
    return { value: digits, note: "Prüfziffer stimmt." };
  }

  if (format === "Code39") {
    const upper = text.toUpperCase();
    if (!CODE39.test(upper)) throw new Error("Code 39 kennt nur A–Z, 0–9, Leerzeichen und - . $ / + %.");
    return { value: upper, note: upper !== text ? "In Großbuchstaben umgewandelt (Code 39 kennt keine Kleinbuchstaben)." : null };
  }

  if (format === "ITF") {
    const digits = text.replace(/\s/g, "");
    if (!/^\d+$/.test(digits)) throw new Error("ITF besteht nur aus Ziffern.");
    if (digits.length % 2 === 1) return { value: `0${digits}`, note: "ITF braucht eine gerade Ziffernzahl: führende 0 ergänzt." };
    return { value: digits, note: null };
  }

  if (format === "Code128") {
    // zint codiert Code 128 in ISO 8859-1; alles darüber hinaus geht nicht.
    const bad = [...text].find((c) => c.codePointAt(0) > 255 || c.codePointAt(0) < 32);
    if (bad) throw new Error(`Code 128 kann „${bad}“ nicht darstellen. Erlaubt sind Buchstaben, Ziffern und westeuropäische Sonderzeichen.`);
    return { value: text, note: null };
  }

  if (!FORMATS.some((f) => f.id === format)) throw new Error(`Unbekanntes Format: ${format}`);
  return { value: text, note: null };
}

/** zint-Fehlermeldungen in verständliches Deutsch. */
export function explainWriterError(message) {
  if (/too long|too large|data too|input too/i.test(message)) return "Zu viel Inhalt für dieses Format.";
  if (/invalid character/i.test(message)) return "Die Eingabe enthält Zeichen, die dieses Format nicht kennt.";
  if (/check digit/i.test(message)) return "Die Prüfziffer stimmt nicht.";
  return `Der Barcode ließ sich nicht erzeugen (${message.replace(/^Error \d+:\s*/, "")}).`;
}
