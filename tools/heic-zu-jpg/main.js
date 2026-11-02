import "../../src/shared/style.css";
import "../_bild/bild.css";
import { baseName, formatSize } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { FORMATS, parseQuality } from "../_bild/format.js";
import { bindRangeValue, repeatable } from "../_bild/ui.js";
import { imageNames } from "./convert.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

const formatSelect = $("#format");
const quality = $("#quality");
bindRangeValue(quality, $("#quality-value"));
const syncQuality = () => (quality.disabled = formatSelect.value === "png");
formatSelect.addEventListener("change", syncQuality);
syncQuality();

const run = repeatable($("#again"), (files) =>
  processEach(files, jobs, async (file, job) => {
    const format = formatSelect.value;
    const q = parseQuality(quality.value);
    const buffer = await file.arrayBuffer();
    await engine.ready;
    const { images } = await engine.call("convert", { buffer, format, quality: q }, { transfer: [buffer] });
    const { ext, mime, label } = FORMATS[format];
    const names = imageNames(baseName(file.name), images.length, ext);
    const total = images.reduce((n, i) => n + i.bytes.byteLength, 0);
    const first = images[0];
    job.status(
      images.length === 1
        ? `${label}, ${first.width} × ${first.height}, ${formatSize(total)}`
        : `${images.length} Bilder als ${label}, zusammen ${formatSize(total)}`,
    );
    images.forEach((img, i) =>
      job.result(new Blob([img.bytes], { type: mime }), names[i], {
        label: images.length === 1 ? "Herunterladen" : `Bild ${i + 1}`,
        preview: i === 0,
      }),
    );
  }),
);

mountDrop($("#drop"), {
  accept: ".heic,.heif,image/heic,image/heif",
  label: "HEIC-Fotos hier ablegen",
  onRejected: rejectInto(jobs, "HEIC oder HEIF"),
  onFiles: run,
});
