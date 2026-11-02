// JSON, CSV, YAML und XML erkennen, lesen und schreiben. Ohne DOM, damit testbar.
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import * as yaml from "js-yaml";
import Papa from "papaparse";

export const FORMATS = ["json", "csv", "yaml", "xml"];
export const FORMAT_LABEL = { json: "JSON", csv: "CSV", yaml: "YAML", xml: "XML" };
export const EXTENSION = { json: "json", csv: "csv", yaml: "yaml", xml: "xml" };
export const MIME = { json: "application/json", csv: "text/csv", yaml: "application/yaml", xml: "application/xml" };
const DELIMITERS = [",", ";", "\t", "|"];
const ATTR = "@";
const TEXT = "#text";

/** Fehler mit Position (1-basiert). */
export class ParseError extends Error {
  constructor(message, line, column) {
    super(line ? `${message} (Zeile ${line}, Spalte ${column})` : message);
    this.name = "ParseError";
    this.line = line;
    this.column = column;
  }
}

export function lineColumn(text, offset) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  return { line, column: offset - before.lastIndexOf("\n") };
}

/** Trennzeichen einer CSV raten: das Zeichen, das in den ersten Zeilen gleich oft (und am häufigsten) vorkommt. */
export function detectDelimiter(text) {
  const lines = splitCsvLines(text).slice(0, 20).filter((l) => l.trim());
  let best = { delimiter: ",", score: 0 };
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    if (counts.length === 0 || counts[0] === 0) continue;
    const consistent = counts.filter((c) => c === counts[0]).length / counts.length;
    const score = consistent * 1000 + counts[0];
    if (score > best.score) best = { delimiter: d, score };
  }
  return best.delimiter;
}

function splitCsvLines(text) {
  const out = [];
  let current = "";
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    if ((c === "\n" || c === "\r") && !quoted) {
      if (current) out.push(current);
      current = "";
    } else current += c;
  }
  if (current) out.push(current);
  return out;
}

function countOutsideQuotes(line, d) {
  let n = 0;
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (c === d && !quoted) n++;
  }
  return n;
}

/** Format aus Dateiname oder Inhalt erkennen. */
export function detectFormat(text, fileName = "") {
  const ext = fileName.toLowerCase().match(/\.([a-z]+)$/)?.[1];
  if (ext === "json" || ext === "geojson") return "json";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "yaml" || ext === "yml") return "yaml";
  if (ext === "xml") return "xml";
  const t = text.replace(/^\uFEFF/, "").trimStart();
  if (!t) return null;
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (t.startsWith("<")) return "xml";
  const lines = t.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const yamlish = lines.some((l) => /^(\s*-\s|\s*[^\s:,;]+:(\s|$)|---)/.test(l));
  if (!yamlish && lines.length >= 1) {
    const d = detectDelimiter(t);
    if (lines.every((l) => countOutsideQuotes(l, d) > 0 && countOutsideQuotes(l, d) === countOutsideQuotes(lines[0], d))) return "csv";
  }
  return "yaml";
}

