// Argument-Bau für „Video verkleinern“ (rein, ohne DOM).
import { inputPath, scaleFilter } from "../_ffmpeg/logic.js";

export const CONTAINERS = {
  mp4: { label: "MP4 (H.264 + AAC)", ext: "mp4", mime: "video/mp4" },
  webm: { label: "WebM (VP8 + Opus)", ext: "webm", mime: "video/webm" },
};

export const RESOLUTIONS = [
  { value: 0, label: "Original" },
  { value: 1080, label: "1080p" },
  { value: 720, label: "720p" },
  { value: 480, label: "480p" },
];

/** Qualitätsregler 1 (kleinste Datei) … 10 (beste Qualität). */
export const QUALITY_MIN = 1;
export const QUALITY_MAX = 10;
export const QUALITY_DEFAULT = 5;

/**
 * Regler → CRF. Kleinere CRF = bessere Qualität, größere Datei.
 * x264: 35 … 18 (Standard 23 ≈ Stufe 7), VP8: 48 … 10.
 */
export function crfFor(container, quality) {
  const q = Number(quality);
  if (!Number.isInteger(q) || q < QUALITY_MIN || q > QUALITY_MAX) throw new Error(`Ungültige Qualität: ${quality}`);
  const [worst, best] = container === "webm" ? [48, 10] : [35, 18];
  const t = (q - QUALITY_MIN) / (QUALITY_MAX - QUALITY_MIN);
  return Math.round(worst + (best - worst) * t);
}

/**
 * @param {{inputName: string, container: "mp4"|"webm", quality: number, maxHeight: number, audio: boolean}} o
 * @returns {{args: string[], output: string, mime: string, ext: string}}
 */
export function buildCompressArgs({ inputName, container = "mp4", quality = QUALITY_DEFAULT, maxHeight = 0, audio = true }) {
  const c = CONTAINERS[container];
  if (!c) throw new Error(`Unbekanntes Format: ${container}`);
  if (!RESOLUTIONS.some((r) => r.value === Number(maxHeight))) throw new Error(`Ungültige Auflösung: ${maxHeight}`);
  const crf = String(crfFor(container, quality));
  const output = `output.${c.ext}`;
  const args = ["-i", inputPath(inputName), "-map", "0:v:0"];
  if (audio) args.push("-map", "0:a:0?");
  args.push("-vf", scaleFilter(Number(maxHeight)), "-pix_fmt", "yuv420p");
  if (container === "mp4") {
    // veryfast: im Browser läuft x264 ohne Threads und ohne SIMD-Assembler, also deutlich langsamer als nativ.
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", crf, "-movflags", "+faststart");
    if (audio) args.push("-c:a", "aac", "-b:a", "128k");
  } else {
    // VP8 statt VP9: libvpx-vp9 stürzt im ffmpeg.wasm-Core 0.12.10 ab (memory access out of bounds).
    // -b:v ist bei VP8 mit CRF die Obergrenze; hoch genug, dass die CRF bestimmt.
    args.push("-c:v", "libvpx", "-crf", crf, "-b:v", "20M", "-deadline", "good", "-cpu-used", "5");
    if (audio) args.push("-c:a", "libopus", "-b:a", "96k");
  }
  if (!audio) args.push("-an");
  args.push("-sn", "-dn", "-map_metadata", "0", output);
  return { args, output, mime: c.mime, ext: c.ext };
}
