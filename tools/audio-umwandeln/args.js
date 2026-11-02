// Argument-Bau für „Audio umwandeln“ (rein, ohne DOM).
import { inputPath } from "../_ffmpeg/logic.js";

/** Formate, deren Encoder im ffmpeg-Core enthalten sind (geprüft mit `ffmpeg -encoders`). */
export const FORMATS = {
  mp3: { label: "MP3", ext: "mp3", mime: "audio/mpeg", codec: ["-c:a", "libmp3lame"], bitrate: true },
  m4a: { label: "M4A (AAC)", ext: "m4a", mime: "audio/mp4", codec: ["-c:a", "aac"], bitrate: true },
  ogg: { label: "OGG (Vorbis)", ext: "ogg", mime: "audio/ogg", codec: ["-c:a", "libvorbis"], bitrate: "quality" },
  opus: { label: "Opus", ext: "opus", mime: "audio/ogg", codec: ["-c:a", "libopus"], bitrate: true },
  flac: { label: "FLAC (verlustfrei)", ext: "flac", mime: "audio/flac", codec: ["-c:a", "flac"], bitrate: false },
  wav: { label: "WAV (unkomprimiert)", ext: "wav", mime: "audio/wav", codec: ["-c:a", "pcm_s16le"], bitrate: false },
};

export const BITRATES = [96, 128, 160, 192, 256, 320];

/**
 * Vorbis lehnt feste Bitraten ab, die nicht zu Abtastrate und Kanälen passen (z. B. 192k bei Mono 22 kHz).
 * Deshalb Qualitätsstufe statt Bitrate; die Werte entsprechen bei Stereo 44,1 kHz etwa der Bitrate.
 */
export const VORBIS_QUALITY = { 96: 2, 128: 4, 160: 5, 192: 6, 256: 8, 320: 9 };

/**
 * @param {{inputName: string, format: keyof FORMATS, bitrate?: number}} opts
 * @returns {{args: string[], output: string, mime: string, ext: string}}
 */
export function buildAudioArgs({ inputName, format, bitrate = 192 }) {
  const f = FORMATS[format];
  if (!f) throw new Error(`Unbekanntes Format: ${format}`);
  const output = `output.${f.ext}`;
  const args = ["-i", inputPath(inputName), "-map", "0:a:0", "-vn", "-sn", "-dn", ...f.codec];
  if (f.bitrate) {
    if (!BITRATES.includes(Number(bitrate))) throw new Error(`Ungültige Bitrate: ${bitrate}`);
    if (f.bitrate === "quality") args.push("-q:a", String(VORBIS_QUALITY[bitrate]));
    else args.push("-b:a", `${bitrate}k`);
  }
  // MP3 unter 32 kHz (MPEG-2) erlaubt höchstens 160 kbit/s: auf eine MPEG-1-Rate heben, 44,1/48 kHz bleiben.
  if (format === "mp3") args.push("-af", "aformat=sample_rates=48000|44100|32000", "-id3v2_version", "3");
  if (format === "m4a") args.push("-movflags", "+faststart");
  // Metadaten (Titel, Interpret …) übernehmen.
  args.push("-map_metadata", "0", output);
  return { args, output, mime: f.mime, ext: f.ext };
}
