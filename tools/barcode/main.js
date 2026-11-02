import "../../src/shared/style.css";
import "../_codes/codes.css";
import "./style.css";
import wasmUrl from "zxing-wasm/writer/zxing_writer.wasm?url";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import { $, downloadBlob, engineStatus } from "../../src/shared/ui.js";
import { debounce, h } from "../_codes/dom.js";
import { explainWriterError, FORMATS, validate } from "./validate.js";

// Die .wasm kommt aus dem eigenen Build, nicht vom CDN (Standard von zxing-wasm).
const ready = prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) }, fireImmediately: true });
engineStatus($("#engine"), ready);

const formatSelect = /** @type {HTMLSelectElement} */ ($("#format"));
const textInput = /** @type {HTMLInputElement} */ ($("#text"));
const hrt = /** @type {HTMLInputElement} */ ($("#hrt"));
const preview = $("#preview");
const note = $("#note");
const errorBox = $("#error");
const downloads = [$("#download-svg"), $("#download-png")];

formatSelect.append(...FORMATS.map((f) => h("option", { value: f.id, text: f.label })));
textInput.value = FORMATS[0].example;

/** @type {{svg: string, value: string, format: string} | null} */
let current = null;
let previewUrl = null;
let run = 0;

function fail(message) {
  current = null;
  preview.replaceChildren();
  note.textContent = "";
  errorBox.textContent = message;
  errorBox.hidden = false;
  for (const b of downloads) b.disabled = true;
}

async function update() {
  const id = ++run;
  const format = formatSelect.value;
  const meta = FORMATS.find((f) => f.id === format);
  hrt.disabled = !meta.linear;
  let checked;
  try {
    checked = validate(format, textInput.value);
  } catch (error) {
    return fail(error.message);
  }
  await ready;
  const result = await writeBarcode(checked.value, { format, scale: 1, addHRT: meta.linear && hrt.checked });
  if (id !== run) return;
  if (result.error) return fail(explainWriterError(result.error));
  errorBox.hidden = true;
  current = { svg: result.svg, value: checked.value, format };
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml" }));
  const img = h("img", { src: previewUrl, alt: `${meta.label}: ${checked.value}`, class: "barcode-preview" });
  preview.replaceChildren(img);
  note.textContent = [`${meta.label}: ${checked.value}`, checked.note].filter(Boolean).join(". ");
  for (const b of downloads) b.disabled = false;
}

const schedule = debounce(update, 120);
textInput.addEventListener("input", schedule);
hrt.addEventListener("change", update);
formatSelect.addEventListener("change", () => {
  const meta = FORMATS.find((f) => f.id === formatSelect.value);
  try {
    validate(meta.id, textInput.value);
  } catch {
    textInput.value = meta.example;
  }
  update();
});
$("#form").addEventListener("submit", (e) => e.preventDefault());

const fileBase = () => `barcode-${current.format.toLowerCase()}`;

$("#download-svg").addEventListener("click", () => {
  if (current) downloadBlob(new Blob([current.svg], { type: "image/svg+xml" }), `${fileBase()}.svg`);
});

$("#download-png").addEventListener("click", async () => {
  if (!current) return;
  const meta = FORMATS.find((f) => f.id === current.format);
  const scale = Number(/** @type {HTMLSelectElement} */ ($("#scale")).value);
  const result = await writeBarcode(current.value, { format: current.format, scale, addHRT: meta.linear && hrt.checked });
  if (result.error || !result.image) return fail(explainWriterError(result.error || "kein Bild"));
  downloadBlob(result.image, `${fileBase()}.png`);
});

update();
