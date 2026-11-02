import { serve } from "../../src/shared/worker-host.js";
// onnxruntime-web von transformers.js (eigene, verschachtelte Version) selbst ausliefern.
import ortMjs from "../../node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url";
import ortWasm from "../../node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";

export const MODEL = "whisper-base";

serve(async () => {
  const { env, pipeline } = await import("@huggingface/transformers");
  const { dropHallucinations, shiftChunks, splitWindows, SAMPLE_RATE } = await import("./subtitles.js");

  // Nur selbst ausgelieferte Dateien, kein Hugging-Face-Hub, kein CDN.
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = "/models/";
  // Modell einmal in den Cache Storage legen statt bei jedem Besuch ~75 MB neu zu laden. Die
  // HTTP-Cache-Schicht umgehen: Chromium bricht große, unterwegs komprimierte Antworten sonst
  // mit ERR_CACHE_WRITE_FAILURE ab.
  env.useBrowserCache = true;
  env.useWasmCache = false;
  env.fetch = (url, init = {}) => fetch(url, { ...init, cache: "no-store" });
  const abs = (u) => new URL(u, self.location.href).href;
  env.backends.onnx.wasm.wasmPaths = { mjs: abs(ortMjs), wasm: abs(ortWasm) };
  // Ohne Cross-Origin-Isolation gibt es keinen SharedArrayBuffer: einspurig rechnen.
  env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

  let transcriber = null;
  async function load(ctx) {
    transcriber ??= pipeline("automatic-speech-recognition", MODEL, {
      device: "wasm",
      dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
      progress_callback: (p) => {
        if (p.status === "progress" && p.file?.endsWith(".onnx")) ctx?.progress({ stage: "load", file: p.file, loaded: p.loaded, total: p.total });
      },
    });
    try {
      return await transcriber;
    } catch (error) {
      transcriber = null;
      throw new Error(`Modell konnte nicht geladen werden: ${error.message ?? error}`);
    }
  }

  return {
    async load(_payload, ctx) {
      await load(ctx);
      return true;
    },
    async transcribe({ samples, language }, ctx) {
      const asr = await load(ctx);
      const windows = splitWindows(samples, SAMPLE_RATE);
      const chunks = [];
      for (let i = 0; i < windows.length; i++) {
        const { start, end } = windows[i];
        ctx.progress({ stage: "transcribe", done: i, total: windows.length });
        const out = await asr(samples.subarray(start, end), {
          language: language === "auto" ? null : language,
          task: "transcribe",
          return_timestamps: true,
        });
        chunks.push(...shiftChunks(out.chunks ?? [{ text: out.text, timestamp: [0, null] }], start / SAMPLE_RATE, end / SAMPLE_RATE));
      }
      ctx.progress({ stage: "transcribe", done: windows.length, total: windows.length });
      return { chunks: dropHallucinations(chunks), duration: samples.length / SAMPLE_RATE };
    },
  };
});
