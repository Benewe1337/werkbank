// Testmedien, zur Laufzeit in Node erzeugt (keine Binärdateien im Repo).
// AVI mit unkomprimiertem Bild (rawvideo, BGR24) und PCM-Ton: von Hand geschrieben, damit Dauer,
// Bildrate und Bildanzahl exakt bekannt sind und kein Browser-Codec im Spiel ist.

const SAMPLE_RATE = 22050;

function sineSamples(seconds, freq, sampleRate = SAMPLE_RATE) {
  const n = Math.round(seconds * sampleRate);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 12000), i * 2);
  }
  return pcm;
}

function waveFormat(sampleRate) {
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); // PCM
  fmt.writeUInt16LE(1, 2); // mono
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * 2, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(16, 14);
  return fmt;
}

/** WAV, mono, 16 bit, Sinuston. */
export function makeWav({ seconds = 2, freq = 440, sampleRate = SAMPLE_RATE } = {}) {
  const pcm = sineSamples(seconds, freq, sampleRate);
  return Buffer.concat([
    Buffer.from("RIFF"),
    u32(36 + pcm.length),
    Buffer.from("WAVEfmt "),
    u32(16),
    waveFormat(sampleRate),
    Buffer.from("data"),
    u32(pcm.length),
    pcm,
  ]);
}

const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};

const chunk = (id, data) => {
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(id), u32(data.length), data, pad]);
};
const list = (type, ...parts) => chunk("LIST", Buffer.concat([Buffer.from(type), ...parts]));

/** Ein Bild: Farbverlauf, der mit jedem Bild wandert, plus heller Balken an Position des Bildindex. */
function frame(width, height, index, frames) {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const buf = Buffer.alloc(stride * height);
  const bar = Math.floor((index / frames) * width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * stride + x * 3;
      const onBar = Math.abs(x - bar) < 4;
      buf[o] = onBar ? 255 : (x * 2 + index * 5) & 255; // B
      buf[o + 1] = onBar ? 255 : (y * 2) & 255; // G
      buf[o + 2] = onBar ? 255 : (255 - x - index * 3) & 255; // R
    }
  }
  return buf;
}

/**
 * AVI (RIFF) mit rawvideo BGR24 und optional PCM-Ton.
 * @returns {Buffer}
 */
export function makeAvi({ width = 160, height = 120, fps = 10, seconds = 2, audio = true, freq = 440 } = {}) {
  const frames = Math.round(fps * seconds);
  const frameSize = Math.ceil((width * 3) / 4) * 4 * height;
  const samplesPerFrame = SAMPLE_RATE / fps;
  const streams = audio ? 2 : 1;

  const avih = Buffer.concat([
    u32(Math.round(1e6 / fps)), // µs pro Bild
    u32(frameSize * fps), // max Bytes/s
    u32(0),
    u32(0x10), // AVIF_HASINDEX
    u32(frames),
    u32(0),
    u32(streams),
    u32(frameSize),
    u32(width),
    u32(height),
    Buffer.alloc(16),
  ]);

  const strhVideo = Buffer.concat([
    Buffer.from("vids"),
    u32(0), // fccHandler: BI_RGB
    u32(0),
    u16(0),
    u16(0),
    u32(0),
    u32(1), // scale
    u32(fps), // rate
    u32(0),
    u32(frames),
    u32(frameSize),
    u32(0xffffffff),
    u32(0),
    u16(0),
    u16(0),
    u16(width),
    u16(height),
  ]);
  const bih = Buffer.concat([
    u32(40),
    u32(width),
    u32(height),
    u16(1),
    u16(24),
    u32(0),
    u32(frameSize),
    u32(0),
    u32(0),
    u32(0),
    u32(0),
  ]);

  const strls = [list("strl", chunk("strh", strhVideo), chunk("strf", bih))];
  if (audio) {
    const strhAudio = Buffer.concat([
      Buffer.from("auds"),
      u32(0),
      u32(0),
      u16(0),
      u16(0),
      u32(0),
      u32(1),
      u32(SAMPLE_RATE),
      u32(0),
      u32(Math.round(seconds * SAMPLE_RATE)),
      u32(SAMPLE_RATE * 2),
      u32(0xffffffff),
      u32(2),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
    ]);
    strls.push(list("strl", chunk("strh", strhAudio), chunk("strf", waveFormat(SAMPLE_RATE))));
  }
  const hdrl = list("hdrl", chunk("avih", avih), ...strls);

  const pcm = audio ? sineSamples(seconds, freq) : null;
  const movieParts = [];
  const index = [];
  let offset = 4; // relativ zum Beginn der Daten von 'movi' (nach dem Typ)
  const add = (id, data, key) => {
    const c = chunk(id, data);
    index.push(Buffer.concat([Buffer.from(id), u32(key ? 0x10 : 0), u32(offset), u32(data.length)]));
    movieParts.push(c);
    offset += c.length;
  };
  for (let i = 0; i < frames; i++) {
    add("00db", frame(width, height, i, frames), true);
    if (pcm) {
      const from = Math.round(i * samplesPerFrame) * 2;
      const to = Math.round((i + 1) * samplesPerFrame) * 2;
      add("01wb", pcm.subarray(from, to), true);
    }
  }
  const movi = list("movi", ...movieParts);
  const idx1 = chunk("idx1", Buffer.concat(index));
  const body = Buffer.concat([Buffer.from("AVI "), hdrl, movi, idx1]);
  return Buffer.concat([Buffer.from("RIFF"), u32(body.length), body]);
}

