// Gemeinsamer ffmpeg-Lader für die Werkzeuge der Gruppe „Video & Audio“.
//
// - Ein ffmpeg (single-thread-Core, kein SharedArrayBuffer nötig) pro Seite.
// - Core-JS und WASM kommen über Vite-`?url` aus node_modules, also von 'self' (CSP).
// - Aufträge laufen nacheinander (Warteschlange), damit der Speicher nicht explodiert.
// - Eingaben werden per WORKERFS eingehängt statt in den WASM-Speicher kopiert;
//   Ausgaben und Zwischendateien werden nach jedem Auftrag gelöscht.
import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { explainFailure, IN_DIR, parseDurationLine, parseProgressLine, progressRatio } from "./logic.js";

export { inputPath } from "./logic.js";

export class FfmpegError extends Error {
  constructor(message, detail = "") {
    super(message);
    this.name = "FfmpegError";
    this.detail = detail;
  }
}

export class AbortedError extends Error {
  constructor() {
    super("Abgebrochen.");
    this.name = "AbortedError";
  }
}

let ffmpeg = null;
let loading = null;
let queue = Promise.resolve();
const listeners = new Set();
let currentLog = null;

/** Benachrichtigt bei jedem (Neu-)Start, z. B. nach Abbruch. fn(promise). */
export function onEngineLoad(fn) {
  listeners.add(fn);
  if (loading) fn(loading);
  return () => listeners.delete(fn);
}

/** Lädt ffmpeg (einmal pro Seite, nach Abbruch erneut). */
export function loadEngine() {
  if (loading) return loading;
  const instance = new FFmpeg();
  instance.on("log", ({ message }) => currentLog?.(message));
  loading = instance.load({ coreURL, wasmURL }).then(
    async () => {
      await instance.createDir(IN_DIR);
      ffmpeg = instance;
      return instance;
    },
    (error) => {
      instance.terminate();
      loading = null;
      throw new Error(typeof error === "string" ? error : error?.message || "ffmpeg konnte nicht geladen werden");
    },
  );
  for (const fn of listeners) fn(loading);
  return loading;
}

/** Bricht alles ab und startet ffmpeg neu (WASM kommt dann aus dem Cache). */
function restart() {
  const old = ffmpeg;
  ffmpeg = null;
  loading = null;
  old?.terminate();
  loadEngine().catch(() => {});
}

/**
 * Lädt ffmpeg, sobald der Browser Luft hat (nach dem Seitenaufbau).
 * Die WASM ist gut 30 MB groß; danach liegt sie im Cache.
 */
export function preloadEngine() {
  const start = () => loadEngine().catch(() => {});
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 1500 });
  else setTimeout(start, 200);
}

/**
 * Führt einen Auftrag aus, sobald alle vorherigen fertig sind.
 * @param {{
 *   file: Blob, inputName: string,
 *   commands: string[][],          // ffmpeg-Argumente je Schritt (Eingabe liegt unter /in/<inputName>)
 *   output: string,                // Datei, die am Ende gelesen wird
 *   temp?: string[],               // Zwischendateien, die danach gelöscht werden
 *   duration?: number,             // erwartete Länge in Sekunden (sonst aus dem Log)
 *   signal?: AbortSignal,
 *   onStart?: () => void,
 *   onProgress?: (ratio: number|null, step: number, steps: number) => void,
 * }} task
 * @returns {Promise<Uint8Array>}
 */
export function runFfmpeg(task) {
  const result = queue.then(() => execute(task));
  queue = result.catch(() => {});
  return result;
}

async function execute({ file, inputName, commands, output, temp = [], duration, signal, onStart, onProgress }) {
  if (signal?.aborted) throw new AbortedError();
  const ff = await loadEngine();
  if (signal?.aborted) throw new AbortedError();
  onStart?.();

  let aborted = false;
  const abort = () => {
    aborted = true;
    restart();
  };
  signal?.addEventListener("abort", abort, { once: true });

  let mounted = false;
  try {
    await ff.mount("WORKERFS", { blobs: [{ name: inputName, data: file }] }, IN_DIR);
    mounted = true;

    for (let step = 0; step < commands.length; step++) {
      const logs = [];
      let total = duration ?? null;
      currentLog = (line) => {
        logs.push(line);
        if (total == null) total = parseDurationLine(line);
        const t = parseProgressLine(line);
        if (t != null) onProgress?.(progressRatio(t, total), step, commands.length);
      };
      onProgress?.(0, step, commands.length);
      let code;
      try {
        code = await ff.exec(["-hide_banner", ...commands[step]]);
      } catch (error) {
        if (aborted) throw new AbortedError();
        // WASM-Absturz (z. B. Speicher): Instanz ist danach unbrauchbar.
        logs.push(String(error?.message ?? error));
        restart();
        const { message, detail } = explainFailure(logs);
        throw new FfmpegError(message, detail);
      }
      if (aborted) throw new AbortedError();
      // ffmpeg meldet bei leerem Ergebnis (z. B. Start hinter dem Ende) trotzdem Erfolg.
      if (code !== 0 || logs.some((l) => /Output file is empty/.test(l))) {
        const { message, detail } = explainFailure(logs);
        throw new FfmpegError(message, detail);
      }
    }

    const data = await ff.readFile(output);
    if (aborted) throw new AbortedError();
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      throw new FfmpegError("Im gewählten Bereich wurde nichts gefunden, das sich umwandeln lässt.");
    }
    return data;
  } catch (error) {
    if (aborted) throw new AbortedError();
    if (error instanceof FfmpegError || error instanceof AbortedError) throw error;
    const { message, detail } = explainFailure([String(error?.message ?? error)]);
    throw new FfmpegError(message, detail);
  } finally {
    currentLog = null;
    signal?.removeEventListener("abort", abort);
    if (!aborted && ffmpeg === ff) {
      for (const name of [output, ...temp]) await ff.deleteFile(name).catch(() => {});
      if (mounted) await ff.unmount(IN_DIR).catch(() => {});
    }
  }
}
