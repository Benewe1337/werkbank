import "../../src/shared/style.css";
import "../_bild/bild.css";
import { formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, rejectInto } from "../../src/shared/ui.js";
import { describeProgress } from "./remove.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready, "Rechenkern");

let previewUrl = null;
function showPreview(blob) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  $("#preview-img").src = previewUrl;
  $("#preview").hidden = false;
}

// Nacheinander statt parallel: das Modell braucht viel Speicher.
let queue = Promise.resolve();

function enqueue(file) {
  const job = jobs.add(file.name).status(`${formatSize(file.size)}, wartet …`, "working");
  queue = queue.then(async () => {
    try {
      job.status("Wird vorbereitet …");
      const buffer = await file.arrayBuffer();
      await engine.ready;
      const started = performance.now();
      const { bytes, width, height, transparent } = await engine.call("remove", { buffer }, {
        transfer: [buffer],
        onProgress: (p) => job.status(describeProgress(p)),
      });
      const seconds = ((performance.now() - started) / 1000).toFixed(1).replace(".", ",");
      const blob = new Blob([bytes], { type: "image/png" });
      job.status(`PNG mit Transparenz, ${width} × ${height}, ${formatSize(bytes.byteLength)}, ${seconds} s`);
      if (transparent < 0.02) job.note("Kaum Hintergrund erkannt. Bei Bildern ohne klares Motiv klappt das Freistellen schlecht.", "warn");
      if (transparent > 0.98) job.note("Fast alles wurde entfernt. Das Motiv hebt sich wohl zu wenig vom Hintergrund ab.", "warn");
      job.result(blob, outputName(file.name, "-freigestellt", "png"), { preview: true });
      showPreview(blob);
    } catch (error) {
      job.fail(error);
    }
  });
}

mountDrop($("#drop"), {
  accept: ".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif",
  label: "Foto hier ablegen",
  hint: "JPG, PNG, WebP oder AVIF",
  onRejected: rejectInto(jobs, "JPG, PNG, WebP oder AVIF"),
  onFiles: (files) => files.forEach(enqueue),
});
