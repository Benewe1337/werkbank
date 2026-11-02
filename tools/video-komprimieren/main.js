import "../../src/shared/style.css";
import { formatSaving, outputName } from "../../src/shared/format.js";
import { $, createJobList, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { inputNameFor, VIDEO_ACCEPT } from "../_ffmpeg/logic.js";
import { mountEngineStatus, runJob, sizeLabel } from "../_ffmpeg/ui.js";
import {
  buildCompressArgs,
  CONTAINERS,
  crfFor,
  QUALITY_DEFAULT,
  QUALITY_MAX,
  QUALITY_MIN,
  RESOLUTIONS,
} from "./args.js";

const container = $("#container");
const resolution = $("#resolution");
const quality = $("#quality");
const qualityValue = $("#quality-value");
const audio = $("#audio");
const jobs = createJobList($("#jobs"));
mountEngineStatus($("#engine"));

container.append(...Object.entries(CONTAINERS).map(([v, c]) => new Option(c.label, v)));
resolution.append(...RESOLUTIONS.map((r) => new Option(r.label, String(r.value))));
resolution.value = "1080";
Object.assign(quality, { min: QUALITY_MIN, max: QUALITY_MAX, value: QUALITY_DEFAULT });

function qualityText() {
  const q = Number(quality.value);
  const word = q <= 3 ? "klein" : q >= 8 ? "hoch" : "mittel";
  qualityValue.textContent = `${q} von ${QUALITY_MAX}, ${word} (CRF ${crfFor(container.value, q)})`;
  quality.setAttribute("aria-valuetext", `${q} von ${QUALITY_MAX}, ${word}`);
}
quality.addEventListener("input", qualityText);
container.addEventListener("change", qualityText);
qualityText();

mountDrop($("#drop"), {
  accept: VIDEO_ACCEPT,
  label: "Video hier ablegen",
  hint: "mehrere gehen auch, sie laufen nacheinander",
  onRejected: rejectInto(jobs, "Video"),
  onFiles: (files) =>
    processEach(files, jobs, async (file, job) => {
      const inputName = inputNameFor(file.name);
      const { args, output, mime, ext } = buildCompressArgs({
        inputName,
        container: container.value,
        quality: Number(quality.value),
        maxHeight: Number(resolution.value),
        audio: audio.checked,
      });
      const data = await runJob(job, { file, inputName, commands: [args], output, label: "Wird kodiert" });
      if (!data) return;
      job.status(`${sizeLabel(file.size, data.byteLength)} (${formatSaving(file.size, data.byteLength)})`);
      if (data.byteLength >= file.size) job.note("Die neue Datei ist nicht kleiner. Probier eine geringere Qualität oder Auflösung.", "warn");
      job.result(new Blob([data], { type: mime }), outputName(file.name, "-klein", ext));
    }),
});
