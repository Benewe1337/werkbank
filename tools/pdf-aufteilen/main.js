import "../../src/shared/style.css";
import "../_pdf/pdf.css";
import { baseName, formatSize } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, rejectInto } from "../../src/shared/ui.js";
import { freshJobList, pdfBlob, showForMode } from "../_pdf/ui.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
engineStatus($("#engine"), engine.ready);

const mode = $("#mode");
const button = $("#run");
const info = $("#file");
let jobsEl = $("#jobs");
let jobs = createJobList(jobsEl);
/** @type {{file: File, buffer: ArrayBuffer, pages: number} | null} */
let current = null;

const update = () => {
  showForMode($("#options"), mode.value);
  button.textContent = mode.value === "extract" ? "Seiten extrahieren" : "Aufteilen";
  button.disabled = !current;
};
mode.addEventListener("change", update);
update();

function showFile() {
  info.replaceChildren();
  const name = document.createElement("strong");
  name.textContent = current.file.name;
  info.append(name, `, ${current.pages} Seiten, ${formatSize(current.file.size)}`);
}

mountDrop($("#drop"), {
  accept: ".pdf,application/pdf",
  multiple: false,
  label: "PDF hier ablegen",
  onRejected: (f) => rejectInto(jobs, "PDF")(f),
  onFiles: async ([file]) => {
    current = null;
    update();
    info.textContent = `${file.name} wird gelesen …`;
    try {
      const buffer = await file.arrayBuffer();
      await engine.ready;
      const { pages } = await engine.call("count", { buffer: buffer.slice(0) });
      current = { file, buffer, pages };
      showFile();
    } catch (error) {
      info.textContent = "";
      jobs.add(file.name).fail(error);
    }
    update();
  },
});

button.addEventListener("click", async () => {
  if (!current) return;
  ({ el: jobsEl, jobs } = freshJobList(jobsEl));
  const { file, buffer } = current;
  const base = baseName(file.name);
  const status = jobs.add(file.name).status("wird aufgeteilt …", "working");
  button.disabled = true;
  try {
    const value = mode.value;
    const ranges = value === "extract" ? $("#pages").value : $("#ranges").value;
    const { parts } = await engine.call("split", { buffer: buffer.slice(0), mode: value, n: Number($("#n").value), ranges });
    const total = parts.reduce((sum, p) => sum + p.pages, 0);
    status.status(parts.length === 1 ? `${total} Seiten in einer Datei` : `${parts.length} Dateien, ${total} Seiten`, "done");
    // Umgekehrt anlegen, damit die erste Datei oben steht.
    for (const part of [...parts].reverse()) {
      const name = value === "extract" ? `${base}-auszug.pdf` : `${base}-${part.pages === 1 ? "seite-" : ""}${part.label}.pdf`;
      jobs
        .add(name)
        .status(`${part.pages} ${part.pages === 1 ? "Seite" : "Seiten"}, ${formatSize(part.bytes.byteLength)}`)
        .result(pdfBlob(part.bytes), name);
    }
    jobsEl.prepend(status.el);
  } catch (error) {
    status.fail(error);
  } finally {
    update();
  }
});
