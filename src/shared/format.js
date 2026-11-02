// Reine Hilfsfunktionen (ohne DOM, damit testbar).

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Prozentuale Ersparnis, z. B. "−38 %"; negativ heißt größer geworden. */
export function formatSaving(before, after) {
  if (!before) return "";
  const pct = Math.round((1 - after / before) * 100);
  return pct >= 0 ? `−${pct} %` : `+${-pct} %`;
}

export function baseName(name) {
  return name.replace(/\.[^./\\]+$/, "");
}

/** "foto.HEIC" + ("", "jpg") -> "foto.jpg"; mit Suffix: "bericht" + ("-klein", "pdf") -> "bericht-klein.pdf" */
export function outputName(name, suffix = "", ext = null) {
  const extension = ext ?? (name.match(/\.([^./\\]+)$/)?.[1] ?? "");
  return `${baseName(name)}${suffix}${extension ? `.${extension}` : ""}`;
}

/** Passt eine Datei zu einer accept-Liste wie ".pdf,image/*"? */
export function matchesAccept(file, accept) {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) => {
      if (a.startsWith(".")) return name.endsWith(a);
      if (a.endsWith("/*")) return type.startsWith(a.slice(0, -1));
      return type === a;
    });
}

/** Seitenangaben wie "1-3, 5, 8-" in 0-basierte Indizes umwandeln. */
export function parsePageRanges(input, pageCount) {
  const text = String(input ?? "").trim();
  if (!text) return [...Array(pageCount).keys()];
  const out = [];
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*[-–]\s*(\d*)$|^(\d+)$/);
    if (!m) throw new Error(`Ungültige Seitenangabe: „${part}“`);
    const from = Number(m[3] ?? (m[1] || 1));
    const to = Number(m[3] ?? (m[2] || pageCount));
    if (from < 1 || to > pageCount || from > to) throw new Error(`Seiten ${part} gibt es nicht (1–${pageCount})`);
    for (let p = from; p <= to; p++) out.push(p - 1);
  }
  return out;
}
