import "../../src/shared/style.css";
import { outputName } from "../../src/shared/format.js";
import { $, createJobList, mountDrop, rejectInto } from "../../src/shared/ui.js";
import { formatTime, inputNameFor, parseTime, VIDEO_ACCEPT } from "../_ffmpeg/logic.js";
import { mountEngineStatus, mountVideoPreview, runJob, sizeLabel } from "../_ffmpeg/ui.js";
import { buildTrimArgs, validateRange } from "./args.js";

const form = $("#form");
const startInput = $("#start");
const endInput = $("#end");
const errorEl = $("#form-error");
const modeHint = $("#mode-hint");
const jobs = createJobList($("#jobs"));
mountEngineStatus($("#engine"));

const HINTS = {
  fast: "Schnell und ohne Qualitätsverlust. Geschnitten wird am nächsten Schlüsselbild davor, der Anfang kann deshalb etwas früher liegen.",
  exact: "Bildgenau, dafür wird das Video neu kodiert. Das dauert etwa so lange wie beim Verkleinern.",
};

let file = null;
let preview = null;

const mode = () => form.elements.mode.value;
const syncHint = () => (modeHint.textContent = HINTS[mode()]);
for (const radio of form.elements.mode) radio.addEventListener("change", syncHint);
syncHint();

function take(input) {
  const t = preview?.currentTime;
  if (t == null) return;
  input.value = formatTime(t, { decimals: 2 });
  errorEl.textContent = "";
}
$("#take-start").addEventListener("click", () => take(startInput));
$("#take-end").addEventListener("click", () => take(endInput));

mountDrop($("#drop"), {
  accept: VIDEO_ACCEPT,
  multiple: false,
  label: "Video hier ablegen",
  onRejected: rejectInto(jobs, "Video"),
  onFiles: async ([next]) => {
    preview?.destroy();
    file = next;
    preview = mountVideoPreview($("#preview"), file);
    form.hidden = false;
    startInput.value = "";
    endInput.value = "";
    errorEl.textContent = "";
    const playable = await preview.playable;
    for (const id of ["#take-start", "#take-end"]) $(id).disabled = !playable;
  },
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!file) return;
  let range;
  try {
    range = validateRange(parseTime(startInput.value), parseTime(endInput.value), preview?.duration ?? null);
  } catch (error) {
    errorEl.textContent = error.message;
    return;
  }
  errorEl.textContent = "";
  const current = file;
  const chosenMode = mode();
  const inputName = inputNameFor(current.name);
  const { args, output, mime, ext } = buildTrimArgs({ inputName, fileName: current.name, ...range, mode: chosenMode });
  const label = `${formatTime(range.start)} bis ${range.end != null ? formatTime(range.end) : "Schluss"}`;
  const job = jobs.add(`${current.name}, ${label}`);
  try {
    const data = await runJob(job, {
      file: current,
      inputName,
      commands: [args],
      output,
      duration: range.length ?? undefined,
      label: chosenMode === "fast" ? "Wird geschnitten" : "Wird geschnitten und neu kodiert",
    });
    if (!data) return;
    job.status(`${chosenMode === "fast" ? "Schnell" : "Genau"} geschnitten, ${sizeLabel(current.size, data.byteLength)}`);
    const suffix = `-${formatTime(range.start, { decimals: 0 }).replace(/:/g, "-")}`;
    job.result(new Blob([data], { type: mime }), outputName(current.name, `-schnitt${suffix}`, ext));
  } catch (error) {
    job.fail(error);
  }
});
