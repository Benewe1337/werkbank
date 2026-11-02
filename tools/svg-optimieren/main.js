import "../../src/shared/style.css";
import "../_bild/bild.css";
import { formatSaving, formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { byteLength } from "./svg.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
const SVG_TYPE = "image/svg+xml";

const readOptions = () => ({
  multipass: $("#multipass").checked,
  precision: Number($("#precision").value),
  pretty: $("#pretty").checked,
});

// Vorschau immer als <img> mit Blob-URL: Skripte im SVG laufen dort nicht.
const urls = new Map();
function showImage(img, text) {
  if (urls.has(img)) URL.revokeObjectURL(urls.get(img));
  const url = URL.createObjectURL(new Blob([text], { type: SVG_TYPE }));
  urls.set(img, url);
  img.src = url;
}

function showCompare(before, after) {
  showImage($("#before"), before);
  showImage($("#after"), after);
  $("#before-caption").textContent = `Vorher, ${formatSize(byteLength(before))}`;
  $("#after-caption").textContent = `Nachher, ${formatSize(byteLength(after))}`;
  $("#compare").hidden = false;
}

function copyButton(job, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button ghost";
  button.textContent = "Code kopieren";
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Kopiert";
    } catch {
      button.textContent = "Kopieren nicht erlaubt";
    }
    setTimeout(() => (button.textContent = "Code kopieren"), 2000);
  });
  job.el.querySelector(".job-actions").append(button);
}

async function process(name, text, job) {
  await engine.ready;
  const result = await engine.call("optimize", { text, options: readOptions() });
  const before = byteLength(text);
  const after = byteLength(result);
  job.status(`${formatSize(before)} → ${formatSize(after)} (${formatSaving(before, after)})`);
  if (after >= before) job.note("Nicht kleiner geworden: die Datei war schon gut optimiert.", "warn");
  job.result(new Blob([result], { type: SVG_TYPE }), outputName(name, "-optimiert", "svg"), { preview: true });
  copyButton(job, result);
  showCompare(text, result);
}

mountDrop($("#drop"), {
  accept: ".svg,image/svg+xml",
  label: "SVG-Dateien hier ablegen",
  hint: "mehrere gehen auch",
  onRejected: rejectInto(jobs, "SVG"),
  onFiles: (files) => processEach(files, jobs, async (file, job) => process(file.name, await file.text(), job)),
});

$("#run-code").addEventListener("click", async () => {
  const text = $("#code").value;
  const job = jobs.add("eingefügt.svg").status("wird optimiert …", "working");
  try {
    if (!text.trim()) throw new Error("Das Feld ist leer.");
    await process("eingefügt.svg", text, job);
  } catch (error) {
    job.fail(error);
  }
});
