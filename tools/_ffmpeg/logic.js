// Reine Hilfsfunktionen rund um ffmpeg (ohne DOM, ohne Worker), damit sie in Vitest laufen.

/** Ab dieser Größe weisen wir auf den begrenzten Speicher im Browser hin (blockieren aber nicht). */
export const LARGE_FILE_BYTES = 500 * 1024 * 1024;

export const VIDEO_ACCEPT =
  "video/*,.mp4,.m4v,.mov,.mkv,.webm,.avi,.wmv,.flv,.3gp,.3g2,.ogv,.mpg,.mpeg,.ts,.mts,.m2ts,.vob";
export const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.ogg,.oga,.opus,.flac,.m4a,.aac,.wma,.aif,.aiff,.amr,.ac3,.mka";

/**
 * Zeitangaben wie "83.5", "1:23.5", "1:02:03", "1:23,5" in Sekunden.
 * Leere Eingabe → null. Ungültig → Error mit verständlicher Meldung.
 */
export function parseTime(input) {
  const text = String(input ?? "").trim().replace(",", ".");
  if (!text) return null;
  const parts = text.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p) && !/^\d*\.\d+$/.test(p))) {
    throw new Error(`Ungültige Zeitangabe: „${input}“ (Beispiel: 1:23.5)`);
  }
  const nums = parts.map(Number);
  // Nur die letzte Stelle darf Nachkommastellen haben, Minuten/Sekunden vor einem ":" höchstens 59.
  for (let i = 0; i < nums.length - 1; i++) {
    if (!Number.isInteger(nums[i])) throw new Error(`Ungültige Zeitangabe: „${input}“ (Beispiel: 1:23.5)`);
  }
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] >= 60) throw new Error(`Ungültige Zeitangabe: „${input}“ (Minuten und Sekunden bis 59)`);
  }
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

/** Sekunden → "1:23.5" bzw. "1:02:03" (für Felder und Anzeigen). */
export function formatTime(seconds, { decimals = 1 } = {}) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const factor = 10 ** decimals;
  const total = Math.round(seconds * factor) / factor;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total - h * 3600 - m * 60;
  let sec = decimals ? s.toFixed(decimals) : String(Math.round(s));
  if (decimals) sec = sec.replace(/\.?0+$/, "");
  if (Number(sec) < 10) sec = `0${sec}`;
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Sekunden als ffmpeg-Argument (ohne Rundungsartefakte). */
export function ffTime(seconds) {
  return String(Math.round(seconds * 1000) / 1000);
}

/** "Duration: 00:01:23.45" aus einer ffmpeg-Logzeile → Sekunden, sonst null. */
export function parseDurationLine(line) {
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/** Fortschrittszeile "… time=00:00:01.23 …" → Sekunden, sonst null. */
export function parseProgressLine(line) {
  const m = /time=\s*(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  if (!m || m[1]) return null;
  return Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
}

/** Anteil 0…1 aus aktueller Zeit und Gesamtdauer; ohne Dauer null. */
export function progressRatio(time, duration) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return null;
  return Math.min(1, Math.max(0, time / duration));
}

export function isLargeFile(bytes) {
  return bytes >= LARGE_FILE_BYTES;
}

export const LARGE_FILE_NOTE =
  "Große Datei: Der Browser hat nur begrenzt Speicher. Wenn es abbricht, nimm eine kürzere Datei oder eine kleinere Auflösung.";

/**
 * Bekannte ffmpeg-Fehlermeldungen → verständlicher deutscher Text.
 * Reihenfolge zählt: spezifisch vor allgemein.
 */
const FAILURES = [
  [/memory access out of bounds|Cannot enlarge memory|Aborted\(OOM\)|out of memory|Cannot allocate memory/i,
    "Der Speicher im Browser hat nicht gereicht. Probier eine kürzere Datei oder eine kleinere Auflösung."],
  [/moov atom not found/i, "Die Datei ist unvollständig oder beschädigt (moov atom fehlt)."],
  [/Stream map '0:v[^']*' matches no streams|does not contain any video stream|no video stream/i, "Kein Videostream gefunden."],
  [/Stream map '0:a[^']*' matches no streams|does not contain any audio stream|no audio stream/i, "Keine Tonspur gefunden."],
  [/Output file (#0 )?does not contain any stream|Output file is empty, nothing was encoded/i,
    "Im gewählten Bereich wurde nichts gefunden, das sich umwandeln lässt."],
  [/Invalid data found when processing input|could not find codec parameters|Failed to read frame size|EBML header parsing failed|unknown format/i,
    "Die Datei ist kein lesbares Video- oder Audioformat."],
  [/Unknown encoder|Encoder not found|Encoder \(codec[^)]*\) not found/i,
    "Dieses Ausgabeformat kann die eingebaute ffmpeg-Version nicht schreiben."],
  [/Decoder \(codec[^)]*\) not found|Unsupported codec|codec not currently supported/i,
    "Der Codec der Datei wird nicht unterstützt."],
  [/height not divisible by 2|width not divisible by 2/i, "Die Bildgröße passt nicht zum Codec (ungerade Breite oder Höhe)."],
  [/Could not write header|Could not find tag for codec/i, "Diese Kombination aus Codec und Container geht nicht."],
];

const NOISE = /^(Aborted\(\)$|\s*(frame=|size=|video:|Stream #|Input #|Output #|Duration:|Metadata:|  |\[.*\] (using|profile|frame I|frame P|kb\/s|mb |ref |Weighted|consecutive|final ratefactor|coded))|Press \[q\])/;

/**
 * @param {string[]} logs ffmpeg-Logzeilen eines fehlgeschlagenen Laufs (auch Exception-Texte)
 * @returns {{message: string, detail: string}}
 */
export function explainFailure(logs) {
  const text = logs.join("\n");
  const hit = FAILURES.find(([re]) => re.test(text));
  const relevant = logs.filter((l) => l.trim() && !NOISE.test(l));
  const detail = relevant.slice(-4).join(" · ").slice(0, 400);
  return {
    message: hit ? hit[1] : "ffmpeg ist mit einem Fehler abgebrochen.",
    detail: detail ? `ffmpeg: ${detail}` : "",
  };
}

/**
 * Filter, der die kürzere Seite auf `maxShort` Pixel begrenzt (hoch- und querformat),
 * nie vergrößert und gerade Kantenlängen erzwingt (nötig für yuv420p).
 */
export function scaleFilter(maxShort) {
  if (!maxShort) return "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  const n = Number(maxShort);
  return (
    `scale='if(gt(iw,ih),-2,trunc(min(${n},iw)/2)*2)'` +
    `:'if(gt(iw,ih),trunc(min(${n},ih)/2)*2,-2)'`
  );
}

/** Dateiendung (klein, ohne Punkt) oder "". */
export function extensionOf(name) {
  return /\.([a-z0-9]{1,5})$/i.exec(name)?.[1].toLowerCase() ?? "";
}

/** Sicherer Name im ffmpeg-Dateisystem; die Endung hilft ffmpeg beim Erkennen des Formats. */
export function inputNameFor(fileName) {
  const ext = extensionOf(fileName);
  return ext ? `input.${ext}` : "input";
}

/** Eingaben werden per WORKERFS unter diesem Verzeichnis eingehängt. */
export const IN_DIR = "/in";
export const inputPath = (name) => `${IN_DIR}/${name}`;
