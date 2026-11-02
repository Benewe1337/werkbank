// tesseract.js mit ausschließlich selbst ausgelieferten Dateien (Worker, Kern, Sprachdaten).
import { createWorker, OEM } from "tesseract.js";
import workerUrl from "tesseract.js/dist/worker.min.js?url";
import coreSimdUrl from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import coreUrl from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
import deuUrl from "@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz?url";
import engUrl from "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url";
// no-inline: sonst bettet Vite die kleine Datei als data:-URL ein (Worker aus data: verbietet die CSP).
import loaderUrl from "./tesseract-loader.js?url&no-inline";

const abs = (url) => new URL(url, location.href).href;

// Kleinstes gültiges Modul mit einer SIMD-Anweisung (wie wasm-feature-detect).
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

/**
 * Startet einen tesseract.js-Worker für `lang` (z. B. "deu+eng").
 * @param {string} lang
 * @param {(m: {status: string, progress: number}) => void} logger
 */
export function startTesseract(lang, logger) {
  const config = {
    worker: abs(workerUrl),
    files: { "deu.traineddata.gz": abs(deuUrl), "eng.traineddata.gz": abs(engUrl) },
  };
  return createWorker(lang, OEM.LSTM_ONLY, {
    workerPath: `${abs(loaderUrl)}#${encodeURIComponent(JSON.stringify(config))}`,
    workerBlobURL: false,
    corePath: abs(WebAssembly.validate(SIMD_PROBE) ? coreSimdUrl : coreUrl),
    langPath: abs("/tessdata"), // wird im Lader auf die echten URLs umgebogen
    gzip: true,
    cacheMethod: "none",
    logger,
    errorHandler: () => {},
  });
}
