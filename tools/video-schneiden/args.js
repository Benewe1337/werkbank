// Argument-Bau und Prüfung für „Video schneiden“ (rein, ohne DOM).
import { extensionOf, ffTime, formatTime, inputPath } from "../_ffmpeg/logic.js";

/** Container, in die ffmpeg beim Stream-Copy zuverlässig zurückschreiben kann. */
const COPY_CONTAINERS = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo",
  ts: "video/mp2t",
  mts: "video/mp2t",
  m2ts: "video/mp2t",
  "3gp": "video/3gpp",
  ogv: "video/ogg",
  flv: "video/x-flv",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
};

const MIN_LENGTH = 0.05;

/**
 * Prüft Start/Ende (Sekunden; Ende null = bis zum Schluss).
 * @returns {{start: number, end: number|null, length: number|null}}
 */
export function validateRange(start, end, duration = null) {
  const s = start ?? 0;
  if (s < 0) throw new Error("Der Start darf nicht negativ sein.");
  if (duration != null && s >= duration) throw new Error(`Der Start liegt hinter dem Ende des Videos (${formatTime(duration)}).`);
  if (end != null) {
    if (end <= s) throw new Error("Das Ende muss nach dem Start liegen.");
    if (end - s < MIN_LENGTH) throw new Error("Der Abschnitt ist zu kurz.");
  }
  const e = end != null && duration != null ? Math.min(end, duration) : end;
  const length = e != null ? e - s : duration != null ? duration - s : null;
  return { start: s, end: e, length };
}

/**
 * @param {{inputName: string, fileName: string, start: number, end: number|null, mode: "fast"|"exact"}} o
 * @returns {{args: string[], output: string, mime: string, ext: string}}
 */
export function buildTrimArgs({ inputName, fileName, start, end, mode }) {
  const seek = start > 0 ? ["-ss", ffTime(start)] : [];
  const length = end != null ? ["-t", ffTime(end - start)] : [];
  const sourceExt = extensionOf(fileName);

  if (mode === "fast") {
    const ext = COPY_CONTAINERS[sourceExt] ? sourceExt : "mkv";
    const output = `output.${ext}`;
    const args = [
      ...seek, "-i", inputPath(inputName), ...length,
      "-map", "0:v?", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero",
    ];
    if (["mp4", "m4v", "mov"].includes(ext)) args.push("-movflags", "+faststart");
    args.push("-map_metadata", "0", output);
    return { args, output, mime: COPY_CONTAINERS[ext] ?? "video/x-matroska", ext };
  }
  if (mode !== "exact") throw new Error(`Unbekannter Modus: ${mode}`);

  const webm = sourceExt === "webm";
  const ext = webm ? "webm" : "mp4";
  const output = `output.${ext}`;
  const args = [...seek, "-i", inputPath(inputName), ...length, "-map", "0:v:0", "-map", "0:a:0?"];
  args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-pix_fmt", "yuv420p");
  // VP8, weil libvpx-vp9 im ffmpeg.wasm-Core abstürzt.
  if (webm) args.push("-c:v", "libvpx", "-crf", "12", "-b:v", "20M", "-deadline", "good", "-cpu-used", "5", "-c:a", "libopus", "-b:a", "128k");
  else args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart");
  args.push("-map_metadata", "0", output);
  return { args, output, mime: webm ? "video/webm" : "video/mp4", ext };
}
