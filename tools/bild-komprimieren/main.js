import "../../src/shared/style.css";
import "../_bild/bild.css";
import { formatSaving, formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { FORMATS, RASTER_ACCEPT, parseQuality } from "../_bild/format.js";
import { bindRangeValue, repeatable } from "../_bild/ui.js";
import { formatLabel } from "./compress.js";

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
    const target = formatSelect.value;
    const q = parseQuality(quality.value);
    const buffer = await file.arrayBuffer();
    await engine.ready;
    const { bytes, format, width, height, lossless } = await engine.call("compress", { buffer, target, quality: q }, { transfer: [buffer] });
    const blob = new Blob([bytes], { type: FORMATS[format].mime });
    const how = lossless ? "verlustfrei" : `Qualität ${q}`;
    job.status(`${formatLabel(format)}, ${width} × ${height}, ${how}: ${formatSize(file.size)} → ${formatSize(bytes.byteLength)} (${formatSaving(file.size, bytes.byteLength)})`);
    if (bytes.byteLength >= file.size) {
      job.note("Das Ergebnis ist nicht kleiner als das Original. Behalte besser das Original oder probier ein anderes Format.", "warn");
    }
    job.result(blob, outputName(file.name, "-klein", FORMATS[format].ext), { preview: true });
  }),
);

mountDrop($("#drop"), {
  accept: RASTER_ACCEPT,
  label: "Bilder hier ablegen",
  hint: "JPG, PNG, WebP oder AVIF",
  onRejected: rejectInto(jobs, "JPG, PNG, WebP oder AVIF"),
  onFiles: run,
});
