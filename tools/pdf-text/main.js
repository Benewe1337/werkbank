import "../../src/shared/style.css";
import "../_pdf/pdf.css";
import "./style.css";
import { outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

const preview = $("#preview");
const textEl = $("#text");
const copyStatus = $("#copy-status");

function show(name, text, likelyScanned) {
  $("#preview-title").textContent = name;
  textEl.textContent = text || "(kein Text gefunden)";
  copyStatus.textContent = "";
  preview.hidden = false;
  $("#copy").disabled = !text;
  $("#scan-name").textContent = name;
  $("#scan-hint").hidden = !likelyScanned;
}

$("#copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(textEl.textContent);
    copyStatus.textContent = "Kopiert.";
  } catch {
    // Ohne Zugriff auf die Zwischenablage: Text markieren, damit Strg+C reicht.
    getSelection().selectAllChildren(textEl);
    copyStatus.textContent = "Text markiert, jetzt mit Strg+C bzw. ⌘+C kopieren.";
  }
});

mountDrop($("#drop"), {
  accept: ".pdf,application/pdf",
  label: "PDF hier ablegen",
  hint: "mehrere gehen auch",
  onRejected: rejectInto(jobs, "PDF"),
  onFiles: (files) =>
    processEach(files, jobs, async (file, job) => {
      const buffer = await file.arrayBuffer();
      await engine.ready;
      const { pages, text, chars, likelyScanned } = await engine.call("extract", { buffer }, { transfer: [buffer] });
      job.status(`${pages.length} ${pages.length === 1 ? "Seite" : "Seiten"}, ${chars.toLocaleString("de")} Zeichen`);
      if (likelyScanned) job.note("Kaum Text gefunden. Für gescannte PDFs gibt es die Texterkennung (OCR).", "warn");
      const display = () => show(file.name, text, likelyScanned);
      const view = document.createElement("button");
      view.type = "button";
      view.className = "button ghost";
      view.textContent = "Anzeigen";
      view.addEventListener("click", display);
      job.result(new Blob([text], { type: "text/plain;charset=utf-8" }), outputName(file.name, "", "txt"), {
        label: "Als .txt laden",
      });
      job.el.querySelector(".job-actions").prepend(view);
      display();
    }),
});
