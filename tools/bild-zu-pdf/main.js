import "../../src/shared/style.css";
import "../_pdf/pdf.css";
import "./style.css";
import { formatSize } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, rejectInto } from "../../src/shared/ui.js";
import { iconButton, moveItem, pdfBlob } from "../_pdf/ui.js";

const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,image/jpeg,image/png,image/webp";
const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

const list = $("#queue");
const button = $("#run");
/** @type {{file: File, url: string}[]} */
let items = [];

function render() {
  list.replaceChildren(
    ...items.map(({ file, url }, i) => {
      const li = document.createElement("li");
      li.className = "queue-item";
      const thumb = document.createElement("img");
      thumb.className = "queue-thumb";
      thumb.alt = "";
      thumb.src = url;
      const name = document.createElement("span");
      name.textContent = `${i + 1}. ${file.name}`;
      const size = document.createElement("span");
      size.className = "hint";
      size.textContent = formatSize(file.size);
      const controls = document.createElement("span");
      controls.className = "row";
      controls.append(
        iconButton("↑", `${file.name} nach oben`, i === 0, () => setItems(moveItem(items, i, i - 1))),
        iconButton("↓", `${file.name} nach unten`, i === items.length - 1, () => setItems(moveItem(items, i, i + 1))),
        iconButton("×", `${file.name} entfernen`, false, () => {
          URL.revokeObjectURL(url);
          setItems(items.filter((_, j) => j !== i));
        }),
      );
      li.append(thumb, name, size, controls);
      return li;
    }),
  );
  button.disabled = items.length === 0;
  button.textContent =
    items.length === 0 ? "Bilder auswählen" : `${items.length} ${items.length === 1 ? "Bild" : "Bilder"} in PDF umwandeln`;
}

function setItems(next) {
  items = next;
  render();
}

mountDrop($("#drop"), {
  accept: ACCEPT,
  label: "Bilder hier ablegen",
  hint: "JPG, PNG oder WebP",
  onRejected: rejectInto(jobs, "JPG, PNG oder WebP"),
  onFiles: (added) => setItems([...items, ...added.map((file) => ({ file, url: URL.createObjectURL(file) }))]),
});

button.addEventListener("click", async () => {
  const job = jobs.add("bilder.pdf").status(`${items.length} Bilder werden zusammengestellt …`, "working");
  button.disabled = true;
  try {
    const files = await Promise.all(
      items.map(async ({ file }) => ({ buffer: await file.arrayBuffer(), name: file.name, type: file.type })),
    );
    await engine.ready;
    const { bytes, pages } = await engine.call(
      "build",
      { files, layout: $("#layout").value },
      { transfer: files.map((f) => f.buffer) },
    );
    job.status(`${pages} ${pages === 1 ? "Seite" : "Seiten"}, ${formatSize(bytes.byteLength)}`);
    job.result(pdfBlob(bytes), "bilder.pdf");
  } catch (error) {
    job.fail(error);
  } finally {
    render();
  }
});

render();
