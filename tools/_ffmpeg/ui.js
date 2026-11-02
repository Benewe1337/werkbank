// UI-Bausteine für die ffmpeg-Werkzeuge: Status der Engine, Fortschritt mit Abbrechen, Videovorschau.
import "./style.css";
import { formatSize } from "../../src/shared/format.js";
import { AbortedError, FfmpegError, onEngineLoad, preloadEngine, runFfmpeg } from "./engine.js";
import { formatTime, isLargeFile, LARGE_FILE_NOTE } from "./logic.js";

/** Zeigt den Ladezustand von ffmpeg in #engine, auch nach einem Neustart (Abbruch). */
export function mountEngineStatus(el) {
  el.classList.add("engine");
  el.setAttribute("aria-live", "polite");
  let first = true;
  const set = (state, text) => {
    el.dataset.state = state;
    el.textContent = text;
  };
  set("loading", "ffmpeg wird vorbereitet");
  onEngineLoad((promise) => {
    set("loading", first ? "ffmpeg wird geladen (rund 30 MB, danach im Cache)" : "ffmpeg wird neu gestartet");
    first = false;
    promise.then(
      () => set("ready", "ffmpeg bereit"),
      (e) => set("error", `ffmpeg konnte nicht geladen werden: ${e.message}`),
    );
  });
  preloadEngine();
}

/**
 * Führt einen ffmpeg-Auftrag für einen Job aus: Warteschlange, Fortschritt, Abbrechen, Fehlertext.
 * @param {ReturnType<ReturnType<typeof import("../../src/shared/ui.js").createJobList>["add"]>} job
 * @param {Parameters<typeof runFfmpeg>[0] & {label?: string}} task
 * @returns {Promise<Uint8Array>}
 */
export async function runJob(job, { label = "Wird umgewandelt", ...task }) {
  if (isLargeFile(task.file.size)) job.note(LARGE_FILE_NOTE, "warn");
  const controller = new AbortController();
  const bar = document.createElement("progress");
  bar.className = "job-progress";
  bar.max = 1;
  bar.removeAttribute("value");
  bar.setAttribute("aria-label", "Fortschritt");
  const actions = document.createElement("div");
  actions.className = "job-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button ghost job-cancel";
  cancel.textContent = "Abbrechen";
  cancel.addEventListener("click", () => controller.abort());
  actions.append(cancel);
  job.el.insertBefore(actions, job.el.querySelector(".job-notes"));
  job.el.append(bar);
  job.status("Wartet, bis die vorherigen Dateien fertig sind …", "working");

  let lastPercent = -1;
  try {
    const data = await runFfmpeg({
      ...task,
      signal: controller.signal,
      onStart: () => job.status(`${label} …`),
      onProgress: (ratio, step, steps) => {
        const overall = ratio == null ? null : (step + ratio) / steps;
        if (overall == null) {
          bar.removeAttribute("value");
          return;
        }
        bar.value = overall;
        const percent = Math.floor(overall * 100);
        if (percent !== lastPercent) {
          lastPercent = percent;
          job.status(`${label} … ${percent} %`);
        }
      },
    });
    return data;
  } catch (error) {
    if (error instanceof AbortedError) {
      job.status("Abgebrochen.", "error");
      job.el.dataset.aborted = "true";
    } else {
      if (error instanceof FfmpegError && error.detail) job.note(error.detail, "warn");
      throw error;
    }
    return null;
  } finally {
    bar.remove();
    cancel.remove();
    if (!actions.childElementCount) actions.remove();
  }
}

export const sizeLabel = (before, after) => `${formatSize(before)} → ${formatSize(after)}`;

/**
 * Videovorschau in einem leeren Element. Liefert Zugriff auf Position und Dauer.
 * Kann der Browser das Format nicht abspielen, erscheint ein Hinweis; ffmpeg kann es trotzdem lesen.
 */
export function mountVideoPreview(el, file) {
  el.replaceChildren();
  el.hidden = false;
  el.classList.add("media-preview");
  const video = document.createElement("video");
  video.controls = true;
  video.preload = "metadata";
  video.playsInline = true;
  video.muted = false;
  const url = URL.createObjectURL(file);
  video.src = url;
  const caption = document.createElement("p");
  caption.className = "hint media-caption";
  caption.textContent = `${file.name}, ${formatSize(file.size)}`;
  el.append(video, caption);

  const playable = new Promise((resolve) => {
    video.addEventListener("loadedmetadata", () => {
      const d = Number.isFinite(video.duration) ? video.duration : null;
      if (d) caption.textContent = `${file.name}, ${formatSize(file.size)}, ${formatTime(d)}`;
      resolve(true);
    }, { once: true });
    video.addEventListener("error", () => {
      video.remove();
      caption.textContent = `${file.name}, ${formatSize(file.size)}. Der Browser kann dieses Format nicht abspielen, umwandeln geht trotzdem.`;
      resolve(false);
    }, { once: true });
  });

  return {
    video,
    playable,
    get currentTime() {
      return video.isConnected ? video.currentTime : null;
    },
    get duration() {
      return video.isConnected && Number.isFinite(video.duration) ? video.duration : null;
    },
    destroy() {
      URL.revokeObjectURL(url);
      el.replaceChildren();
      el.hidden = true;
    },
  };
}