/** Erste fehlerhafte Stelle in JSON finden (JSON.parse liefert nicht in jedem Browser eine Position). */
export function locateJsonError(text) {
  let i = 0;
  const fail = (msg) => {
    throw Object.assign(new Error(msg), { offset: i });
  };
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const literal = (word) => {
    if (text.startsWith(word, i)) i += word.length;
    else fail("Unerwartetes Zeichen");
  };
  const string = () => {
    i++;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') return i++;
      if (c === "\\") {
        const n = text[i + 1];
        if (n === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) i += 6;
        else if (n !== undefined && '"\\/bfnrt'.includes(n)) i += 2;
        else fail("Ungültige Escape-Sequenz");
      } else if (c < " ") fail("Steuerzeichen in Zeichenkette");
      else i++;
    }
    fail("Zeichenkette nicht geschlossen");
  };
  const number = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail("Ungültige Zahl");
    i += m[0].length;
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      ws();
      if (text[i] === "}") return i++;
      for (;;) {
        ws();
        if (text[i] !== '"') fail("Schlüssel in Anführungszeichen erwartet");
        string();
        ws();
        if (text[i] !== ":") fail("Doppelpunkt erwartet");
        i++;
        value();
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "}") return i++;
        else fail("Komma oder } erwartet");
      }
    }
    if (c === "[") {
      i++;
      ws();
      if (text[i] === "]") return i++;
      for (;;) {
        value();
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "]") return i++;
        else fail("Komma oder ] erwartet");
      }
    }
    if (c === '"') return string();
    if (c === "t") return literal("true");
    if (c === "f") return literal("false");
    if (c === "n") return literal("null");
    if (c === "-" || (c >= "0" && c <= "9")) return number();
    fail(c === undefined ? "Unerwartetes Ende" : "Unerwartetes Zeichen");
  };
  try {
    value();
    ws();
    if (i < text.length) fail("Zusätzlicher Inhalt nach dem Ende");
    return null;
  } catch (e) {
    return { message: e.message, ...lineColumn(text, e.offset) };
  }
}

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

/** "42" -> 42, "true" -> true; führende Nullen (PLZ, Artikelnummern) bleiben Text. */
export function typedValue(s) {
  if (NUMBER.test(s) && Number.isFinite(Number(s)) && (s.replace(/^-/, "").length < 16 || s.includes("."))) return Number(s);
  if (s === "true") return true;
  if (s === "false") return false;
  return s;
}

/**
 * Spaltenweise typisieren: Eine Spalte wird nur Zahl/Wahrheitswert, wenn alle gefüllten Werte passen.
 * So bleibt eine PLZ-Spalte Text, sobald eine PLZ mit 0 beginnt.
 */
export function typeColumns(rows) {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const convertible = new Set(
    columns.filter((c) => rows.every((r) => r[c] === undefined || r[c] === "" || typeof typedValue(r[c]) !== "string")),
  );
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, convertible.has(k) && v !== "" ? typedValue(v) : v])));
}

/**
 * @param {string} text
 * @param {"json"|"csv"|"yaml"|"xml"} format
 * @param {{delimiter?: string, typed?: boolean}} [opts]
 */
export function parse(text, format, { delimiter, typed = true } = {}) {
  const input = text.replace(/^\uFEFF/, "");
  if (!input.trim()) throw new ParseError("Die Eingabe ist leer.");
  switch (format) {
    case "json":
      try {
        return JSON.parse(input);
      } catch {
        const loc = locateJsonError(input);
        throw new ParseError(`Ungültiges JSON: ${loc?.message ?? "Syntaxfehler"}`, loc?.line, loc?.column);
      }
    case "yaml":
      try {
        const docs = yaml.loadAll(input);
        return docs.length === 1 ? docs[0] : docs;
      } catch (e) {
        const mark = e.mark;
        throw new ParseError(`Ungültiges YAML: ${String(e.reason ?? e.message).split("\n")[0]}`, mark ? mark.line + 1 : undefined, mark ? mark.column + 1 : undefined);
      }
    case "xml": {
      const check = XMLValidator.validate(input);
      if (check !== true) throw new ParseError(`Ungültiges XML: ${check.err.msg}`, check.err.line, check.err.col);
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: ATTR,
        textNodeName: TEXT,
        ignoreDeclaration: true,
        ignorePiTags: true,
        parseTagValue: typed,
        parseAttributeValue: typed,
        numberParseOptions: { leadingZeros: false, hex: false },
        processEntities: true,
        htmlEntities: false,
      });
      return parser.parse(input);
    }
    case "csv": {
      const d = delimiter || detectDelimiter(input);
      const result = Papa.parse(input, { header: true, delimiter: d, skipEmptyLines: "greedy" });
      const fatal = result.errors.find((e) => e.type === "Quotes" || e.code === "TooManyFields" || e.code === "TooFewFields");
      if (fatal) {
        const line = (fatal.row ?? 0) + 2;
        const what = fatal.type === "Quotes" ? "Anführungszeichen nicht geschlossen" : fatal.code === "TooManyFields" ? "zu viele Spalten" : "zu wenige Spalten";
        throw new ParseError(`Ungültiges CSV: ${what}`, line, 1);
      }
      return typed ? typeColumns(result.data) : result.data;
    }
    default:
      throw new Error(`Unbekanntes Format: ${format}`);
  }
}

