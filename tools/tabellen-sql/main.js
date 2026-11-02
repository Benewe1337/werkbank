import "../../src/shared/style.css";
import "../_codes/codes.css";
import "./style.css";
import * as duckdb from "@duckdb/duckdb-wasm";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import mvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import { formatSize } from "../../src/shared/format.js";
import { $, downloadBlob, engineStatus, mountDrop } from "../../src/shared/ui.js";
import { h } from "../_codes/dom.js";
import { ACCEPT, isJson, jsonToRowArray, cleanSql, createTableSql, exampleQuery, explainSqlError, formatCell, isSupported, MAX_ROWS, quoteIdent, quoteString, tableName, toCsv } from "./sql.js";

// Eigene Bundles (WASM + Worker) aus dem Build statt jsDelivr.
/** Ordner der selbst ausgelieferten DuckDB-Erweiterungen (siehe assets.json). */
const EXTENSION_REPOSITORY = "/vendor/duckdb";
const BUNDLES = { mvp: { mainModule: mvpWasm, mainWorker: mvpWorker }, eh: { mainModule: ehWasm, mainWorker: ehWorker } };

async function start() {
  const bundle = await duckdb.selectBundle(BUNDLES);
  const worker = new Worker(new URL(bundle.mainWorker, location.href).href);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(new URL(bundle.mainModule, location.href).href, bundle.pthreadWorker);
  await db.open({ query: { castBigIntToDouble: false } });
  const conn = await db.connect();
  // Erweiterungen (parquet, json) nur von der eigenen Seite laden: tools/tabellen-sql/assets.json legt sie beim
  // Build unter /vendor/duckdb/<version>/<plattform>/ ab. Andere Erweiterungen schlagen fehl (CSP: connect-src 'self').
  const repository = quoteString(new URL(EXTENSION_REPOSITORY, location.href).href.replace(/\/$/, ""));
  await conn.query(`SET custom_extension_repository = ${repository}`);
  await conn.query(`SET autoinstall_extension_repository = ${repository}`);
  return { db, conn };
}
const ready = start();
engineStatus($("#engine"), ready, "DuckDB");

const sqlInput = /** @type {HTMLTextAreaElement} */ ($("#sql"));
const runButton = /** @type {HTMLButtonElement} */ ($("#run"));
const exportButton = /** @type {HTMLButtonElement} */ ($("#export"));
const status = $("#status");
const errorBox = $("#error");
const resultBox = $("#result");
const tablesList = $("#tables");
/** @type {string[]} */
const tables = [];
/** @type {{columns: string[], rows: string[][]} | null} */
let lastResult = null;
let fileCounter = 0;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

/** Arrow-Tabelle in Spaltennamen + Textzeilen. */
function readArrow(table, limit = Infinity) {
  const fields = table.schema.fields;
  const columns = fields.map((f) => f.name);
  const vectors = fields.map((_, j) => table.getChildAt(j));
  const count = Math.min(table.numRows, limit);
  const rows = [];
  for (let i = 0; i < count; i++) rows.push(vectors.map((v, j) => (v?.get(i) === null || v?.get(i) === undefined ? null : formatCell(v.get(i), String(fields[j].type)))));
  return { columns, rows, total: table.numRows };
}

