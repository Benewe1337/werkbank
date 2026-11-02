import "../../src/shared/style.css";
import { formatSize, outputName } from "../../src/shared/format.js";
import { $, createJobList, mountDrop, rejectInto } from "../../src/shared/ui.js";
import { formatTime, inputNameFor, parseTime, VIDEO_ACCEPT } from "../_ffmpeg/logic.js";
import { mountEngineStatus, mountVideoPreview, runJob } from "../_ffmpeg/ui.js";
import { buildGifCommands, FPS_OPTIONS, validateGifOptions, WIDTH_OPTIONS } from "./args.js";

const form = $("#form");
const startInput = $("#start");
const durationInput = $("#duration");
const fpsSelect = $("#fps");
const widthSelect = $("#width");
const errorEl = $("#form-error");
const result = $("#result");
const resultImage = $("#result-image");
const jobs = createJobList($("#jobs"));
mountEngineStatus($("#engine"));

fpsSelect.append(...FPS_OPTIONS.map((f) => new Option(`${f}`, String(f))));
fpsSelect.value = "12";
widthSelect.append(...WIDTH_OPTIONS.map((w) => new Option(`${w} px`, String(w))));
widthSelect.value = "480";

let file = null;
let preview = null;
let resultUrl = null;

$("#take-start").addEventListener("click", () => {
  const t = preview?.currentTime;
  if (t != null) startInput.value = formatTime(t, { decimals: 2 });
});

mountDrop($("#drop"), {
  accept: VIDEO_ACCEPT,
  multiple: false,
  label: "Video hier ablegen",
  hint: "eins nach dem anderen",
  onRejected: rejectInto(jobs, "Video"),
  onFiles: async ([next]) => {
    preview?.destroy();
    file = next;
    preview = mountVideoPreview($("#preview"), file);
    form.hidden = false;
    startInput.value = "";
    errorEl.textContent = "";
    $("#take-start").disabled = !(await preview.playable);
  },
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!file) return;
  let options;
  try {
    options = validateGifOptions(
      {
        start: parseTime(startInput.value),
        duration: durationInput.value === "" ? null : Number(durationInput.value),
        fps: Number(fpsSelect.value),
        width: Number(widthSelect.value),
      },
      preview?.duration ?? null,
    );
  } catch (error) {
    errorEl.textContent = error.message;
    return;
  }
  errorEl.textContent = "";
  const current = file;
  const inputName = inputNameFor(current.name);
  const { commands, output, temp } = buildGifCommands({ inputName, ...options });
  const job = jobs.add(`${current.name}, ab ${formatTime(options.start)}, ${formatTime(options.duration)}`);
  try {
    const data = await runJob(job, {
      file: current,
      inputName,
      commands,
      output,
      temp,
      duration: options.duration,
      label: "GIF wird erstellt",
    });
    if (!data) return;
    const blob = new Blob([data], { type: "image/gif" });
    job.status(`bis ${options.width} px breit, ${options.fps} Bilder/s, ${formatSize(data.byteLength)}`);
    if (data.byteLength > 15 * 1024 * 1024) job.note("Das GIF ist groß. Kürzer, schmaler oder weniger Bilder pro Sekunde hilft.", "warn");
    job.result(blob, outputName(current.name, "", "gif"), { preview: true });
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    resultImage.src = resultUrl;
    result.hidden = false;
  } catch (error) {
    job.fail(error);
  }
});
