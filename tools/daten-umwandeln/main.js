import "../../src/shared/style.css";
import "../_codes/codes.css";
import { baseName, formatSize } from "../../src/shared/format.js";
import { $, downloadBlob, mountDrop } from "../../src/shared/ui.js";
import { copyText, debounce } from "../_codes/dom.js";
import { convert, EXTENSION, FORMAT_LABEL, MIME } from "./convert.js";

/** Größere Eingaben erst nach einer kurzen Pause umwandeln, damit das Tippen flüssig bleibt. */
const LARGE_INPUT = 200_000;
const input = /** @type {HTMLTextAreaElement} */ ($("#input"));
const output = /** @type {HTMLTextAreaElement} */ ($("#output"));
const status = $("#status");
const errorBox = $("#error");
const from = /** @type {HTMLSelectElement} */ ($("#from"));
const to = /** @type {HTMLSelectElement} */ ($("#to"));
const download = /** @type {HTMLButtonElement} */ ($("#download"));
const copy = /** @type {HTMLButtonElement} */ ($("#copy"));
let fileName = "";

function update() {
  const text = input.value;
  errorBox.hidden = true;
  if (!text.trim()) {
    output.value = "";
    status.textContent = "";
    download.disabled = copy.disabled = true;
    return;
  }
  try {
    const result = convert(text, {
      from: from.value || null,
      to: to.value,
      pretty: !$("#minify").checked,
      delimiter: $("#delimiter").value || undefined,
      outDelimiter: $("#out-delimiter").value,
      typed: $("#typed").checked,
      fileName,
    });
    output.value = result.output;
    const detected = from.value ? "" : " (erkannt)";
    status.textContent = `${FORMAT_LABEL[result.from]}${detected} → ${FORMAT_LABEL[to.value]}, ${formatSize(new Blob([result.output]).size)}`;
    download.disabled = copy.disabled = false;
  } catch (error) {
    output.value = "";
    status.textContent = "";
    errorBox.textContent = error instanceof Error ? error.message : String(error);
    errorBox.hidden = false;
    download.disabled = copy.disabled = true;
  }
}

const schedule = debounce(update, 120);
const scheduleLarge = debounce(update, 500);
input.addEventListener("input", () => {
  fileName = "";
  (input.value.length > LARGE_INPUT ? scheduleLarge : schedule)();
});
$("#form").addEventListener("change", update);
$("#form").addEventListener("submit", (e) => e.preventDefault());

mountDrop($("#drop"), {
  accept: ".json,.geojson,.csv,.tsv,.txt,.yaml,.yml,.xml,application/json,text/csv,text/plain,application/xml,text/xml",
  multiple: false,
  label: "Datei hier ablegen",
  hint: "JSON, CSV, YAML oder XML",
  onRejected: (file) => {
    errorBox.textContent = `${file.name}: Passt nicht (erwartet: JSON, CSV, YAML oder XML).`;
    errorBox.hidden = false;
  },
  onFiles: async ([file]) => {
    try {
      input.value = await file.text();
      fileName = file.name;
      from.value = "";
      update();
    } catch {
      errorBox.textContent = `${file.name} ließ sich nicht lesen.`;
      errorBox.hidden = false;
    }
  },
});

download.addEventListener("click", () => {
  const ext = EXTENSION[to.value];
  const name = `${fileName ? baseName(fileName) : "daten"}.${ext}`;
  downloadBlob(new Blob([output.value], { type: `${MIME[to.value]};charset=utf-8` }), name);
});
copy.addEventListener("click", () => copyText(output.value, copy));
