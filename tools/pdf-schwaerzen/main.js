import "../../src/shared/style.css";
import "../_pdf/pdf.css";
import "./style.css";
import { outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { pdfBlob } from "../_pdf/ui.js";
import { parseTerms } from "./redact.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

mountDrop($("#drop"), {
  accept: ".pdf,application/pdf",
  label: "PDF hier ablegen",
  hint: "Begriffe vorher eintragen",
  onRejected: rejectInto(jobs, "PDF"),
  onFiles: (files) =>
    processEach(files, jobs, async (file, job) => {
      const terms = parseTerms($("#terms").value);
      if (terms.length === 0) throw new Error("Trag zuerst mindestens einen Suchbegriff ein.");
      const caseSensitive = $("#case").checked;
      const buffer = await file.arrayBuffer();
      await engine.ready;
      const r = await engine.call("redact", { buffer, terms, caseSensitive }, { transfer: [buffer] });
      if (r.total === 0) {
        job.status("Keiner der Begriffe kommt in der PDF vor. Nichts geschwärzt.", "done");
        return;
      }
      job.status(`${plural(r.total, "Stelle", "Stellen")} auf ${plural(r.pages.length, "Seite", "Seiten")} geschwärzt`);
      for (const p of r.pages) {
        const detail = Object.entries(p.counts)
          .filter(([, n]) => n > 0)
          .map(([term, n]) => `„${term}“ ${n}×`)
          .join(", ");
        job.note(`S. ${p.page}: ${detail}`);
      }
      const missing = terms.filter((t) => !r.pages.some((p) => p.counts[t] > 0));
      if (missing.length) job.note(`Nicht gefunden: ${missing.map((t) => `„${t}“`).join(", ")}`, "warn");
      job.result(pdfBlob(r.bytes), outputName(file.name, "-geschwaerzt", "pdf"));
    }),
});
