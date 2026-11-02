import "../../src/shared/style.css";
import "../_bild/bild.css";
import { formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { FORMATS, RASTER_ACCEPT, parseQuality } from "../_bild/format.js";
import { bindRangeValue, repeatable } from "../_bild/ui.js";
import { targetSize } from "./size.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

const unit = $("#unit");
const width = $("#width");
const height = $("#height");
const keep = $("#keep");
const formatSelect = $("#format");
const quality = $("#quality");
bindRangeValue(quality, $("#quality-value"));

const syncQuality = () => (quality.disabled = formatSelect.value === "png");
formatSelect.addEventListener("change", syncQuality);
syncQuality();

// Prozent mit gehaltenem Seitenverhältnis braucht nur einen Wert.
const syncUnit = () => {
  const percent = unit.value === "percent";
  height.disabled = percent && keep.checked;
  if (percent && !width.value) width.value = "50";
};
unit.addEventListener("change", () => {
  width.value = unit.value === "percent" ? "50" : "1200";
  height.value = "";
  syncUnit();
});
keep.addEventListener("change", syncUnit);
syncUnit();

const readOptions = () => {
  const opts = {
    unit: unit.value,
    width: width.value,
    height: height.disabled ? "" : height.value,
    keepRatio: keep.checked,
    target: formatSelect.value,
    quality: parseQuality(quality.value),
  };
  targetSize({ width: 1000, height: 1000 }, opts); // Eingaben früh prüfen, Fehler landen am Job
  return opts;
};

const run = repeatable($("#again"), (files) =>
  processEach(files, jobs, async (file, job) => {
    const opts = readOptions();
    const buffer = await file.arrayBuffer();
    await engine.ready;
    const { bytes, format, from, to } = await engine.call("resize", { buffer, ...opts }, { transfer: [buffer] });
    job.status(`${from.width} × ${from.height} → ${to.width} × ${to.height}, ${FORMATS[format].label}, ${formatSize(bytes.byteLength)}`);
    if (to.width > from.width || to.height > from.height) job.note("Vergrößert: Details kommen dadurch nicht hinzu, das Bild wird weicher.", "warn");
    job.result(new Blob([bytes], { type: FORMATS[format].mime }), outputName(file.name, `-${to.width}x${to.height}`, FORMATS[format].ext), {
      preview: true,
    });
  }),
);

mountDrop($("#drop"), {
  accept: RASTER_ACCEPT,
  label: "Bilder hier ablegen",
  hint: "JPG, PNG, WebP oder AVIF",
  onRejected: rejectInto(jobs, "JPG, PNG, WebP oder AVIF"),
  onFiles: run,
});
