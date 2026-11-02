// Reine Vergleichslogik ohne DOM (in Node testbar). Nutzt jsdiff.
import { createTwoFilesPatch, diffLines, diffWordsWithSpace } from "diff";

export const MODES = ["lines", "words"];
/** Abbruch nach dieser Zeit, damit riesige Texte den Worker nicht endlos blockieren. */
export const TIMEOUT_MS = 15_000;

/** Windows- und alte Mac-Zeilenenden vereinheitlichen, sonst unterscheidet sich jede Zeile. */
export function normalizeNewlines(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n");
}

const kindOf = (change) => (change.added ? "added" : change.removed ? "removed" : "same");

/** Anzahl Zeilen eines Diff-Stücks (ein abschließender Umbruch zählt nicht als eigene Zeile). */
export function countLines(value) {
  if (!value) return 0;
  const lines = value.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

export function countWords(value) {
  return value.split(/\s+/).filter(Boolean).length;
}

/**
 * Vergleicht zwei Texte.
 * @param {string} before
 * @param {string} after
 * @param {{mode?: "lines"|"words", ignoreCase?: boolean, ignoreWhitespace?: boolean}} [opts]
 * @returns {{mode: string, parts: {kind: "added"|"removed"|"same", value: string}[],
 *            stats: {added: number, removed: number, same: number}}}
 */
export function compareTexts(before, after, { mode = "lines", ignoreCase = false, ignoreWhitespace = false } = {}) {
  if (!MODES.includes(mode)) throw new Error(`Unbekannte Vergleichsart: ${mode}`);
  // Zeilenweise: fehlender Umbruch am Textende soll die letzte Zeile nicht als geändert markieren.
  const close = (t) => (mode === "lines" && t && !t.endsWith("\n") ? `${t}\n` : t);
  const a = close(normalizeNewlines(before));
  const b = close(normalizeNewlines(after));
  const changes =
    mode === "lines"
      ? diffLines(a, b, { ignoreCase, ignoreWhitespace, timeout: TIMEOUT_MS })
      : diffWordsWithSpace(a, b, { ignoreCase, timeout: TIMEOUT_MS });
  if (!changes) throw new Error("Die Texte sind zu groß oder zu verschieden für einen Vergleich.");

  const count = mode === "lines" ? countLines : countWords;
  const stats = { added: 0, removed: 0, same: 0 };
  const parts = [];
  for (const change of changes) {
    if (!change.value) continue;
    const kind = kindOf(change);
    stats[kind] += count(change.value);
    const last = parts.at(-1);
    // Benachbarte Stücke gleicher Art zusammenlegen (kleinere DOM-Ausgabe).
    if (last?.kind === kind) last.value += change.value;
    else parts.push({ kind, value: change.value });
  }
  return { mode, parts, stats };
}

/** Zerlegt die Stücke eines Zeilenvergleichs in einzelne Zeilen mit Zeilennummern links/rechts. */
export function toRows(parts) {
  const rows = [];
  let left = 0;
  let right = 0;
  for (const { kind, value } of parts) {
    const lines = value.split("\n");
    if (lines.at(-1) === "") lines.pop();
    for (const text of lines) {
      if (kind !== "added") left++;
      if (kind !== "removed") right++;
      rows.push({ kind, text, left: kind === "added" ? null : left, right: kind === "removed" ? null : right });
    }
  }
  return rows;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Kurze Zusammenfassung, z. B. „3 Zeilen hinzugefügt, 1 entfernt“. */
export function summarize({ added, removed }, mode = "lines") {
  if (added === 0 && removed === 0) return "Keine Unterschiede.";
  const [one, many] = mode === "lines" ? ["Zeile", "Zeilen"] : ["Wort", "Wörter"];
  if (removed === 0) return `${plural(added, one, many)} hinzugefügt`;
  if (added === 0) return `${plural(removed, one, many)} entfernt`;
  return `${plural(added, one, many)} hinzugefügt, ${removed} entfernt`;
}

/** Unified-Diff (wie `diff -u`) zum Herunterladen. */
export function makePatch(before, after, nameA = "original.txt", nameB = "geaendert.txt") {
  return createTwoFilesPatch(nameA, nameB, normalizeNewlines(before), normalizeNewlines(after), "", "", {
    context: 3,
  });
}
