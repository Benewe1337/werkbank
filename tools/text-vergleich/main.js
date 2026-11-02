import "../../src/shared/style.css";
import "./style.css";
import { connect } from "../../src/shared/worker-client.js";
import { $, downloadBlob } from "../../src/shared/ui.js";
import { decodeText, textBlob } from "../_text/text.js";
import { summarize, toRows } from "./compare.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const before = $("#before");
const after = $("#after");
const run = $("#run");
const output = $("#output");
const result = $("#result");
const errorEl = $("#error");
const names = { before: "original.txt", after: "geaendert.txt" };

for (const [key, area] of [["before", before], ["after", after]]) {
  const input = $(`#${key}-file`);
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    try {
      area.value = decodeText(await file.arrayBuffer());
      names[key] = file.name;
      showError("");
    } catch (error) {
      showError(`${file.name}: ${error.message}`);
    }
  });
}

function showError(message) {
  errorEl.hidden = !message;
  errorEl.textContent = message;
}

/** Ein Zeilenstück als DOM, nie per innerHTML: Nutzertext bleibt Text. */
function mark(kind, text) {
  if (kind === "same") return document.createTextNode(text);
  const el = document.createElement(kind === "added" ? "ins" : "del");
  el.textContent = text;
  return el;
}

const SIGN = { added: "+", removed: "−", same: "" };
const SR = { added: "hinzugefügt: ", removed: "entfernt: ", same: "" };

function renderLines(parts) {
  const table = document.createElement("table");
  table.className = "diff-lines";
  const body = document.createElement("tbody");
  for (const row of toRows(parts)) {
    const tr = document.createElement("tr");
    tr.dataset.kind = row.kind;
    const cells = [row.left ?? "", row.right ?? "", SIGN[row.kind]].map((v) => {
      const td = document.createElement("td");
      td.className = "diff-gutter";
      td.textContent = String(v);
      td.ariaHidden = "true";
      return td;
    });
    const text = document.createElement("td");
    text.className = "diff-text";
    if (row.kind !== "same") {
      const sr = document.createElement("span");
      sr.className = "visually-hidden";
      sr.textContent = SR[row.kind];
      text.append(sr);
    }
    text.append(mark(row.kind, row.text || " "));
    tr.append(...cells, text);
    body.append(tr);
  }
  table.append(body);
  return table;
}

function renderWords(parts) {
  const pre = document.createElement("div");
  pre.className = "diff-words";
  pre.append(...parts.map((p) => mark(p.kind, p.value)));
  return pre;
}

async function compare() {
  showError("");
  run.disabled = true;
  try {
    const options = {
      mode: $("#mode").value,
      ignoreCase: $("#ignore-case").checked,
      ignoreWhitespace: $("#ignore-space").checked,
    };
    await engine.ready;
    const { mode, parts, stats } = await engine.call("compare", { before: before.value, after: after.value, options });
    $("#summary").textContent = summarize(stats, mode);
    result.replaceChildren(mode === "lines" ? renderLines(parts) : renderWords(parts));
    output.hidden = false;
  } catch (error) {
    output.hidden = true;
    showError(error.message);
  } finally {
    run.disabled = false;
  }
}

run.addEventListener("click", compare);
for (const area of [before, after]) {
  area.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      compare();
    }
  });
}

$("#patch").addEventListener("click", async () => {
  try {
    const text = await engine.call("patch", { before: before.value, after: after.value, nameA: names.before, nameB: names.after });
    downloadBlob(textBlob(text, "text/x-diff"), "unterschiede.diff");
  } catch (error) {
    showError(error.message);
  }
});
