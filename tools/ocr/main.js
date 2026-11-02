import "../../src/shared/style.css";
import "../_text/text-out.css";
import { formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, mountDrop } from "../../src/shared/ui.js";
import { textBlob } from "../_text/text.js";
import { attachText } from "../_text/ui.js";
import { startTesseract } from "./engine.js";
import { LANGUAGES, checkLanguage, fileKind, joinPages, percent } from "./ocr.js";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf";
const jobs = createJobList($("#jobs"));
const engineEl = $("#engine");
const langSelect = $("#lang");
const pdfCheck = $("#pdf");

engineEl.classList.add("engine");
function setEngine(state, text) {
  engineEl.dataset.state = state;
  engineEl.textContent = text;
}

// Ein tesseract-Worker für alles; Sprachwechsel lädt nur fehlende Sprachdaten nach.
let onProgress = () => {};
let currentLang = checkLanguage(langSelect.value);
let ocr = startTesseract(currentLang, (m) => onProgress(m));
watch(ocr, currentLang);

function watch(promise, lang) {
  setEngine("loading", `Texterkennung (${LANGUAGES[lang]}) wird geladen`);
  promise.then(
    () => lang === currentLang && setEngine("ready", `Texterkennung bereit (${LANGUAGES[lang]})`),
    (e) => setEngine("error", `Texterkennung konnte nicht geladen werden: ${e?.message ?? (typeof e === "string" ? e : "Datei fehlt oder wurde blockiert")}`),
  );
}

/** Liefert den Worker mit der gewünschten Sprache (lädt bei Bedarf um). */
async function ocrFor(lang) {
  if (lang !== currentLang) {
    currentLang = lang;
    const previous = ocr;
    ocr = previous.then(async (worker) => {
      await worker.reinitialize(lang, 1);
      return worker;
    });
    watch(ocr, lang);
  }
  return ocr;
}
langSelect.addEventListener("change", () => ocrFor(checkLanguage(langSelect.value)).catch(() => {}));

// MuPDF-Worker nur für PDFs starten.
let renderer = null;
const getRenderer = () => (renderer ??= connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" })));

/** WebP liest tesseract nicht zuverlässig: vorher als PNG umkodieren. */
async function toRecognizable(file) {
  if (!/webp$/i.test(file.type) && !/\.webp$/i.test(file.name)) return file;
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
}

async function recognize(worker, image, { wantPdf, dpi, title, onStatus }) {
  onProgress = (m) => {
    if (m.status === "recognizing text") onStatus(`Text wird erkannt, ${percent(m.progress)}`);
  };
  await worker.setParameters({ user_defined_dpi: dpi ? String(dpi) : "" });
  const { data } = await worker.recognize(image, { pdfTitle: title }, { text: true, pdf: wantPdf });
  return { text: data.text ?? "", confidence: data.confidence ?? 0, pdf: data.pdf ? new Uint8Array(data.pdf) : null };
}

async function processFile(file, job) {
  const kind = fileKind(file);
  if (!kind) throw new Error("Passt nicht (erwartet: PNG, JPG, WebP oder PDF)");
  const lang = checkLanguage(langSelect.value);
  const wantPdf = pdfCheck.checked;
  job.status("Texterkennung wird geladen …", "working");
  const worker = await ocrFor(lang);
  const pages = [];

  if (kind === "image") {
    const image = await toRecognizable(file);
    pages.push(await recognize(worker, image, { wantPdf, title: file.name, onStatus: (s) => job.status(s) }));
  } else {
    const pdf = getRenderer();
    await pdf.ready;
    const buffer = await file.arrayBuffer();
    const { pages: count } = await pdf.call("open", { buffer }, { transfer: [buffer] });
    try {
      for (let i = 0; i < count; i++) {
        const prefix = `Seite ${i + 1} von ${count}`;
        job.status(`${prefix}: wird gerendert …`);
        const { png, dpi } = await pdf.call("render", { index: i });
        const image = new Blob([png], { type: "image/png" });
        pages.push(await recognize(worker, image, { wantPdf, dpi, title: file.name, onStatus: (s) => job.status(`${prefix}: ${s}`) }));
      }
    } finally {
      await pdf.call("close", {});
    }
  }

  const text = joinPages(pages.map((p) => p.text));
  const confidence = Math.round(pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length);
  const pageInfo = pages.length > 1 ? `${pages.length} Seiten, ` : "";
  if (!text.trim()) {
    job.status(`${pageInfo}kein Text erkannt`, "done");
    job.note("Ist das Bild scharf genug und die Sprache richtig gewählt?", "warn");
    return;
  }
  job.status(`${pageInfo}${text.trim().split(/\s+/).length} Wörter, Sicherheit ${confidence} %`);
  attachText(job, text);
  job.result(textBlob(text), outputName(file.name, "", "txt"), { label: ".txt herunterladen" });

  if (wantPdf) {
    let bytes = pages[0].pdf;
    if (pages.length > 1) {
      const pdf = getRenderer();
      ({ bytes } = await pdf.call("merge", { pdfs: pages.map((p) => p.pdf) }));
    }
    job.result(new Blob([bytes], { type: "application/pdf" }), outputName(file.name, "-durchsuchbar", "pdf"), {
      label: `PDF herunterladen (${formatSize(bytes.byteLength)})`,
    });
  }
}

// Nacheinander abarbeiten: ein Erkennungs-Worker, und so bleibt der Fortschritt eindeutig.
let queue = Promise.resolve();
mountDrop($("#drop"), {
  accept: ACCEPT,
  label: "Bilder oder PDFs hier ablegen",
  hint: "PNG, JPG, WebP oder gescannte PDFs",
  onRejected: (file) => jobs.add(file.name).fail("Passt nicht (erwartet: PNG, JPG, WebP oder PDF)"),
  onFiles: (files) => {
    for (const file of files) {
      const job = jobs.add(file.name).status(`${formatSize(file.size)}, wartet …`, "working");
      queue = queue.then(() =>
        processFile(file, job).catch((error) => job.fail(error instanceof Error ? error : new Error(String(error)))),
      );
    }
  },
});
