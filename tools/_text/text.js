// Gemeinsame Hilfen der Text-Werkzeuge (ohne DOM, in Node testbar).

/**
 * Dekodiert Textdateien: UTF-8 (mit oder ohne BOM), UTF-16 mit BOM, sonst Windows-1252
 * (ältere deutsche Textdateien). Wirft bei offensichtlichen Binärdateien.
 * @param {ArrayBuffer|Uint8Array} input
 */
export function decodeText(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes.subarray(0, 8000).includes(0)) throw new Error("Das sieht nicht nach einer Textdatei aus.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Text als Blob mit UTF-8-Kennung, damit Windows-Editoren Umlaute richtig zeigen. */
export function textBlob(text, type = "text/plain") {
  return new Blob([text], { type: `${type};charset=utf-8` });
}
