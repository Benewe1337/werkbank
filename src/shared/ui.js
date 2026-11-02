// Gemeinsame UI-Bausteine: Ablagefläche, Ergebnisliste, Downloads, Status der WebAssembly.
import { zipSync } from "fflate";
import { formatSize, matchesAccept } from "./format.js";

/** Kurzform für document.querySelector, wirft wenn das Element fehlt (Tippfehler fallen sofort auf). */
export function $(selector, root = document) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Element fehlt: ${selector}`);
  return el;
}

/**
 * Baut die Ablagefläche in ein leeres Element (#drop).
 * @param {HTMLElement} el
 * @param {{accept?: string, multiple?: boolean, label?: string, hint?: string,
 *          onFiles: (files: File[]) => void, onRejected?: (file: File) => void}} opts
 */
export function mountDrop(el, { accept = "", multiple = true, label, hint, onFiles, onRejected }) {
  el.classList.add("drop");
  const input = document.createElement("input");
  input.type = "file";
  input.id = el.id ? `${el.id}-input` : "file";
  if (accept) input.accept = accept;
  input.multiple = multiple;

  const box = document.createElement("label");
  box.className = "drop-box";
  box.htmlFor = input.id;
  const title = document.createElement("span");
  title.className = "drop-title";
  title.textContent = label ?? (multiple ? "Dateien hier ablegen" : "Datei hier ablegen");
  const sub = document.createElement("span");
  sub.className = "drop-hint";
  sub.innerHTML = `oder <u>${multiple ? "Dateien" : "Datei"} auswählen</u>`;
  if (hint) sub.append(`, ${hint}`);
  box.append(title, sub, input);
  el.replaceChildren(box);

  const take = (list) => {
    const files = [...list];
    const ok = files.filter((f) => matchesAccept(f, accept));
    for (const f of files) if (!ok.includes(f)) onRejected?.(f);
    if (ok.length) onFiles(multiple ? ok : ok.slice(0, 1));
  };

  input.addEventListener("change", () => {
    take(input.files);
    input.value = "";
  });
  for (const type of ["dragenter", "dragover"]) {
    box.addEventListener(type, (e) => {
      e.preventDefault();
      box.classList.add("over");
    });
  }
  for (const type of ["dragleave", "drop"]) box.addEventListener(type, () => box.classList.remove("over"));
  box.addEventListener("drop", (e) => {
    e.preventDefault();
    take(e.dataTransfer.files);
  });
  return { input };
}

// Dateien, die neben der Fläche fallen gelassen werden, nicht im Tab öffnen.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Ergebnisliste (#jobs). Ab zwei fertigen Ergebnissen erscheint „Alle als ZIP“.
 * @param {HTMLElement} el
 */
export function createJobList(el) {
  el.classList.add("jobs");
  const results = [];
  let zipBar = null;

  const updateZip = () => {
    if (results.length < 2) return;
    if (!zipBar) {
      zipBar = document.createElement("div");
      zipBar.className = "jobs-zip";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "button ghost";
      btn.textContent = "Alle als ZIP herunterladen";
      btn.addEventListener("click", async () => {
        const files = {};
        for (const r of results) files[uniqueName(files, r.name)] = new Uint8Array(await r.blob.arrayBuffer());
        downloadBlob(new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }), "werkbank.zip");
      });
      zipBar.append(btn);
      el.before(zipBar);
    }
  };

  /** @param {string} name */
  function add(name) {
    const li = document.createElement("li");
    li.className = "job";
    li.dataset.state = "working";
    li.innerHTML = `<span class="job-name"></span><span class="job-status"></span><ul class="job-notes"></ul>`;
    li.querySelector(".job-name").textContent = name;
    el.prepend(li);
    const statusEl = li.querySelector(".job-status");
    const notes = li.querySelector(".job-notes");

    const job = {
      el: li,
      status(text, state = li.dataset.state) {
        statusEl.textContent = text;
        li.dataset.state = state;
        return job;
      },
      note(text, level = "info") {
        const n = document.createElement("li");
        n.dataset.level = level;
        n.textContent = text;
        notes.append(n);
        return job;
      },
      /** Ergebnisdatei anhängen. Mehrere Aufrufe = mehrere Downloads. */
      result(blob, fileName, { label = "Herunterladen", preview = false } = {}) {
        const a = document.createElement("a");
        a.className = "job-download";
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.textContent = label;
        let actions = li.querySelector(".job-actions");
        if (!actions) {
          actions = document.createElement("div");
          actions.className = "job-actions";
          li.insertBefore(actions, notes);
        }
        actions.append(a);
        if (preview && blob.type.startsWith("image/")) {
          const img = document.createElement("img");
          img.className = "job-preview";
          img.alt = "";
          img.src = a.href;
          li.insertBefore(img, li.firstChild);
          li.classList.add("has-preview");
        }
        results.push({ blob, name: fileName });
        li.dataset.state = "done";
        updateZip();
        return job;
      },
      fail(error) {
        const message = error instanceof Error ? error.message : String(error);
        return job.status(message || "Fehler", "error");
      },
    };
    return job;
  }

  return { add };
}

function uniqueName(existing, name) {
  if (!(name in existing)) return name;
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let i = 2;
  while (`${stem} (${i})${ext}` in existing) i++;
  return `${stem} (${i})${ext}`;
}

/**
 * Zeigt den Ladezustand der WebAssembly in einem Element (#engine).
 * @param {HTMLElement} el
 * @param {Promise<unknown>} ready
 */
export function engineStatus(el, ready, name = "WebAssembly") {
  el.classList.add("engine");
  el.dataset.state = "loading";
  el.textContent = `${name} wird geladen`;
  ready.then(
    () => {
      el.dataset.state = "ready";
      el.textContent = `${name} bereit`;
    },
    (e) => {
      el.dataset.state = "error";
      el.textContent = `${name} konnte nicht geladen werden: ${e.message}`;
    },
  );
}

/** Für jede Datei einen Job anlegen und fn ausführen; Fehler landen am Job, nicht in der Konsole. */
export function processEach(files, jobs, fn) {
  return Promise.all(
    files.map(async (file) => {
      const job = jobs.add(file.name).status(`${formatSize(file.size)}, wird verarbeitet …`, "working");
      try {
        await fn(file, job);
      } catch (error) {
        job.fail(error);
      }
    }),
  );
}

/** Meldung für Dateien, die nicht zum Werkzeug passen. */
export function rejectInto(jobs, accept) {
  return (file) => jobs.add(file.name).fail(`Passt nicht (erwartet: ${accept})`);
}