async function addFile(file) {
  if (!isSupported(file.name)) return showError(`${file.name}: Passt nicht (erwartet: CSV, Parquet oder JSON).`);
  const { db, conn } = await ready;
  const name = tableName(file.name, tables);
  // Interner Dateiname ohne Sonderzeichen; die Datei wird direkt aus dem Browser gelesen, nicht kopiert.
  const internal = `datei_${++fileCounter}.${isJson(file.name) ? "json" : file.name.toLowerCase().split(".").pop()}`;
  const item = h("li", { class: "result-item" }, h("strong", { text: `${name}` }), h("span", { class: "result-meta", text: `${file.name}, ${formatSize(file.size)}, wird geladen …` }));
  tablesList.append(item);
  try {
    if (isJson(file.name)) {
      const rows = jsonToRowArray(await file.text(), file.name);
      await db.registerFileBuffer(internal, new TextEncoder().encode(rows));
      await conn.query(`CREATE OR REPLACE TABLE ${quoteIdent(name)} AS SELECT * FROM read_json_auto(${quoteString(internal)}, format = 'array')`);
    } else {
      await db.registerFileHandle(internal, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
      await conn.query(createTableSql(name, internal));
    }
    const count = await conn.query(`SELECT count(*) AS n FROM ${quoteIdent(name)}`);
    const n = Number(count.getChildAt(0).get(0));
    const schema = await conn.query(`DESCRIBE ${quoteIdent(name)}`);
    const { rows } = readArrow(schema);
    tables.push(name);
    item.replaceChildren(
      h("strong", { text: name }),
      h("span", { class: "result-meta", text: `${file.name}, ${formatSize(file.size)}, ${n.toLocaleString("de-DE")} Zeilen, ${rows.length} Spalten` }),
      h("ul", { class: "schema", "aria-label": `Spalten von ${name}` }, rows.map(([col, type]) => h("li", {}, h("code", { text: col }), " ", h("span", { text: type })))),
    );
    if (tables.length === 1) sqlInput.value = exampleQuery(name);
  } catch (error) {
    item.remove();
    await db.dropFile(internal).catch(() => {});
    showError(`${file.name} ließ sich nicht laden: ${explainSqlError(error?.message)}`);
  }
}

function renderResult({ columns, rows, total }) {
  const table = h(
    "table",
    { class: "data" },
    h("thead", {}, h("tr", {}, columns.map((c) => h("th", { scope: "col", text: c })))),
    h("tbody", {}, rows.map((r) => h("tr", {}, r.map((v) => (v === null ? h("td", { class: "null", text: "NULL" }) : h("td", { text: v, title: v.length > 60 ? v : undefined })))))),
  );
  resultBox.replaceChildren(table);
  resultBox.hidden = false;
  const shown = rows.length < total ? `, die ersten ${rows.length.toLocaleString("de-DE")} angezeigt` : "";
  status.textContent = `${total.toLocaleString("de-DE")} ${total === 1 ? "Zeile" : "Zeilen"}${shown}.`;
}

async function runQuery() {
  errorBox.hidden = true;
  let sql;
  try {
    sql = cleanSql(sqlInput.value);
  } catch (error) {
    return showError(error.message);
  }
  runButton.disabled = true;
  status.textContent = "Abfrage läuft …";
  const started = performance.now();
  try {
    const { conn } = await ready;
    const result = await conn.query(sql);
    const all = readArrow(result);
    lastResult = { columns: all.columns, rows: all.rows.map((r) => r.map((v) => v ?? "")) };
    renderResult({ columns: all.columns, rows: all.rows.slice(0, MAX_ROWS), total: all.total });
    status.textContent += ` ${((performance.now() - started) / 1000).toFixed(2).replace(".", ",")} s.`;
    exportButton.disabled = all.columns.length === 0;
  } catch (error) {
    status.textContent = "";
    resultBox.hidden = true;
    lastResult = null;
    exportButton.disabled = true;
    showError(explainSqlError(error?.message));
  } finally {
    runButton.disabled = false;
  }
}

mountDrop($("#drop"), {
  accept: ACCEPT,
  label: "CSV-, Parquet- oder JSON-Dateien hier ablegen",
  onRejected: (file) => showError(`${file.name}: Passt nicht (erwartet: CSV, Parquet oder JSON).`),
  onFiles: async (files) => {
    errorBox.hidden = true;
    for (const f of files) await addFile(f);
  },
});

runButton.addEventListener("click", runQuery);
sqlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runQuery();
  }
});
exportButton.addEventListener("click", () => {
  if (!lastResult) return;
  downloadBlob(new Blob(["\uFEFF", toCsv(lastResult.columns, lastResult.rows)], { type: "text/csv;charset=utf-8" }), "ergebnis.csv");
});
