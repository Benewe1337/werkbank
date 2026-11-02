import "../../src/shared/style.css";
import "../_codes/codes.css";
import "./style.css";
import { zipSync } from "fflate";
import { Archive } from "libarchive.js";
import LibarchiveWorker from "libarchive.js/dist/worker-bundle.js?worker";
import { formatSize } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, downloadBlob, engineStatus, mountDrop } from "../../src/shared/ui.js";
import { h } from "../_codes/dom.js";
import { allZipName, ARCHIVE_ACCEPT, explainArchiveError, toEntries } from "./entries.js";

// Den libarchive-Worker bündelt Vite selbst (samt .wasm); nichts wird aus dem Netz geladen.
Archive.init({ getWorker: () => new LibarchiveWorker() });
const zipper = connect(new Worker(new URL("../_codes/zip-worker.js", import.meta.url), { type: "module" }));

/** Startprobe: ein leeres ZIP öffnen, damit die WebAssembly sicher geladen ist, bevor jemand eine Datei wählt. */
async function probe() {
  const reader = await Archive.open(new File([zipSync({ "probe.txt": new Uint8Array([1]) })], "probe.zip"));
  const list = await reader.getFilesArray();
  await reader.close();
  if (list.length !== 1) throw new Error("libarchive antwortet nicht wie erwartet");
}
engineStatus($("#engine"), Promise.all([probe(), zipper.ready]));

const status = $("#status");
const errorBox = $("#error");
const tbody = $("#entries");
const tableWrap = $("#table-wrap");
const actions = $("#actions");
const summary = $("#summary");
const passwordForm = /** @type {HTMLFormElement} */ ($("#password-form"));
const passwordInput = /** @type {HTMLInputElement} */ ($("#password"));
const allButton = /** @type {HTMLButtonElement} */ ($("#all"));
/** Mehr Zeilen machen die Tabelle träge; der ZIP-Download enthält trotzdem alles. */
const ROW_LIMIT = 2000;

/** @type {{file: File, reader: any, entries: ReturnType<typeof toEntries>, password: string|null, extracted: Map<string, File>|null} | null} */
let current = null;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function reset() {
  errorBox.hidden = true;
  tableWrap.hidden = true;
  actions.hidden = true;
  passwordForm.hidden = true;
  tbody.replaceChildren();
}

async function openReader(file, password) {
  const reader = await Archive.open(file);
  if (password) await reader.usePassword(password);
  return reader;
}

async function open(file, password = null) {
  reset();
  status.textContent = `${file.name} wird geöffnet …`;
  try {
    const reader = await openReader(file, password);
    const encrypted = await reader.hasEncryptedData();
    const list = await reader.getFilesArray();
    const entries = toEntries(list);
    current = { file, reader, entries, password, extracted: null };
    if (entries.length === 0) {
      status.textContent = "";
      showError(encrypted ? "Das Archiv ist verschlüsselt. Gib das Passwort ein." : `${file.name}: Keine Dateien gefunden. Ist das ein unterstütztes Archiv, und ist es unbeschädigt?`);
      passwordForm.hidden = !encrypted;
      return;
    }
    if (encrypted && !password) {
      passwordForm.hidden = false;
      passwordInput.focus();
      status.textContent = `${file.name} ist verschlüsselt. Die Dateinamen sind sichtbar, zum Entpacken brauchst du das Passwort.`;
    } else {
      status.textContent = `${file.name}: ${entries.length} ${entries.length === 1 ? "Datei" : "Dateien"}${password ? ", entsperrt" : ""}.`;
    }
    render();
  } catch (error) {
    status.textContent = "";
    showError(explainArchiveError(error?.message));
  }
}

