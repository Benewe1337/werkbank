import "../../src/shared/style.css";
import "../_bild/bild.css";
import "./style.css";
import exifr from "exifr";
import { formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { FORMATS, detectFormat } from "../_bild/format.js";
import { formatCoordinate, readMetadata, strategy, stripLossless, summarize } from "./meta.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);
const keepOrientation = $("#keep-orientation");

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

function table(rows) {
  const wrap = el("div", "table-wrap");
  const t = el("table", "data");
  const body = el("tbody");
  for (const [k, v] of rows) {
    const tr = el("tr");
    tr.append(el("td", "", k), el("td", "", v));
    body.append(tr);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}

/** Gefundene Metadaten unter dem Job anzeigen, GPS-Position deutlich hervorgehoben. */
function showMetadata(job, summary) {
  const box = el("div", "job-meta");
  if (summary.gps) {
    const alert = el("div", "alert gps");
    alert.setAttribute("role", "alert");
    alert.append(
      el("strong", "", "GPS-Position gespeichert"),
      el("p", "", `${formatCoordinate(summary.gps.latitude, ["N", "S"])}, ${formatCoordinate(summary.gps.longitude, ["O", "W"])}`),
      el("p", "hint", "Wer das Original bekommt, kann sehen, wo es aufgenommen wurde."),
    );
    box.append(alert);
  }
  if (summary.rows.length) box.append(table(summary.rows));
  if (summary.all.length) {
    const details = el("details");
    details.append(el("summary", "", `Alle ${summary.all.length} Einträge anzeigen`), table(summary.all));
    box.append(details);
  }
  if (box.childElementCount) job.el.append(box);
}

async function clean(bytes) {
  const format = detectFormat(bytes);
  const how = strategy(format);
  if (!how) throw new Error("Kein unterstütztes Bild. Erlaubt sind JPG, PNG, WebP, AVIF und HEIC.");
  if (how === "lossless") return { ...stripLossless(bytes, { keepOrientation: keepOrientation.checked }), reencoded: false };
  await engine.ready;
  const buffer = bytes.slice().buffer;
  const r = await engine.call("reencode", { buffer }, { transfer: [buffer] });
  return { bytes: r.bytes, format: r.format, removed: ["alle Metadaten"], orientation: 1, reencoded: true, from: format };
}

mountDrop($("#drop"), {
  accept: ".jpg,.jpeg,.png,.webp,.avif,.heic,.heif,image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif",
  label: "Fotos hier ablegen",
  hint: "JPG, PNG, WebP, AVIF oder HEIC",
  onRejected: rejectInto(jobs, "JPG, PNG, WebP, AVIF oder HEIC"),
  onFiles: (files) =>
    processEach(files, jobs, async (file, job) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const summary = summarize(await readMetadata(exifr, bytes));
      showMetadata(job, summary);

      const result = await clean(bytes);
      const { ext, mime, label } = FORMATS[result.format];
      const after = summarize(await readMetadata(exifr, result.bytes));
      const leftover = after.all.filter(([k]) => k !== "Orientation");
      if (after.gps || leftover.length) throw new Error("Nach dem Entfernen waren noch Metadaten lesbar. Die Datei wurde nicht ausgegeben.");

      const found = summary.all.length;
      job.status(
        result.removed.length
          ? `${found ? `${found} Einträge gefunden, ` : ""}entfernt: ${result.removed.join(", ")}. ${formatSize(file.size)} → ${formatSize(result.bytes.byteLength)}`
          : "Keine Metadaten gefunden, die Datei ist schon sauber.",
        "working",
      );
      if (result.reencoded) {
        job.note(`${FORMATS[result.from].label} wurde dafür neu gespeichert${result.from === "heic" ? ` (als ${label})` : ""}. Dabei geht etwas Qualität verloren.`, "warn");
      } else {
        job.note("Bilddaten unverändert übernommen.");
      }
      if (result.orientation !== 1) {
        if (keepOrientation.checked && result.format === "jpeg") job.note("Die Drehung ist als einziger Eintrag geblieben, damit das Foto richtig herum angezeigt wird.");
        else job.note("Die Drehung aus den Metadaten ist mit entfernt. Das Bild kann jetzt gedreht angezeigt werden.", "warn");
      }
      job.note("Geprüft: in der neuen Datei sind keine Metadaten mehr lesbar.");
      job.result(new Blob([result.bytes], { type: mime }), outputName(file.name, "-ohne-metadaten", ext), { preview: true });
    }),
});
