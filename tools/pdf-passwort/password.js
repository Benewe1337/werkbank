// PDF mit Passwort schützen (AES-256) oder den Schutz mit bekanntem Passwort entfernen.
import { savePdf } from "../_pdf/pdf.js";

/**
 * MuPDF liest Speicher-Optionen als „schlüssel=wert,…“. Ein Komma würde das Passwort abschneiden,
 * deshalb lehnen wir es ab, statt stillschweigend ein anderes Passwort zu setzen.
 */
export function checkPassword(password, label = "Passwort") {
  if (!password) throw new Error(`Bitte ein ${label} eingeben.`);
  if (password.includes(",")) throw new Error(`Das ${label} darf kein Komma enthalten.`);
  if (/[\u0000-\u001f]/.test(password)) throw new Error(`Das ${label} enthält ungültige Zeichen.`);
  return password;
}

/** Optionen-String für saveToBuffer beim Verschlüsseln. */
export function encryptOptions(userPassword, ownerPassword = "") {
  checkPassword(userPassword, "Passwort");
  const parts = ["encrypt=aes-256", `user-password=${userPassword}`];
  // Ohne eigenes Besitzer-Passwort gilt das Benutzer-Passwort auch für Besitzer-Rechte.
  parts.push(`owner-password=${ownerPassword ? checkPassword(ownerPassword, "Besitzer-Passwort") : userPassword}`);
  parts.push("garbage=compact", "compress");
  return parts.join(",");
}

function open(mupdf, input) {
  let doc;
  try {
    doc = mupdf.Document.openDocument(input, "application/pdf").asPDF();
  } catch {
    doc = null;
  }
  if (!doc) throw new Error("Die Datei ist keine lesbare PDF.");
  return doc;
}

/** Ist die PDF verschlüsselt, braucht sie zum Öffnen ein Passwort? */
export function inspect(mupdf, input) {
  const doc = open(mupdf, input);
  const encryption = doc.getMetaData("encryption") ?? "None";
  return { encrypted: encryption !== "None", needsPassword: doc.needsPassword(), encryption };
}

/**
 * @param {typeof import("mupdf")} mupdf
 * @param {Uint8Array} input
 * @param {string} userPassword
 * @param {string} [ownerPassword]
 */
export function protectPdf(mupdf, input, userPassword, ownerPassword = "") {
  const options = encryptOptions(userPassword, ownerPassword);
  const doc = open(mupdf, input);
  if (doc.needsPassword()) throw new Error("Die PDF ist schon geschützt. Entferne zuerst den alten Schutz.");
  return { bytes: savePdf(doc, options), pages: doc.countPages() };
}

/**
 * Entfernt die Verschlüsselung. Braucht das Benutzer- oder Besitzer-Passwort, wenn die PDF eins verlangt.
 * PDFs, die nur Rechte einschränken (ohne Öffnen-Passwort), lassen sich auch ohne Passwort entsperren.
 */
export function unlockPdf(mupdf, input, password = "") {
  const doc = open(mupdf, input);
  const encryption = doc.getMetaData("encryption") ?? "None";
  if (encryption === "None") throw new Error("Diese PDF ist nicht verschlüsselt.");
  if (doc.needsPassword()) {
    if (!password) throw new Error("Diese PDF braucht ein Passwort zum Öffnen.");
    if (!doc.authenticatePassword(password)) throw new Error("Das Passwort stimmt nicht.");
  }
  return { bytes: savePdf(doc, "encrypt=none,garbage=compact,compress"), pages: doc.countPages() };
}
