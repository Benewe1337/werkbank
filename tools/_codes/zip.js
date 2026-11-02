// ZIP-Erzeugung mit fflate im Streaming-Verfahren. Ohne DOM: läuft im Worker und in Node.
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

/** Pfad für ein ZIP: Schrägstriche, keine absoluten Pfade, kein "..", keine leeren Teile. */
export function cleanPath(path) {
  const parts = String(path)
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p && p !== "." && p !== "..");
  return parts.join("/").replace(/^[A-Za-z]:\//, "");
}

/** Doppelte Pfade bekommen " (2)", " (3)" … vor der Endung. */
export function uniquePaths(paths) {
  const used = new Set();
  return paths.map((raw) => {
    const path = cleanPath(raw) || "datei";
    if (!used.has(path.toLowerCase())) {
      used.add(path.toLowerCase());
      return path;
    }
    const slash = path.lastIndexOf("/");
    const dot = path.lastIndexOf(".");
    const [stem, ext] = dot > slash + 1 ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
    let i = 2;
    while (used.has(`${stem} (${i})${ext}`.toLowerCase())) i++;
    const unique = `${stem} (${i})${ext}`;
    used.add(unique.toLowerCase());
    return unique;
  });
}

/** Name der ZIP-Datei: ungültige Zeichen raus, .zip anhängen. */
export function zipFileName(input) {
  const name = String(input ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\.zip$/i, "");
  return `${name || "archiv"}.zip`;
}

/** Schon komprimierte Formate nur speichern, nicht noch mal deflaten (spart Zeit, kaum Platzverlust). */
const STORED = /\.(zip|7z|rar|gz|bz2|xz|zst|jpe?g|png|gif|webp|avif|heic|mp4|mov|mkv|webm|mp3|aac|m4a|ogg|opus|flac|docx|xlsx|pptx|odt|ods|epub)$/i;

/**
 * Schreibt die Dateien als ZIP. Dateien werden stückweise gelesen (Blob.stream), die Ausgabe in Teilen gesammelt.
 * @param {{path: string, file: Blob & {lastModified?: number}}[]} entries
 * @param {{level?: number, onProgress?: (done: number, total: number) => void}} [opts]
 * @returns {Promise<Blob>}
 */
export async function buildZip(entries, { level = 6, onProgress = () => {} } = {}) {
  if (entries.length === 0) throw new Error("Keine Dateien ausgewählt.");
  const total = entries.reduce((n, e) => n + e.file.size, 0);
  const chunks = [];
  let done = 0;
  let finish;
  let fail;
  const finished = new Promise((res, rej) => ((finish = res), (fail = rej)));
  const zip = new Zip((error, chunk, final) => {
    if (error) return fail(error);
    chunks.push(chunk);
    if (final) finish();
  });
  for (const { path, file } of entries) {
    const mtime = file.lastModified ? new Date(file.lastModified) : new Date();
    const entry = level === 0 || STORED.test(path) ? new ZipPassThrough(path) : new ZipDeflate(path, { level });
    entry.mtime = mtime;
    zip.add(entry);
    const reader = file.stream().getReader();
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      entry.push(value);
      done += value.length;
      onProgress(done, total);
    }
    entry.push(new Uint8Array(0), true);
  }
  zip.end();
  await finished;
  return new Blob(chunks, { type: "application/zip" });
}