/** Verschachtelte Objekte für CSV in Spalten mit Punkt-Namen auflösen ("adresse.ort"). Listen werden JSON. */
export function flatten(value, prefix = "", out = {}) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix) out[prefix] = "";
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (Array.isArray(value)) {
    out[prefix] = JSON.stringify(value);
  } else {
    out[prefix || "wert"] = value ?? "";
  }
  return out;
}

/** Zeilen für CSV: Liste von Objekten; ein Objekt mit genau einer Liste darin wird ausgepackt (z. B. XML). */
export function toRows(value) {
  let v = value;
  for (let i = 0; i < 3 && v && typeof v === "object" && !Array.isArray(v); i++) {
    const keys = Object.keys(v);
    if (keys.length !== 1) break;
    v = v[keys[0]];
  }
  const list = Array.isArray(v) ? v : [v];
  return list.map((item) => flatten(item));
}

function toXmlTree(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value).filter((k) => !k.startsWith(ATTR));
    if (keys.length === 1 && !Array.isArray(value[keys[0]])) return value;
  }
  return { root: Array.isArray(value) ? { item: value } : value };
}

/** XML-Namen dürfen keine Leerzeichen o. Ä. enthalten. */
function xmlSafeKeys(value) {
  if (Array.isArray(value)) return value.map(xmlSafeKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => {
      if (k.startsWith(ATTR) || k === TEXT) return [k, xmlSafeKeys(v)];
      let name = k.replace(/[^\p{L}\p{N}_.-]/gu, "_");
      if (!/^[\p{L}_]/u.test(name)) name = `_${name}`;
      return [name, xmlSafeKeys(v)];
    }),
  );
}

/**
 * @param {unknown} value
 * @param {"json"|"csv"|"yaml"|"xml"} format
 * @param {{pretty?: boolean, delimiter?: string}} [opts]
 */
export function serialize(value, format, { pretty = true, delimiter = "," } = {}) {
  switch (format) {
    case "json":
      return JSON.stringify(value, null, pretty ? 2 : undefined);
    case "yaml":
      return pretty ? yaml.dump(value, { lineWidth: -1, noRefs: true }) : yaml.dump(value, { flowLevel: 0, lineWidth: -1, noRefs: true }).trim();
    case "xml": {
      const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: ATTR,
        textNodeName: TEXT,
        format: pretty,
        indentBy: "  ",
        suppressEmptyNode: true,
      });
      const body = builder.build(xmlSafeKeys(toXmlTree(value)));
      return `<?xml version="1.0" encoding="UTF-8"?>${pretty ? "\n" : ""}${body.trim()}${pretty ? "\n" : ""}`;
    }
    case "csv": {
      const rows = toRows(value);
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      return Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? "")) }, { delimiter, newline: "\r\n" });
    }
    default:
      throw new Error(`Unbekanntes Format: ${format}`);
  }
}

/**
 * Komplette Umwandlung.
 * @param {string} text
 * @param {{from?: string|null, to: string, pretty?: boolean, delimiter?: string, outDelimiter?: string, typed?: boolean, fileName?: string}} opts
 */
export function convert(text, { from = null, to, pretty = true, delimiter, outDelimiter = ",", typed = true, fileName = "" }) {
  const source = from || detectFormat(text, fileName);
  if (!source) throw new ParseError("Die Eingabe ist leer.");
  const value = parse(text, source, { delimiter, typed });
  return { from: source, output: serialize(value, to, { pretty, delimiter: outDelimiter }) };
}
