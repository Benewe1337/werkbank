import "../../src/shared/style.css";
import { outputName } from "../../src/shared/format.js";
import { $, createJobList, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { AUDIO_ACCEPT, inputNameFor, VIDEO_ACCEPT } from "../_ffmpeg/logic.js";
import { mountEngineStatus, runJob, sizeLabel } from "../_ffmpeg/ui.js";
import { BITRATES, buildAudioArgs, FORMATS } from "./args.js";

const formatSelect = $("#format");
const bitrateSelect = $("#bitrate");
const bitrateHint = $("#bitrate-hint");
const jobs = createJobList($("#jobs"));
mountEngineStatus($("#engine"));

formatSelect.append(...Object.entries(FORMATS).map(([value, f]) => new Option(f.label, value)));
bitrateSelect.append(...BITRATES.map((b) => new Option(`${b} kbit/s`, String(b))));
bitrateSelect.value = "192";

function syncBitrate() {
  const lossless = !FORMATS[formatSelect.value].bitrate;
  bitrateSelect.disabled = lossless;
  bitrateSelect.closest(".field").hidden = lossless;
  bitrateHint.hidden = !lossless;
}
formatSelect.addEventListener("change", syncBitrate);
syncBitrate();

mountDrop($("#drop"), {
  accept: `${AUDIO_ACCEPT},${VIDEO_ACCEPT}`,
  label: "Audio oder Video hier ablegen",
  hint: "mehrere gehen auch",
  onRejected: rejectInto(jobs, "Audio- oder Videodatei"),
  onFiles: (files) =>
    processEach(files, jobs, async (file, job) => {
      // Optionen beim Ablegen festhalten, auch wenn die Datei noch in der Warteschlange steht.
      const format = formatSelect.value;
      const inputName = inputNameFor(file.name);
      const { args, output, mime, ext } = buildAudioArgs({ inputName, format, bitrate: Number(bitrateSelect.value) });
      const data = await runJob(job, { file, inputName, commands: [args], output, label: `Wird in ${FORMATS[format].label} umgewandelt` });
      if (!data) return;
      job.status(`${FORMATS[format].label}, ${sizeLabel(file.size, data.byteLength)}`);
      job.result(new Blob([data], { type: mime }), outputName(file.name, "", ext));
    }),
});
