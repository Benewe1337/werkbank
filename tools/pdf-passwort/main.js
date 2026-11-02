import "../../src/shared/style.css";
import "../_pdf/pdf.css";
import { formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, processEach, rejectInto } from "../../src/shared/ui.js";
import { pdfBlob, showForMode } from "../_pdf/ui.js";
import { checkPassword } from "./password.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

const work = $(".work");
const mode = () => /** @type {HTMLInputElement} */ ($('input[name="mode"]:checked')).value;
const update = () => showForMode(work, mode());
for (const radio of work.querySelectorAll('input[name="mode"]')) radio.addEventListener("change", update);
update();

$("#reveal").addEventListener("change", (e) => {
  for (const input of work.querySelectorAll('input[type="password"], input[data-revealed]')) {
    input.type = e.target.checked ? "text" : "password";
    input.toggleAttribute("data-revealed", e.target.checked);
  }
});

/** Eingaben vor dem Lesen der Datei prüfen, damit Tippfehler sofort auffallen. */
function request() {
  if (mode() === "unlock") return { method: "unlock", payload: { password: $("#current").value }, suffix: "-offen" };
  const user = checkPassword($("#user").value, "Passwort");
  if (user !== $("#repeat").value) throw new Error("Die beiden Passwörter stimmen nicht überein.");
  const owner = $("#owner").value;
  if (owner) checkPassword(owner, "Besitzer-Passwort");
  return { method: "protect", payload: { user, owner }, suffix: "-geschuetzt" };
}

mountDrop($("#drop"), {
  accept: ".pdf,application/pdf",
  label: "PDF hier ablegen",
  hint: "Passwort vorher eintragen",
  onRejected: rejectInto(jobs, "PDF"),
  onFiles: (files) =>
    processEach(files, jobs, async (file, job) => {
      const { method, payload, suffix } = request();
      const buffer = await file.arrayBuffer();
      await engine.ready;
      const { bytes, pages } = await engine.call(method, { buffer, ...payload }, { transfer: [buffer] });
      job.status(`${method === "unlock" ? "Schutz entfernt" : "Mit AES-256 geschützt"}, ${pages} Seiten, ${formatSize(bytes.byteLength)}`);
      job.result(pdfBlob(bytes), outputName(file.name, suffix, "pdf"));
    }),
});