function render() {
  const { entries } = current;
  const total = entries.reduce((n, e) => n + e.size, 0);
  summary.textContent = `${entries.length} ${entries.length === 1 ? "Datei" : "Dateien"}, entpackt ${formatSize(total)}`;
  tbody.replaceChildren(
    ...entries.slice(0, ROW_LIMIT).map((entry) =>
      h(
        "tr",
        {},
        h("td", { text: entry.path }),
        h("td", { text: formatSize(entry.size) }),
        h("td", {}, h("button", { type: "button", class: "button ghost", text: "Herunterladen", "aria-label": `${entry.path} herunterladen`, onclick: (e) => downloadOne(entry, e.currentTarget) })),
      ),
    ),
  );
  if (entries.length > ROW_LIMIT) tbody.append(h("tr", {}, h("td", { colspan: "3", class: "hint", text: `… und ${entries.length - ROW_LIMIT} weitere (alle im ZIP enthalten)` })));
  tableWrap.hidden = false;
  actions.hidden = false;
}

/** Alles einmal entpacken (libarchive beendet danach seinen Worker), Ergebnis für spätere Downloads behalten. */
async function extractAll() {
  if (current.extracted) return current.extracted;
  const reader = await openReader(current.file, current.password);
  const result = await reader.extractFiles();
  const map = new Map();
  const walk = (node, prefix) => {
    for (const [name, value] of Object.entries(node ?? {})) {
      if (value instanceof File) map.set(`${prefix}${name}`, value);
      else walk(value, `${prefix}${name}/`);
    }
  };
  walk(result, "");
  const missing = current.entries.filter((e) => !map.has(e.path));
  if (missing.length) throw new Error(`${missing.length} von ${current.entries.length} Dateien ließen sich nicht entpacken.`);
  current.extracted = map;
  return map;
}

async function downloadOne(entry, button) {
  errorBox.hidden = true;
  button.disabled = true;
  try {
    let file = current.extracted?.get(entry.path);
    if (!file) {
      const reader = await openReader(current.file, current.password);
      const result = await reader.extractSingleFile(entry.path);
      await reader.close();
      if (!result || (result.size === 0 && entry.size > 0)) throw new Error("Die Datei ließ sich nicht entpacken.");
      file = result;
    }
    downloadBlob(file, entry.name);
  } catch (error) {
    showError(`${entry.path}: ${explainArchiveError(error?.message)}`);
    if (/passphrase|encrypt/i.test(error?.message ?? "")) passwordForm.hidden = false;
  } finally {
    button.disabled = false;
  }
}

allButton.addEventListener("click", async () => {
  errorBox.hidden = true;
  allButton.disabled = true;
  const label = allButton.textContent;
  allButton.textContent = "Wird entpackt …";
  try {
    const files = await extractAll();
    allButton.textContent = "Wird gepackt …";
    await zipper.ready;
    const blob = await zipper.call("zip", { entries: [...files].map(([path, file]) => ({ path, file })), level: 6 });
    downloadBlob(blob, allZipName(current.file.name));
  } catch (error) {
    showError(explainArchiveError(error?.message));
    if (/passphrase|encrypt/i.test(error?.message ?? "")) passwordForm.hidden = false;
  } finally {
    allButton.disabled = false;
    allButton.textContent = label;
  }
});

passwordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!current) return;
  const password = passwordInput.value;
  if (!password) return showError("Gib das Passwort ein.");
  const file = current.file;
  await open(file, password);
  // Passwort gleich prüfen, indem alles entpackt wird; sonst merkt man den Fehler erst beim Download.
  if (!current?.entries.length) return;
  try {
    status.textContent = "Passwort wird geprüft …";
    await extractAll();
    status.textContent = `${file.name}: ${current.entries.length} ${current.entries.length === 1 ? "Datei" : "Dateien"}, entsperrt.`;
    passwordInput.value = "";
  } catch (error) {
    status.textContent = "";
    current.password = null;
    passwordForm.hidden = false;
    showError(explainArchiveError(error?.message));
  }
});

mountDrop($("#drop"), {
  accept: ARCHIVE_ACCEPT,
  multiple: false,
  label: "Archiv hier ablegen",
  hint: "ZIP, 7z, RAR, TAR, TAR.GZ …",
  onRejected: (file) => showError(`${file.name}: Passt nicht (erwartet: ein Archiv wie ZIP, 7z, RAR oder TAR).`),
  onFiles: ([file]) => open(file),
});
