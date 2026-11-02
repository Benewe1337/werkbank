import "../../src/shared/style.css";
import "../_codes/codes.css";
import "./style.css";
import { formatSize } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, engineStatus, mountDrop } from "../../src/shared/ui.js";
import { copyButton, debounce, h } from "../_codes/dom.js";
import { ALGORITHMS, algorithmsForLength, findMatches, normalizeExpected } from "./hashing.js";

const DEFAULT_ON = new Set(["md5", "sha1", "sha256", "sha512"]);
const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
engineStatus($("#engine"), engine.ready);

const algorithmsBox = $("#algorithms");
const expected = /** @type {HTMLInputElement} */ ($("#expected"));
const verdict = $("#verdict");
const resultsList = $("#results");
const label = Object.fromEntries(ALGORITHMS.map((a) => [a.id, a.label]));

for (const a of ALGORITHMS) {
  algorithmsBox.append(h("label", { class: "field check" }, h("input", { type: "checkbox", name: "algo", value: a.id, checked: DEFAULT_ON.has(a.id) }), a.label));
}
const chosen = () => [...algorithmsBox.querySelectorAll("input:checked")].map((i) => i.value);

/** @type {{name: string, hashes: Record<string, string>, rows: Map<string, HTMLElement>}[]} */
const done = [];

function updateVerdict() {
  for (const f of done) for (const row of f.rows.values()) row.classList.remove("is-match");
  const want = normalizeExpected(expected.value);
  if (!want) {
    verdict.hidden = true;
    return;
  }
  verdict.hidden = false;
  if (done.length === 0) {
    verdict.className = "hint";
    verdict.textContent = "Wähle eine Datei, dann wird verglichen.";
    return;
  }
  const matches = findMatches(want, done);
  if (matches.length) {
    for (const m of matches) done.find((f) => f.name === m.file)?.rows.get(m.algorithm)?.classList.add("is-match");
    verdict.className = "match";
    verdict.textContent = `✓ Stimmt überein: ${matches.map((m) => `${label[m.algorithm]} von ${m.file}`).join(", ")}.`;
    return;
  }
  const possible = algorithmsForLength(want.length);
  const missing = possible.filter((p) => !chosen().some((id) => label[id] === p));
  verdict.className = "mismatch";
  verdict.textContent =
    `✗ Keine Übereinstimmung.` +
    (possible.length ? ` Der Wert hat die Länge von ${possible.join("/")}.` : " Die Länge passt zu keinem Verfahren.") +
    (missing.length && missing.length === possible.length ? ` Schalte ${missing.join(" oder ")} ein und wähle die Datei erneut.` : "");
}

expected.addEventListener("input", debounce(updateVerdict, 100));

async function hashFile(file) {
  const ids = chosen();
  const progress = h("progress", { class: "progress", max: 1, value: 0 });
  const state = h("span", { class: "result-meta", text: `${formatSize(file.size)}, wird berechnet …` });
  const item = h("li", { class: "result-item", "data-state": "working" }, h("strong", { text: file.name }), state, progress);
  resultsList.prepend(item);
  if (ids.length === 0) {
    state.textContent = "Wähle mindestens ein Verfahren.";
    item.dataset.state = "error";
    progress.remove();
    return;
  }
  const started = performance.now();
  try {
    await engine.ready;
    const hashes = await engine.call("hash", { file, ids }, { onProgress: ({ done: d, total }) => (progress.value = total ? d / total : 1) });
    const seconds = (performance.now() - started) / 1000;
    state.textContent = `${formatSize(file.size)}, ${seconds.toFixed(1).replace(".", ",")} s`;
    progress.remove();
    const rows = new Map();
    const dl = h("dl", { class: "pairs hashes" });
    for (const id of ids) {
      const row = h("dd", {}, h("span", { class: "mono", text: hashes[id] }), copyButton(() => hashes[id], "Kopieren", `${label[id]} kopieren`));
      rows.set(id, row);
      dl.append(h("dt", { text: label[id] }), row);
    }
    item.append(dl);
    item.dataset.state = "done";
    done.push({ name: file.name, hashes, rows });
    updateVerdict();
  } catch (error) {
    progress.remove();
    item.dataset.state = "error";
    state.textContent = `${file.name} ließ sich nicht lesen: ${error.message}`;
  }
}

mountDrop($("#drop"), {
  label: "Dateien hier ablegen",
  hint: "beliebig groß, mehrere gehen auch",
  onFiles: async (files) => {
    for (const file of files) await hashFile(file);
  },
});