/** Bytes, die keine Mediendatei sind (für Fehlerfälle). */
export function makeGarbage(size = 4096) {
  const b = Buffer.alloc(size);
  for (let i = 0; i < size; i++) b[i] = (i * 7919 + 13) & 255;
  return b;
}

// ---- Prüfen der Ergebnisse ----

/** Kästchen (Boxen) einer MP4/MOV/M4A-Datei auf oberster Ebene bzw. in einem Bereich. */
function* boxes(buf, start = 0, end = buf.length) {
  let o = start;
  while (o + 8 <= end) {
    let size = buf.readUInt32BE(o);
    const type = buf.toString("latin1", o + 4, o + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(o + 8));
      header = 16;
    } else if (size === 0) size = end - o;
    if (size < header) return;
    yield { type, start: o, body: o + header, end: o + size };
    o += size;
  }
}

/** Dauer einer MP4/M4A in Sekunden aus moov/mvhd. */
export function mp4Duration(bytes) {
  const buf = Buffer.from(bytes);
  for (const box of boxes(buf)) {
    if (box.type !== "moov") continue;
    for (const inner of boxes(buf, box.body, box.end)) {
      if (inner.type !== "mvhd") continue;
      const version = buf[inner.body];
      if (version === 1) {
        const timescale = buf.readUInt32BE(inner.body + 20);
        return Number(buf.readBigUInt64BE(inner.body + 24)) / timescale;
      }
      const timescale = buf.readUInt32BE(inner.body + 12);
      return buf.readUInt32BE(inner.body + 16) / timescale;
    }
  }
  return null;
}

/** Codec-Kennungen (stsd) aller Spuren einer MP4, z. B. ["avc1", "mp4a"]. */
export function mp4Codecs(bytes) {
  const buf = Buffer.from(bytes);
  const out = [];
  const walk = (start, end) => {
    for (const b of boxes(buf, start, end)) {
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(b.type)) walk(b.body, b.end);
      if (b.type === "stsd") out.push(buf.toString("latin1", b.body + 12, b.body + 16));
    }
  };
  walk(0, buf.length);
  return out;
}

export const startsWith = (bytes, text, offset = 0) =>
  Buffer.from(bytes).subarray(offset, offset + text.length).toString("latin1") === text;

/** Anzahl Bilder laut AVI-Hauptkopf (dwTotalFrames). */
export function aviTotalFrames(bytes) {
  const buf = Buffer.from(bytes);
  const i = buf.indexOf("avih");
  return i < 0 ? null : buf.readUInt32LE(i + 8 + 16);
}

/** Dauer einer PCM-WAV in Sekunden. */
export function wavDuration(bytes) {
  const buf = Buffer.from(bytes);
  let o = 12;
  let byteRate = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString("latin1", o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(o + 16);
    if (id === "data") return byteRate ? size / byteRate : null;
    o += 8 + size + (size % 2);
  }
  return null;
}

/** Bildanzahl und Größe eines GIF (Zählt Image-Descriptor-Blöcke). */
export function gifInfo(bytes) {
  const buf = Buffer.from(bytes);
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  let o = 13;
  if (buf[10] & 0x80) o += 3 * 2 ** ((buf[10] & 7) + 1);
  let frames = 0;
  const skipSub = () => {
    while (buf[o] !== 0) o += buf[o] + 1;
    o += 1;
  };
  while (o < buf.length) {
    const b = buf[o];
    if (b === 0x3b) break;
    if (b === 0x21) {
      o += 2;
      skipSub();
    } else if (b === 0x2c) {
      frames++;
      const flags = buf[o + 9];
      o += 10;
      if (flags & 0x80) o += 3 * 2 ** ((flags & 7) + 1);
      o += 1; // LZW min code size
      skipSub();
    } else break;
  }
  return { width, height, frames };
}
