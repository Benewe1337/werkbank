// Hintergrund entfernen mit dem IS-Net-Modell von IMG.LY (quantisiert, „isnet_quint8“) über onnxruntime-web.
// Die Vor- und Nachverarbeitung entspricht @imgly/background-removal 1.7.0, ist hier aber ohne ndarray
// nachgebaut: ndarray erzeugt Code per new Function, das verbietet unsere CSP (kein 'unsafe-eval').
// Modell und resources.json kommen von dieser Website (/models/imgly/, beim Build über assets.json geladen).

export const MODEL_KEY = "/models/isnet_quint8";
export const RESOLUTION = 1024;
const MEAN = 128;
const STD = 256;

/** Basis-URL der Modelldateien auf der eigenen Herkunft. */
export const modelBase = (origin) => new URL("/models/imgly/", origin).href;

/**
 * Lädt eine Ressource, die imgly in Teile zerlegt (resources.json → chunks), und setzt sie zusammen.
 * @param {(url: string) => Promise<Response>} fetchFn
 * @param {string} base
 * @param {string} key z. B. "/models/isnet_quint8"
 * @param {(loaded: number, total: number) => void} [onProgress]
 * @returns {Promise<Uint8Array>}
 */
export async function loadChunked(fetchFn, base, key, onProgress = () => {}) {
  const res = await fetchFn(new URL("resources.json", base).href);
  if (!res.ok) throw new Error(`Modellbeschreibung fehlt (HTTP ${res.status}).`);
  const entry = (await res.json())[key];
  if (!entry) throw new Error(`Modell ${key} ist auf dem Server nicht vorhanden.`);
  const out = new Uint8Array(entry.size);
  let loaded = 0;
  await Promise.all(
    entry.chunks.map(async ({ name, offsets: [from, to] }) => {
      const r = await fetchFn(new URL(name, base).href);
      if (!r.ok) throw new Error(`Modellteil fehlt (HTTP ${r.status}).`);
      const part = new Uint8Array(await r.arrayBuffer());
      if (part.length !== to - from) throw new Error("Modellteil ist unvollständig. Bitte Seite neu laden.");
      out.set(part, from);
      loaded += part.length;
      onProgress(loaded, entry.size);
    }),
  );
  return out;
}

/**
 * Bilineares Skalieren (wie imgly: nicht proportional, Ecken auf Ecken).
 * @param {ArrayLike<number>} src
 * @param {number} sw
 * @param {number} sh
 * @param {number} channels
 * @param {number} dw
 * @param {number} dh
 * @param {Uint8Array|Uint8ClampedArray|Float32Array} [out]
 */
export function resizeBilinear(src, sw, sh, channels, dw, dh, out = new Uint8ClampedArray(dw * dh * channels)) {
  const sx = sw / dw;
  const sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = y * sy;
    const y1 = Math.floor(fy);
    const y2 = Math.min(Math.ceil(fy), sh - 1);
    const dy = fy - y1;
    for (let x = 0; x < dw; x++) {
      const fx = x * sx;
      const x1 = Math.floor(fx);
      const x2 = Math.min(Math.ceil(fx), sw - 1);
      const dx = fx - x1;
      for (let c = 0; c < channels; c++) {
        const p1 = src[(y1 * sw + x1) * channels + c];
        const p2 = src[(y1 * sw + x2) * channels + c];
        const p3 = src[(y2 * sw + x1) * channels + c];
        const p4 = src[(y2 * sw + x2) * channels + c];
        out[(y * dw + x) * channels + c] = (1 - dx) * (1 - dy) * p1 + dx * (1 - dy) * p2 + (1 - dx) * dy * p3 + dx * dy * p4;
      }
    }
  }
  return out;
}

/** RGBA-Bild → Eingabetensor [1, 3, 1024, 1024] (planar, (v − 128) / 256). */
export function toInputTensor({ data, width, height }) {
  const resized = resizeBilinear(data, width, height, 4, RESOLUTION, RESOLUTION);
  const stride = RESOLUTION * RESOLUTION;
  const out = new Float32Array(3 * stride);
  for (let i = 0, j = 0; j < stride; i += 4, j++) {
    out[j] = (resized[i] - MEAN) / STD;
    out[j + stride] = (resized[i + 1] - MEAN) / STD;
    out[j + 2 * stride] = (resized[i + 2] - MEAN) / STD;
  }
  return out;
}

/** Modellausgabe (1024², 0–1) → Alphamaske in Originalgröße. */
export function maskFromOutput(output, width, height) {
  const mask = new Uint8ClampedArray(output.length);
  for (let i = 0; i < output.length; i++) mask[i] = output[i] * 255;
  return resizeBilinear(mask, RESOLUTION, RESOLUTION, 1, width, height);
}

/** Maske als Alphakanal einsetzen; liefert neue Pixel. */
export function applyMask({ data, width, height }, mask) {
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < mask.length; i++) out[i * 4 + 3] = Math.min(data[i * 4 + 3], mask[i]);
  return { data: out, width, height };
}

/** Anteil (0–1) der Pixel, die ganz oder teilweise durchsichtig sind. */
export function transparentShare({ data }) {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) n++;
  return n / (data.length / 4);
}

/** Fortschritt als kurzer deutscher Text. */
export function describeProgress({ step, loaded = 0, total = 0 }) {
  const mb = (n) => Math.round(n / 1024 / 1024);
  if (step === "model") return `Modell wird geladen: ${mb(loaded)} von ${mb(total)} MB`;
  if (step === "decode") return "Bild wird gelesen …";
  if (step === "infer") return "Hintergrund wird erkannt …";
  if (step === "encode") return "PNG wird gespeichert …";
  return "Wird verarbeitet …";
}
