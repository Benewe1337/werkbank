import "../../src/shared/style.css";
import "../_pdf/pdf.css";
import { baseName, formatSize } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { pageFileName } from "./render.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

mountDrop($("#drop"), {
  accept: ".pdf,application/pdf",
  label: "PDF hier ablegen",
  hint: "mehrere gehen auch",
  onRejected: rejectInto(jobs, "PDF"),
  onFiles: (files) =>
    processEach(files, jobs, async (file, job) => {
      const format = $("#format").value;
      const dpi = Number($("#dpi").value);
      const pages = $("#pages").value;
      const buffer = await file.arrayBuffer();
      await engine.ready;
      const images = [];
      await engine.call(
        "render",
        { buffer, dpi, format, pages },
        {
          transfer: [buffer],
          onProgress: (p) => {
            images.push(p);
            job.status(`Seite ${p.done} von ${p.total} gerendert …`, "working");
          },
        },
      );
      const type = format === "jpg" ? "image/jpeg" : "image/png";
      const base = baseName(file.name);
      // Umgekehrt anlegen, damit Seite 1 oben steht; der Datei-Eintrag kommt danach ganz nach oben.
      for (const img of [...images].reverse()) {
        const name = pageFileName(base, img.index, img.count, format);
        jobs
          .add(name)
          .status(`${img.width} × ${img.height} px, ${formatSize(img.bytes.byteLength)}`)
          .result(new Blob([img.bytes], { type }), name, { preview: true });
      }
      job.status(`${images.length} ${images.length === 1 ? "Bild" : "Bilder"} als ${format.toUpperCase()}, ${dpi} dpi`, "done");
      job.el.parentElement.prepend(job.el);
    }),
});
