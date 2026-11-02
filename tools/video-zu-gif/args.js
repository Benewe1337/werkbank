// Argument-Bau und Prüfung für „Video in GIF“ (rein, ohne DOM).
import { ffTime, inputPath } from "../_ffmpeg/logic.js";

export const FPS_OPTIONS = [5, 8, 10, 12, 15, 20, 25];
export const WIDTH_OPTIONS = [240, 320, 480, 640, 800];
export const MAX_DURATION = 30;
export const PALETTE = "palette.png";
export const OUTPUT = "output.gif";

/**
 * @param {{start: number|null, duration: number|null, fps: number, width: number}} o
 * @returns {{start: number, duration: number, fps: number, width: number}}
 */
export function validateGifOptions({ start, duration, fps, width }, videoDuration = null) {
  const s = start ?? 0;
  if (s < 0) throw new Error("Der Start darf nicht negativ sein.");
  if (videoDuration != null && s >= videoDuration) throw new Error("Der Start liegt hinter dem Ende des Videos.");
  let d = duration ?? 5;
  if (d <= 0) throw new Error("Die Dauer muss größer als 0 sein.");
  if (d > MAX_DURATION) throw new Error(`Höchstens ${MAX_DURATION} Sekunden, sonst wird das GIF riesig.`);
  if (videoDuration != null) d = Math.min(d, videoDuration - s);
  if (!FPS_OPTIONS.includes(Number(fps))) throw new Error(`Ungültige Bildrate: ${fps}`);
  if (!WIDTH_OPTIONS.includes(Number(width))) throw new Error(`Ungültige Breite: ${width}`);
  return { start: s, duration: d, fps: Number(fps), width: Number(width) };
}

/**
 * Zwei Durchgänge: erst eine Palette aus den tatsächlich vorkommenden Farben (palettegen),
 * dann das GIF mit dieser Palette (paletteuse). Ergibt deutlich sauberere Farben als die Standardpalette.
 * Nie größer skalieren als das Original.
 * @returns {{commands: string[][], output: string, temp: string[]}}
 */
export function buildGifCommands({ inputName, start, duration, fps, width }) {
  const input = [...(start > 0 ? ["-ss", ffTime(start)] : []), "-t", ffTime(duration), "-i", inputPath(inputName)];
  const base = `fps=${fps},scale='min(${width},iw)':-2:flags=lanczos`;
  return {
    commands: [
      [...input, "-vf", `${base},palettegen=stats_mode=diff`, "-frames:v", "1", "-update", "1", PALETTE],
      [...input, "-i", PALETTE, "-lavfi", `${base}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, "-loop", "0", OUTPUT],
    ],
    output: OUTPUT,
    temp: [PALETTE],
  };
}
