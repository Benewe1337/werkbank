// Hilfen für „Tabellen mit SQL abfragen“: Tabellennamen, Lade-SQL, Werte und CSV. Ohne DOM, damit testbar.

export const ACCEPT = ".csv,.tsv,.txt,.parquet,.json,.jsonl,.ndjson";
/** Mehr Zeilen zeigt die Tabelle nicht an; der CSV-Export enthält alle. */
export const MAX_ROWS = 1000;

const READERS = {
  csv: (f) => `read_csv_auto(${quoteString(f)}, header = true, sample_size = -1)`,
  tsv: (f) => `read_csv_auto(${quoteString(f)}, header = true, delim = '\t', sample_size = -1)`,
  txt: (f) => `read_csv_auto(${quoteString(f)}, header = true, sample_size = -1)`,
  parquet: (f) => `read_parquet(${quoteString(f)})`,
};
/** JSON und JSON Lines werden vorab in eine Zeilenliste gebracht (jsonToRowArray) und dann mit read_json_auto gelesen. */
const JSON_EXTENSIONS = ["json", "jsonl", "ndjson"];

export function extensionOf(name) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

export function isSupported(name) {
  return extensionOf(name) in READERS || isJson(name);
}

export function isJson(name) {
  return JSON_EXTENSIONS.includes(extensionOf(name));
}

/**
 * JSON oder JSON Lines in eine Zeilenliste [{…}, …] bringen (für read_json_auto mit format = 'array').
 * Ein Objekt mit genau einer Liste darin (z. B. {"daten": [...]}) wird ausgepackt.
 * @returns {string} JSON-Text der Zeilenliste
 */
export function jsonToRowArray(text, fileName) {
  let value;
  if (["jsonl", "ndjson"].includes(extensionOf(fileName))) {
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    value = [];
    lines.forEach((line, i) => {
      if (!line) return;
      try {
        value.push(JSON.parse(line));
      } catch {
        throw new Error(`${fileName}: Zeile ${i + 1} ist kein gültiges JSON.`);
      }
    });
  } else {
    try {
      value = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
      throw new Error(`${fileName}: Kein gültiges JSON.`);
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const lists = Object.values(value).filter(Array.isArray);
    value = Object.keys(value).length === 1 && lists.length === 1 ? lists[0] : [value];
  }
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${fileName}: Keine Zeilen gefunden.`);
  const rows = value.map((v) => (v !== null && typeof v === "object" && !Array.isArray(v) ? v : { wert: v }));
  return JSON.stringify(rows);
}

export const quoteString = (s) => `'${String(s).replace(/'/g, "''")}'`;
export const quoteIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;

/** "Umsätze 2024 (final).csv" -> "umsaetze_2024_final"; eindeutig gegenüber `taken`. */
export function tableName(fileName, taken = []) {
  let base = fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) base = "tabelle";
  if (/^\d/.test(base)) base = `t_${base}`;
  const used = new Set(taken.map((t) => t.toLowerCase()));
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}_${i}`;
  return name;
}

/** SQL, das eine registrierte Datei als Tabelle anlegt. */
export function createTableSql(table, fileName) {
  const reader = READERS[extensionOf(fileName)];
  if (!reader) throw new Error(`${fileName}: Dieses Format wird hier nicht per SQL gelesen (CSV oder Parquet).`);
  return `CREATE OR REPLACE TABLE ${quoteIdent(table)} AS SELECT * FROM ${reader(fileName)}`;
}

export function exampleQuery(table) {
  return `SELECT *\nFROM ${quoteIdent(table)}\nLIMIT 100;`;
}

/** Arrow-/DuckDB-Wert als Text für Anzeige und CSV. */
export function cellToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return `0x${[...value].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  if (typeof value === "object") {
    const plain = typeof value.toJSON === "function" ? value.toJSON() : value;
    return JSON.stringify(plain, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  }
  return String(value);
}

/** Datums- und Zeitstempelspalten kommen von Arrow als Millisekunden-Zahl. */
export function formatCell(value, typeName = "") {
  if (typeof value === "number" && /^(Date|Timestamp)/i.test(typeName)) {
    const iso = new Date(value).toISOString();
    return /^Date/i.test(typeName) ? iso.slice(0, 10) : iso.replace("T", " ").replace(/\.000Z$|Z$/, "");
  }
  return cellToString(value);
}

function csvField(s) {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC-4180-CSV aus Spaltennamen und Zeilen (Werte schon als Text). */
export function toCsv(columns, rows) {
  return [columns, ...rows].map((r) => r.map((v) => csvField(String(v))).join(",")).join("\r\n");
}

/** Abschließende Semikolons und Leerraum weg; leere Abfragen abfangen. */
export function cleanSql(sql) {
  const s = String(sql ?? "").trim().replace(/;+\s*$/, "");
  if (!s) throw new Error("Gib eine SQL-Abfrage ein.");
  return s;
}

/** DuckDB-Fehler kürzen: „Catalog Error: Table with name x does not exist!“ -> deutscher Hinweis + Original. */
export function explainSqlError(message = "") {
  const first = message.split("\n")[0];
  if (/Table with name .* does not exist/i.test(first)) return `Diese Tabelle gibt es nicht. ${first}`;
  if (/Referenced column .* not found|column .* not found/i.test(first)) return `Diese Spalte gibt es nicht. ${first}`;
  if (/syntax error/i.test(first)) return `SQL-Syntaxfehler. ${first}`;
  if (/extension|httpfs|INSTALL/i.test(first)) return `Diese Erweiterung ist hier nicht verfügbar (nur parquet und json werden mitgeliefert). ${first}`;
  return first;
}
