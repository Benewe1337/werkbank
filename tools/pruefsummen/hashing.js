// Prüfsummen mit hash-wasm, in Stücken gestreamt. Ohne DOM, läuft im Worker und in Node.
import { createBLAKE3, createCRC32, createMD5, createSHA1, createSHA3, createSHA256, createSHA512 } from "hash-wasm";

export const ALGORITHMS = [
  { id: "md5", label: "MD5", create: () => createMD5() },
  { id: "sha1", label: "SHA-1", create: () => createSHA1() },
  { id: "sha256", label: "SHA-256", create: () => createSHA256() },
  { id: "sha512", label: "SHA-512", create: () => createSHA512() },
  { id: "sha3-256", label: "SHA3-256", create: () => createSHA3(256) },
  { id: "blake3", label: "BLAKE3", create: () => createBLAKE3() },
  { id: "crc32", label: "CRC32", create: () => createCRC32() },
];

/** 4 MiB pro Stück: groß genug für Tempo, klein genug für den Speicher. */
export const CHUNK_SIZE = 4 * 1024 * 1024;

/**
 * Hasht einen Blob/File stückweise mit mehreren Verfahren in einem Durchgang.
 * @param {Blob} blob
 * @param {string[]} ids
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Record<string, string>>}
 */
export async function hashBlob(blob, ids, onProgress = () => {}, chunkSize = CHUNK_SIZE) {
  const chosen = ALGORITHMS.filter((a) => ids.includes(a.id));
  if (chosen.length === 0) throw new Error("Wähle mindestens ein Verfahren.");
  const hashers = await Promise.all(chosen.map((a) => a.create()));
  for (const h of hashers) h.init();
  const total = blob.size;
  for (let offset = 0; offset < total; offset += chunkSize) {
    const chunk = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
    for (const h of hashers) h.update(chunk);
    onProgress(Math.min(offset + chunkSize, total), total);
  }
  if (total === 0) onProgress(0, 0);
  return Object.fromEntries(chosen.map((a, i) => [a.id, hashers[i].digest("hex")]));
}

/**
 * Eingegebenen Prüfwert vereinheitlichen: Präfix wie "sha256:" weg, Hex-Gruppen mit Leerzeichen/Doppelpunkten
 * zusammenziehen, Dateiname dahinter (sha256sum-Format) ignorieren, Kleinbuchstaben.
 */
export function normalizeExpected(input) {
  const s = String(input ?? "").trim().replace(/^(md5|sha-?\d+|sha3-?\d+|blake3|crc-?32)\s*[:=]\s*/i, "");
  const groups = [];
  for (const token of s.split(/\s+/)) {
    if (!/^[0-9a-f:]+$/i.test(token)) break;
    groups.push(token.replace(/:/g, ""));
  }
  return groups.join("").toLowerCase();
}

/**
 * Sucht den erwarteten Wert in allen Ergebnissen.
 * @param {string} expected
 * @param {{name: string, hashes: Record<string, string>}[]} files
 * @returns {{file: string, algorithm: string}[]}
 */
export function findMatches(expected, files) {
  const want = normalizeExpected(expected);
  if (!want) return [];
  const out = [];
  for (const f of files) for (const [id, value] of Object.entries(f.hashes)) if (value === want) out.push({ file: f.name, algorithm: id });
  return out;
}

/** Welches Verfahren passt von der Länge her? (Hilft bei der Meldung „passt nicht“.) */
export function algorithmsForLength(hexLength) {
  const lengths = { 8: ["CRC32"], 32: ["MD5"], 40: ["SHA-1"], 64: ["SHA-256", "SHA3-256", "BLAKE3"], 128: ["SHA-512"] };
  return lengths[hexLength] ?? [];
}
