// Einträge aus libarchive.js aufbereiten. Ohne DOM, damit testbar.

export const ARCHIVE_ACCEPT =
  ".zip,.7z,.rar,.tar,.gz,.tgz,.bz2,.tbz,.tbz2,.xz,.txz,.zst,.lz4,.lzma,.iso,.cab,.cpio,.ar,.deb,.jar,.apk,.epub,.xar,.lha,.lzh," +
  "application/zip,application/x-7z-compressed,application/vnd.rar,application/x-rar-compressed,application/x-tar,application/gzip,application/x-gzip";

/**
 * libarchive liefert [{file: {name, size}, path: "ordner/"}]; daraus wird eine sortierte Liste mit vollem Pfad.
 * @param {{file: {name: string, size: number, lastModified?: number}, path: string}[]} list
 */
export function toEntries(list) {
  return list
    .map(({ file, path }) => ({ path: `${path ?? ""}${file.name}`, name: file.name, size: file.size ?? 0, compressed: file }))
    .sort((a, b) => a.path.localeCompare(b.path, "de", { numeric: true }));
}

/** libarchive meldet Fehler auf Englisch; die häufigen auf Deutsch. */
export function explainArchiveError(message = "") {
  if (/passphrase|password|encrypt|decrypt/i.test(message)) {
    return /incorrect/i.test(message) ? "Das Passwort ist falsch." : "Das Archiv ist verschlüsselt. Gib das Passwort ein.";
  }
  // „table index is out of bounds“ / „unreachable“: libarchive-WASM stürzt bei Datenmüll ab.
  if (/unrecognized archive format|memory read error|truncated|damaged|corrupt|out of bounds|unreachable|RuntimeError/i.test(message)) return "Das ist kein lesbares Archiv, oder die Datei ist beschädigt.";
  if (/unsupported/i.test(message)) return "Dieses Archiv nutzt ein Verfahren, das hier nicht unterstützt wird.";
  return message || "Unbekannter Fehler beim Entpacken.";
}

/** Name für „alles als ZIP“: archiv.tar.gz -> archiv-entpackt.zip */
export function allZipName(archiveName) {
  const stem = archiveName.replace(/\.(tar\.(gz|bz2|xz|zst)|tgz|tbz2?|txz|[a-z0-9]{1,4})$/i, "") || "archiv";
  return `${stem}-entpackt.zip`;
}
