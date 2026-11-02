import "../../src/shared/style.css";
import { baseName, formatSize } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, mountDrop, processEach } from "../../src/shared/ui.js";
import { lazyEngine } from "../_text/ui.js";
import { ACCEPT, FORMATS, INPUT_FORMATS, OUTPUT_FORMATS, defaultTarget, detectFormat } from "./formats.js";

const jobs = createJobList($("#jobs"));
const fromSelect = $("#from");
const toSelect = $("#to");
const setEngine = lazyEngine($("#engine-row"));
let toTouched = false;

const option = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });
fromSelect.append(...INPUT_FORMATS.map((f) => option(f, FORMATS[f].label)));
toSelect.append(...OUTPUT_FORMATS.map((f) => option(f, FORMATS[f].label)));
toSelect.value = "docx";
toSelect.addEventListener("change", () => (toTouched = true));

/** Pandoc (≈ 59 MB) erst beim ersten Bedarf laden. */
let engine = null;
function getEngine() {
  if (!engine) {
    engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
    setEngine("loading", "Pandoc wird geladen (rund 59 MB, beim ersten Mal dauert das)");
    engine.ready.then(
      () => setEngine("ready", "Pandoc bereit"),
      (e) => setEngine("error", `Pandoc konnte nicht geladen werden: ${e.message}`),
    );
  }
  return engine;
}

mountDrop($("#drop"), {
  accept: ACCEPT,
  label: "Dokument hier ablegen",
  hint: "Markdown, DOCX, ODT, HTML, LaTeX, RST oder EPUB",
  onRejected: (file) => jobs.add(file.name).fail("Format wird nicht erkannt. Erwartet: Markdown, DOCX, ODT, HTML, LaTeX, RST oder EPUB."),
  onFiles: (files) => {
    const pandoc = getEngine();
    return processEach(files, jobs, async (file, job) => {
      const from = fromSelect.value === "auto" ? detectFormat(file.name) : fromSelect.value;
      if (!from) throw new Error("Format wird nicht erkannt. Wähle das Eingabeformat aus.");
      // Ohne eigene Wahl: nicht in dasselbe Format umwandeln.
      let to = toSelect.value;
      if (to === from && !toTouched) to = defaultTarget(from);
      if (to === from) throw new Error(`Die Datei ist schon ${FORMATS[from].label}. Wähle ein anderes Ausgabeformat.`);
      job.status(`${FORMATS[from].label} → ${FORMATS[to].label}, wird umgewandelt …`, "working");
      const bytes = new Uint8Array(await file.arrayBuffer());
      await pandoc.ready;
      const result = await pandoc.call("convert", { bytes, from, to, baseName: baseName(file.name) }, { transfer: [bytes.buffer] });
      for (const note of result.notes) job.note(note, "warn");
      const extra = result.media ? `, ${result.media} ${result.media === 1 ? "Bild" : "Bilder"} als ZIP` : "";
      job.status(`${FORMATS[from].label} → ${FORMATS[to].label}, ${formatSize(result.bytes.byteLength)}${extra}`);
      job.result(new Blob([result.bytes], { type: result.mime }), result.fileName);
    });
  },
});
