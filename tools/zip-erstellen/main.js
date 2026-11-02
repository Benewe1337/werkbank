import "../../src/shared/style.css";
import "../_codes/codes.css";
import { formatSize } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, mountDrop } from "../../src/shared/ui.js";
import { h } from "../_codes/dom.js";
import { uniquePaths, zipFileName } from "../_codes/zip.js";

const engine = connect(new Worker(new URL("../_codes/zip-worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));

const list = $("#queue");
const run = /** @type {HTMLButtonElement} */ ($("#run"));
const clear = $("#clear");
const summary = $("#summary");
const level = /** @type {HTMLInputElement} */ ($("#level"));
const progress = /** @type {HTMLProgressElement} */ ($("#progress"));
/** Ab so vielen Einträgen nur die ersten zeigen, sonst wird die Liste unbedienbar. */
const LIST_LIMIT = 200;

/** @type {{path: string, file: File}[]} */
let entries = [];

function add(items) {
  const all = [...entries.map((e) => e.path), ...items.map((i) => i.path)];
  const paths = uniquePaths(all);
  entries = [...entries.map((e, i) => ({ ...e, path: paths[i] })), ...items.map((it, i) => ({ path: paths[entries.length + i], file: it.file }))];
  render();
}

function render() {
  const shown = entries.slice(0, LIST_LIMIT);
  list.replaceChildren(
    ...shown.map((entry, i) =>
      h(
        "li",
        { class: "queue-item" },
        h("span", { text: entry.path, title: entry.path }),
        h("span", { class: "hint", text: formatSize(entry.file.size) }),
        h("button", {
          type: "button",
          class: "icon-button",
          text: "×",
          "aria-label": `${entry.path} entfernen`,
          onclick: () => {
            entries = entries.filter((_, j) => j !== i);
            render();
          },
        }),
      ),
    ),
  );
  if (entries.length > LIST_LIMIT) list.append(h("li", { class: "queue-item hint", text: `… und ${entries.length - LIST_LIMIT} weitere` }));
  const total = entries.reduce((n, e) => n + e.file.size, 0);
  summary.textContent = entries.length ? `${entries.length} ${entries.length === 1 ? "Datei" : "Dateien"}, ${formatSize(total)}` : "";
  run.disabled = entries.length === 0;
  run.textContent = entries.length ? `${entries.length === 1 ? "1 Datei" : `${entries.length} Dateien`} packen` : "Dateien auswählen";
  clear.hidden = entries.length === 0;
}

const drop = mountDrop($("#drop"), {
  label: "Dateien oder Ordner hier ablegen",
  onFiles: (files) => add(files.map((file) => ({ path: file.webkitRelativePath || file.name, file }))),
});

/** Ordner per Drag & Drop: rekursiv über die Einträge laufen, Pfade relativ zum abgelegten Ordner. */
async function walk(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ path: `${prefix}${file.name}`, file });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = entry.createReader();
  for (;;) {
    const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (batch.length === 0) break;
    for (const child of batch) await walk(child, `${prefix}${entry.name}/`, out);
  }
}

$("#drop").addEventListener(
  "drop",
  async (e) => {
    const items = [...(e.dataTransfer?.items ?? [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!items.some((i) => i.isDirectory)) return; // normale Dateien übernimmt mountDrop
    e.preventDefault();
    e.stopPropagation();
    drop.input.closest(".drop-box")?.classList.remove("over");
    const out = [];
    try {
      for (const item of items) await walk(item, "", out);
      add(out);
    } catch (error) {
      jobs.add("Ordner").fail(`Ordner ließ sich nicht lesen: ${error.message}`);
    }
  },
  true,
);

const folder = /** @type {HTMLInputElement} */ ($("#folder"));
folder.addEventListener("change", () => {
  add([...folder.files].map((file) => ({ path: file.webkitRelativePath || file.name, file })));
  folder.value = "";
});

level.addEventListener("input", () => ($("#level-out").textContent = level.value));
clear.addEventListener("click", () => {
  entries = [];
  render();
});
$("#form").addEventListener("submit", (e) => e.preventDefault());

run.addEventListener("click", async () => {
  const name = zipFileName($("#name").value);
  const total = entries.reduce((n, e) => n + e.file.size, 0);
  const job = jobs.add(name).status(`${entries.length} Dateien, ${formatSize(total)} werden gepackt …`, "working");
  run.disabled = true;
  progress.hidden = false;
  progress.value = 0;
  try {
    await engine.ready;
    const blob = await engine.call(
      "zip",
      { entries, level: Number(level.value) },
      { onProgress: ({ done, total: t }) => (progress.value = t ? done / t : 1) },
    );
    job.status(`${entries.length} ${entries.length === 1 ? "Datei" : "Dateien"}, ${formatSize(total)} → ${formatSize(blob.size)}`);
    job.result(blob, name);
  } catch (error) {
    job.fail(error);
  } finally {
    progress.hidden = true;
    render();
  }
});

render();
