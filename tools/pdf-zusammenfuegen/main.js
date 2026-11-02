import "../../src/shared/style.css";
import { formatSize } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, engineStatus, mountDrop, rejectInto } from "../../src/shared/ui.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
const jobs = createJobList($("#jobs"));
engineStatus($("#engine"), engine.ready);

const list = $("#queue");
const button = $("#run");
let files = [];

function render() {
  list.replaceChildren(
    ...files.map((file, i) => {
      const li = document.createElement("li");
      li.className = "queue-item";
      const name = document.createElement("span");
      name.textContent = `${i + 1}. ${file.name}`;
      const size = document.createElement("span");
      size.className = "hint";
      size.textContent = formatSize(file.size);
      const controls = document.createElement("span");
      controls.className = "row";
      controls.append(
        iconButton("↑", `${file.name} nach oben`, i === 0, () => move(i, -1)),
        iconButton("↓", `${file.name} nach unten`, i === files.length - 1, () => move(i, 1)),
        iconButton("×", `${file.name} entfernen`, false, () => {
          files = files.filter((_, j) => j !== i);
          render();
        }),
      );
      li.append(name, size, controls);
      return li;
    }),
  );
  button.disabled = files.length < 2;
  button.textContent = files.length < 2 ? "Mindestens zwei PDFs auswählen" : `${files.length} PDFs zusammenfügen`;
}

function iconButton(text, label, disabled, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon-button";
  b.textContent = text;
  b.ariaLabel = label;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

function move(i, delta) {
  const next = [...files];
  [next[i], next[i + delta]] = [next[i + delta], next[i]];
  files = next;
  render();
}

mountDrop($("#drop"), {
  accept: ".pdf,application/pdf",
  label: "PDFs hier ablegen",
  onRejected: rejectInto(jobs, "PDF"),
  onFiles: (added) => {
    files = [...files, ...added];
    render();
  },
});

button.addEventListener("click", async () => {
  const job = jobs.add("zusammengefügt.pdf").status(`${files.length} Dateien werden verbunden …`, "working");
  button.disabled = true;
  try {
    const buffers = await Promise.all(files.map((f) => f.arrayBuffer()));
    await engine.ready;
    const { bytes, pages } = await engine.call("merge", { buffers }, { transfer: buffers });
    job.status(`${pages} Seiten, ${formatSize(bytes.byteLength)}`);
    job.result(new Blob([bytes], { type: "application/pdf" }), "zusammengefügt.pdf");
  } catch (error) {
    job.fail(error);
  } finally {
    render();
  }
});

render();
