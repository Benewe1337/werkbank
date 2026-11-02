import "../../src/shared/style.css";
import "../_pdf/pdf.css";
import { formatSaving, formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { pdfBlob } from "../_pdf/ui.js";
import { PRESETS } from "./compress.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

const preset = $("#preset");
const dpi = $("#dpi");
const quality = $("#quality");
const qualityOut = $("#quality-out");

preset.addEventListener("change", () => {
  const p = PRESETS[preset.value];
  if (!p) return;
  dpi.value = p.dpi;
  quality.value = p.quality;
  qualityOut.value = p.quality;
});
const custom = () => {
  qualityOut.value = quality.value;
  const match = Object.entries(PRESETS).find(([, p]) => p.dpi === Number(dpi.value) && p.quality === Number(quality.value));
  preset.value = match ? match[0] : "eigene";
};
dpi.addEventListener("input", custom);
quality.addEventListener("input", custom);

function settings() {
  const value = Number(dpi.value);
  if (!Number.isFinite(value) || value < 36 || value > 600) throw new Error("Die Auflösung muss zwischen 36 und 600 dpi liegen.");
  return { dpi: value, quality: Number(quality.value), images: $("#images").checked };
}

mountDrop($("#drop"), {
  accept: ".pdf,application/pdf",
  label: "PDFs hier ablegen",
  hint: "mehrere gehen auch",
  onRejected: rejectInto(jobs, "PDF"),
  onFiles: (files) =>
    processEach(files, jobs, async (file, job) => {
      const options = settings();
      const buffer = await file.arrayBuffer();
      await engine.ready;
      const r = await engine.call("compress", { buffer, ...options }, { transfer: [buffer] });
      if (r.kept) {
        job.status(`${formatSize(r.before)}, ließ sich nicht weiter verkleinern`, "done");
        job.note("Das Ergebnis wäre nicht kleiner geworden. Du bekommst das Original zurück.", "warn");
      } else {
        job.status(`${formatSize(r.before)} → ${formatSize(r.after)} (${formatSaving(r.before, r.after)})`);
        if (r.imagesTotal) job.note(`${r.imagesRewritten} von ${r.imagesTotal} Bildern neu kodiert.`);
      }
      job.result(pdfBlob(r.bytes), outputName(file.name, r.kept ? "" : "-klein", "pdf"));
    }),
});
