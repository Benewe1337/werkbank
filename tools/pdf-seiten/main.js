import "../../src/shared/style.css";
import "../_pdf/pdf.css";
import "./style.css";
import { formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, rejectInto } from "../../src/shared/ui.js";
import { iconButton, moveItem, pdfBlob } from "../_pdf/ui.js";
import { normalizeRotation } from "./pages.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

const grid = $("#pages");
const editor = $("#editor");
const saveButton = $("#save");

/** @type {{id: number, file: File, count: number} | null} */
let doc = null;
/** Aktueller Stand: Reihenfolge der Originalseiten mit zusätzlicher Drehung. */
let pages = [];
/** Vorschau-URLs je Originalseite. */
let thumbs = new Map();
let dragFrom = null;

const initialPages = (count) => Array.from({ length: count }, (_, index) => ({ index, rotate: 0 }));

function setPages(next) {
  pages = next;
  render();
}

function card(page, i) {
  const li = document.createElement("li");
  li.className = "page-card";
  li.draggable = true;
  li.dataset.position = String(i);
  const label = `Seite ${page.index + 1}`;
  li.ariaLabel = `${label}, Position ${i + 1}`;

  const frame = document.createElement("div");
  frame.className = "page-thumb";
  const img = document.createElement("img");
  img.alt = label;
  img.draggable = false;
  const url = thumbs.get(page.index);
  if (url) img.src = url;
  img.style.rotate = `${page.rotate}deg`;
  frame.append(img);

  const caption = document.createElement("span");
  caption.className = "page-label";
  caption.textContent = page.rotate ? `${label} · ${page.rotate}°` : label;

  const tools = document.createElement("div");
  tools.className = "page-tools";
  tools.append(
    iconButton("←", `${label} nach vorne`, i === 0, () => setPages(moveItem(pages, i, i - 1))),
    iconButton("→", `${label} nach hinten`, i === pages.length - 1, () => setPages(moveItem(pages, i, i + 1))),
    iconButton("↻", `${label} drehen`, false, () =>
      setPages(pages.map((p, j) => (j === i ? { ...p, rotate: normalizeRotation(p.rotate + 90) } : p))),
    ),
    iconButton("×", `${label} löschen`, pages.length === 1, () => setPages(pages.filter((_, j) => j !== i))),
  );
  li.append(frame, caption, tools);
  return li;
}

function render() {
  grid.replaceChildren(...pages.map(card));
  if (!doc) return;
  const removed = doc.count - pages.length;
  $("#file").replaceChildren();
  const name = document.createElement("strong");
  name.textContent = doc.file.name;
  $("#file").append(name, `, ${pages.length} von ${doc.count} Seiten${removed ? ` (${removed} gelöscht)` : ""}`);
}

// Ziehen und Ablegen: Karte vor die Zielkarte setzen.
grid.addEventListener("dragstart", (e) => {
  const li = e.target.closest?.(".page-card");
  if (!li) return;
  dragFrom = Number(li.dataset.position);
  li.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", li.dataset.position);
});
grid.addEventListener("dragover", (e) => {
  const li = e.target.closest?.(".page-card");
  if (dragFrom === null || !li) return;
  e.preventDefault();
  for (const el of grid.querySelectorAll(".drop-before")) el.classList.remove("drop-before");
  li.classList.add("drop-before");
});
grid.addEventListener("drop", (e) => {
  const li = e.target.closest?.(".page-card");
  if (dragFrom === null || !li) return;
  e.preventDefault();
  e.stopPropagation();
  const to = Number(li.dataset.position);
  const from = dragFrom;
  dragFrom = null;
  setPages(moveItem(pages, from, from < to ? to - 1 : to));
});
grid.addEventListener("dragend", () => {
  dragFrom = null;
  for (const el of grid.querySelectorAll(".dragging, .drop-before")) el.classList.remove("dragging", "drop-before");
});

async function loadThumbs(id, count) {
  for (let index = 0; index < count; index++) {
    if (doc?.id !== id) return; // inzwischen andere Datei geladen
    const { png } = await engine.call("thumb", { id, index });
    const url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
    thumbs.set(index, url);
    const position = pages.findIndex((p) => p.index === index);
    const img = grid.children[position]?.querySelector("img");
    if (img) img.src = url;
  }
}

function closeCurrent() {
  if (!doc) return;
  engine.call("close", { id: doc.id }).catch(() => {});
  for (const url of thumbs.values()) URL.revokeObjectURL(url);
  thumbs = new Map();
  doc = null;
}

mountDrop($("#drop"), {
  accept: ".pdf,application/pdf",
  multiple: false,
  label: "PDF hier ablegen",
  hint: "eine Datei",
  onRejected: rejectInto(jobs, "PDF"),
  onFiles: async ([file]) => {
    closeCurrent();
    editor.hidden = true;
    try {
      const buffer = await file.arrayBuffer();
      await engine.ready;
      const { id, pages: count } = await engine.call("open", { buffer }, { transfer: [buffer] });
      doc = { id, file, count };
      editor.hidden = false;
      setPages(initialPages(count));
      await loadThumbs(id, count);
    } catch (error) {
      jobs.add(file.name).fail(error);
    }
  },
});

$("#reset").addEventListener("click", () => doc && setPages(initialPages(doc.count)));

saveButton.addEventListener("click", async () => {
  if (!doc) return;
  const name = outputName(doc.file.name, "-bearbeitet", "pdf");
  const job = jobs.add(name).status("wird gespeichert …", "working");
  saveButton.disabled = true;
  try {
    const { bytes, pages: count } = await engine.call("save", { id: doc.id, edits: pages });
    job.status(`${count} ${count === 1 ? "Seite" : "Seiten"}, ${formatSize(bytes.byteLength)}`);
    job.result(pdfBlob(bytes), name);
  } catch (error) {
    job.fail(error);
  } finally {
    saveButton.disabled = false;
  }
});
