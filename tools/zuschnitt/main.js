import "../../src/shared/style.css";
import { formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";

const ACCEPT = ".pdf,application/pdf";
const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

mountDrop($("#drop"), {
  accept: ACCEPT,
  label: "Handout-PDF hier ablegen",
  onRejected: rejectInto(jobs, "PDF"),
  onFiles: (files) =>
    processEach(files, jobs, async (file, job) => {
      const buffer = await file.arrayBuffer();
      await engine.ready;
      const { bytes, pagesIn, pagesOut, logs } = await engine.call("crop", { buffer }, { transfer: [buffer] });
      for (const l of logs) job.note(`S. ${l.page}: ${l.text}`, l.level);
      job.status(`${pagesIn} Seiten → ${pagesOut} Folien, ${formatSize(bytes.byteLength)}`);
      job.result(new Blob([bytes], { type: "application/pdf" }), outputName(file.name, "-zugeschnitten", "pdf"));
    }),
});
