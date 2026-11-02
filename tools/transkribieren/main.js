import "../../src/shared/style.css";
import "../_text/text-out.css";
import { formatSize, outputName } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, createJobList, mountDrop } from "../../src/shared/ui.js";
import { textBlob } from "../_text/text.js";
import { attachText, lazyEngine } from "../_text/ui.js";
import { LANGUAGES, SAMPLE_RATE, formatDuration, mixToMono, toSrt, toText, toVtt } from "./subtitles.js";

const ACCEPT = "audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.weba,.webm,.mp4,.m4v,.mov";
const MAX_SECONDS = 3 * 3600;
const jobs = createJobList($("#jobs"));
const langSelect = $("#lang");
const setEngine = lazyEngine($("#engine-row"));

let engine = null;
let modelReady = null;
function getEngine() {
  if (!engine) {
    engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
    setEngine("loading", "Sprachmodell wird geladen");
    modelReady = engine.ready
      .then(() =>
        engine.call("load", {}, {
          onProgress: (p) => {
            if (p.total) setEngine("loading", `Sprachmodell wird geladen, ${Math.round((p.loaded / p.total) * 100)} % von ${p.file.split("/").pop()}`);
          },
        }),
      )
      .then(
        () => setEngine("ready", "Sprachmodell bereit"),
        (e) => {
          setEngine("error", `Sprachmodell konnte nicht geladen werden: ${e.message}`);
          engine = null;
          throw e;
        },
      );
  }
  return { engine, modelReady };
}

/** Dekodiert Audio- und Videodateien und rechnet auf 16 kHz um (decodeAudioData resampelt selbst). */
async function decode(file) {
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("Tonspur lässt sich nicht lesen. Unterstützt sind gängige Audio- und Videoformate (MP3, M4A, WAV, OGG, MP4, WebM).");
  }
  if (buffer.duration > MAX_SECONDS) throw new Error(`Die Aufnahme ist länger als ${formatDuration(MAX_SECONDS)}. Teile sie bitte vorher.`);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return Float32Array.from(mixToMono(channels));
}

async function processFile(file, job) {
  const language = langSelect.value;
  if (!Object.hasOwn(LANGUAGES, language)) throw new Error("Unbekannte Sprache.");
  job.status("Tonspur wird gelesen …", "working");
  const samples = await decode(file);
  const seconds = samples.length / SAMPLE_RATE;
  if (seconds < 0.3) throw new Error("Die Aufnahme ist zu kurz.");

  const { engine: asr, modelReady: ready } = getEngine();
  job.status(`${formatDuration(seconds)} Audio, Sprachmodell wird geladen …`);
  await ready;
  const started = performance.now();
  const { chunks } = await asr.call("transcribe", { samples, language }, {
    transfer: [samples.buffer],
    onProgress: (p) => {
      if (p.stage !== "transcribe") return;
      let eta = "";
      if (p.done > 0 && p.done < p.total) {
        const perWindow = (performance.now() - started) / 1000 / p.done;
        eta = `, noch etwa ${formatDuration(perWindow * (p.total - p.done))}`;
      }
      job.status(`${formatDuration(seconds)} Audio: Abschnitt ${Math.min(p.done + 1, p.total)} von ${p.total} wird erkannt${eta}`);
    },
  });

  const took = formatDuration((performance.now() - started) / 1000);
  if (chunks.length === 0) {
    job.status(`${formatDuration(seconds)} Audio, keine Sprache erkannt`, "done");
    job.note("Ist in der Aufnahme gut hörbar gesprochen worden?", "warn");
    return;
  }
  const text = toText(chunks);
  job.status(`${formatDuration(seconds)} Audio, ${text.trim().split(/\s+/).length} Wörter, gerechnet in ${took}`);
  attachText(job, text, "Transkript");
  job.result(textBlob(text), outputName(file.name, "", "txt"), { label: ".txt" });
  job.result(textBlob(toSrt(chunks), "application/x-subrip"), outputName(file.name, "", "srt"), { label: ".srt" });
  job.result(textBlob(toVtt(chunks), "text/vtt"), outputName(file.name, "", "vtt"), { label: ".vtt" });
}

let queue = Promise.resolve();
mountDrop($("#drop"), {
  accept: ACCEPT,
  label: "Audio oder Video hier ablegen",
  hint: "MP3, M4A, WAV, OGG, MP4, WebM …",
  onRejected: (file) => jobs.add(file.name).fail("Passt nicht (erwartet: Audio- oder Videodatei)"),
  onFiles: (files) => {
    getEngine(); // Modell schon laden, während die erste Datei dekodiert wird
    for (const file of files) {
      const job = jobs.add(file.name).status(`${formatSize(file.size)}, wartet …`, "working");
      queue = queue.then(() => processFile(file, job).catch((e) => job.fail(e)));
    }
  },
});
