// Reine Logik der Transkription (ohne DOM, in Node testbar): Abschnitte, Zeitstempel, SRT/VTT.

export const SAMPLE_RATE = 16_000;
/** Whisper verarbeitet höchstens 30 s am Stück. */
export const WINDOW_S = 30;
/** Im letzten Stück eines Fensters nach einer leisen Stelle zum Schneiden suchen. */
export const SEARCH_S = 6;
const FRAME_S = 0.02;

export const LANGUAGES = { auto: "automatisch erkennen", german: "Deutsch", english: "Englisch" };

/** Mehrere Kanäle zu Mono mitteln (neues Array, Eingaben bleiben unverändert). */
export function mixToMono(channels) {
  if (channels.length === 0) throw new Error("Die Datei enthält keine Tonspur.");
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

function rms(samples, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return to > from ? Math.sqrt(sum / (to - from)) : 0;
}

/**
 * Teilt Audio in Fenster ≤ WINDOW_S. Geschnitten wird an der leisesten Stelle der letzten
 * SEARCH_S Sekunden eines Fensters, damit möglichst kein Wort zerschnitten wird.
 * @returns {{start: number, end: number}[]} Sample-Indizes
 */
export function splitWindows(samples, rate = SAMPLE_RATE, windowS = WINDOW_S, searchS = SEARCH_S) {
  const total = samples.length;
  const max = Math.floor(windowS * rate);
  const frame = Math.max(1, Math.floor(FRAME_S * rate));
  const windows = [];
  let start = 0;
  while (start < total) {
    if (total - start <= max) {
      windows.push({ start, end: total });
      break;
    }
    let cut = start + max;
    let quietest = Infinity;
    for (let f = start + max - Math.floor(searchS * rate); f + frame <= start + max; f += frame) {
      const level = rms(samples, f, f + frame);
      if (level < quietest) {
        quietest = level;
        cut = f + Math.floor(frame / 2);
      }
    }
    windows.push({ start, end: cut });
    start = cut;
  }
  return windows;
}

/**
 * Whisper-Chunks eines Fensters auf die Gesamtzeit verschieben; fehlende Endzeiten auffüllen.
 * @param {{text: string, timestamp: [number, number|null]}[]} chunks
 * @param {number} offset Sekunden
 * @param {number} windowEnd Sekunden (Ende des Fensters)
 */
export function shiftChunks(chunks, offset, windowEnd) {
  return chunks
    .map((c, i) => {
      const start = offset + (c.timestamp?.[0] ?? 0);
      const nextStart = chunks[i + 1]?.timestamp?.[0];
      const rawEnd = c.timestamp?.[1] ?? (nextStart != null ? nextStart : null);
      const end = rawEnd == null ? windowEnd : Math.min(windowEnd, offset + rawEnd);
      return { text: c.text.trim(), start, end: Math.max(start, end) };
    })
    .filter((c) => c.text);
}

/** Bekannte Halluzinationen von Whisper bei Stille entfernen (z. B. „Untertitel im Auftrag des ZDF“). */
const HALLUCINATIONS = [/^untertitel(ung)? (im auftrag|der amara|von stephanie)/i, /^\[?(musik|music|stille|applaus)\]?\.?$/i, /^vielen dank( fürs zuschauen)?\.?$/i];
export function dropHallucinations(chunks) {
  return chunks.filter((c) => !HALLUCINATIONS.some((re) => re.test(c.text)));
}

/** 3725.5 → "01:02:05,500" (SRT) bzw. "01:02:05.500" (VTT). */
export function formatTimestamp(seconds, separator = ",") {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

export function toSrt(chunks) {
  return chunks
    .map((c, i) => `${i + 1}\n${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${c.text}\n`)
    .join("\n");
}

export function toVtt(chunks) {
  const cues = chunks.map((c) => `${formatTimestamp(c.start, ".")} --> ${formatTimestamp(c.end, ".")}\n${c.text}\n`);
  return `WEBVTT\n\n${cues.join("\n")}`;
}

/** Fließtext: Chunks mit Leerzeichen verbinden, nach längeren Pausen ein neuer Absatz. */
export function toText(chunks, pauseS = 2) {
  let out = "";
  chunks.forEach((c, i) => {
    if (i > 0) out += c.start - chunks[i - 1].end >= pauseS ? "\n\n" : " ";
    out += c.text;
  });
  return out ? `${out}\n` : "";
}

/** „1 Min. 5 s“ für Status und Restzeit. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} Std. ${m} Min.`;
  return s % 60 ? `${m} Min. ${s % 60} s` : `${m} Min.`;
}
