// Testbilder für die Bild-Werkzeuge, zur Laufzeit erzeugt (keine Binärdateien im Repo).
// Läuft in Node (Vitest und Playwright-Runner): die @jsquash-Codecs bekommen ihre .wasm hier direkt.
import fs from "node:fs";
import path from "node:path";

globalThis.ImageData ??= class ImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
};

const root = path.resolve(import.meta.dirname, "../..");
const wasm = (rel) => WebAssembly.compile(fs.readFileSync(path.join(root, "node_modules", rel)));

let ready;
/** Initialisiert alle @jsquash-Codecs für Node (dort klappt das automatische Laden per fetch nicht). */
export function initNodeCodecs() {
  ready ??= (async () => {
    const pairs = [
      ["@jsquash/jpeg/encode.js", "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm"],
      ["@jsquash/jpeg/decode.js", "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm"],
      ["@jsquash/webp/encode.js", "@jsquash/webp/codec/enc/webp_enc_simd.wasm"],
      ["@jsquash/webp/decode.js", "@jsquash/webp/codec/dec/webp_dec.wasm"],
      ["@jsquash/avif/encode.js", "@jsquash/avif/codec/enc/avif_enc.wasm"],
      ["@jsquash/avif/decode.js", "@jsquash/avif/codec/dec/avif_dec.wasm"],
      ["@jsquash/png/encode.js", "@jsquash/png/codec/pkg/squoosh_png_bg.wasm"],
      ["@jsquash/png/decode.js", "@jsquash/png/codec/pkg/squoosh_png_bg.wasm"],
      ["@jsquash/oxipng/optimise.js", "@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm"],
    ];
    for (const [mod, file] of pairs) await (await import(mod)).init(await wasm(file));
    await (await import("@jsquash/resize")).initResize(await wasm("@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm"));
  })();
  return ready;
}

/** RGBA-Bild mit Verlauf; alpha: "opaque" | "half" (linke Hälfte durchsichtig). */
export function makePixels(width, height, alpha = "opaque") {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 255) / width;
      data[i + 1] = (y * 255) / height;
      data[i + 2] = 160;
      data[i + 3] = alpha === "half" && x < width / 2 ? 0 : 255;
    }
  }
  return new ImageData(data, width, height);
}

export async function encodeAs(format, image, quality = 90) {
  await initNodeCodecs();
  const mod = {
    jpeg: "@jsquash/jpeg/encode.js",
    png: "@jsquash/png/encode.js",
    webp: "@jsquash/webp/encode.js",
    avif: "@jsquash/avif/encode.js",
  }[format];
  return new Uint8Array(await (await import(mod)).default(image, format === "png" ? {} : { quality, speed: 8 }));
}

export async function decodeAs(format, bytes) {
  await initNodeCodecs();
  const mod = { jpeg: "@jsquash/jpeg/decode.js", png: "@jsquash/png/decode.js", webp: "@jsquash/webp/decode.js", avif: "@jsquash/avif/decode.js" }[format];
  const buffer = Uint8Array.from(bytes).buffer;
  return (await import(mod)).default(buffer);
}

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const u32be = (n) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const u32le = (n) => Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * TIFF/EXIF-Block (little endian) mit Kamera, Ausrichtung und GPS-Position.
 * @param {{make?: string, orientation?: number, gps?: {lat: number, lon: number}}} tags
 */
export function makeExifTiff({ make = "Testkamera", orientation = 1, gps = { lat: 52.5, lon: 13.25 } } = {}) {
  // Aufbau: Kopf (8) | IFD0 | GPS-IFD | Datenbereich
  const ifd0 = [
    { tag: 0x010f, type: 2, value: ascii(`${make}\0`) },
    { tag: 0x0112, type: 3, value: orientation },
  ];
  if (gps) ifd0.push({ tag: 0x8825, type: 4, value: 0 }); // wird unten gesetzt
  const rational = (v) => {
    const d = Math.floor(v);
    const m = Math.floor((v - d) * 60);
    const s = Math.round(((v - d) * 60 - m) * 60 * 100);
    return concat(u32le(d), u32le(1), u32le(m), u32le(1), u32le(s), u32le(100));
  };
  const gpsIfd = gps
    ? [
        { tag: 1, type: 2, value: ascii(gps.lat >= 0 ? "N\0" : "S\0") },
        { tag: 2, type: 5, value: rational(Math.abs(gps.lat)), count: 3 },
        { tag: 3, type: 2, value: ascii(gps.lon >= 0 ? "E\0" : "W\0") },
        { tag: 4, type: 5, value: rational(Math.abs(gps.lon)), count: 3 },
      ]
    : [];
  const ifdSize = (n) => 2 + n * 12 + 4;
  const ifd0Off = 8;
  const gpsOff = ifd0Off + ifdSize(ifd0.length);
  let dataOff = gpsOff + (gps ? ifdSize(gpsIfd.length) : 0);
  if (gps) ifd0[2].value = gpsOff;
  const data = [];
  const writeIfd = (entries) => {
    const parts = [Uint8Array.of(entries.length & 255, entries.length >> 8)];
    for (const e of entries) {
      const head = concat(Uint8Array.of(e.tag & 255, e.tag >> 8, e.type, 0));
      if (typeof e.value === "number") {
        const val = e.type === 3 ? Uint8Array.of(e.value & 255, e.value >> 8, 0, 0) : u32le(e.value);
        parts.push(head, u32le(1), val);
      } else {
        const count = e.count ?? e.value.length;
        if (e.value.length <= 4) {
          const val = new Uint8Array(4);
          val.set(e.value);
          parts.push(head, u32le(count), val);
        } else {
          parts.push(head, u32le(count), u32le(dataOff));
          data.push(e.value);
          dataOff += e.value.length;
        }
      }
    }
    parts.push(u32le(0));
    return concat(...parts);
  };
  const a = writeIfd(ifd0);
  const b = gps ? writeIfd(gpsIfd) : new Uint8Array();
  return concat(ascii("II*\0"), u32le(ifd0Off), a, b, ...data);
}

/** JPEG mit EXIF (APP1), XMP (APP1), IPTC (APP13) und Kommentar. */
export async function makeJpegWithMetadata(opts = {}) {
  const jpeg = await encodeAs("jpeg", makePixels(opts.width ?? 40, opts.height ?? 24));
  const segment = (marker, payload) => concat(Uint8Array.of(0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255), payload);
  const exif = segment(0xe1, concat(ascii("Exif\0\0"), makeExifTiff(opts)));
  const xmp = segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:creator>Erika Muster</dc:creator></x:xmpmeta>'));
  const iptc = segment(0xed, ascii("Photoshop 3.0\0" + "8BIM\x04\x04\0\0\0\0\0\x0c\x1c\x02\x50\0\x08Erika M."));
  const comment = segment(0xfe, ascii("geheimer Kommentar"));
  // Hinter SOI (2 Bytes) einsetzen; mozjpeg schreibt selbst ein APP0/JFIF.
  return concat(jpeg.subarray(0, 2), exif, xmp, iptc, comment, jpeg.subarray(2));
}

export function pngChunk(type, payload) {
  const body = concat(ascii(type), payload);
  return concat(u32be(payload.length), body, u32be(crc32(body)));
}

/** PNG mit tEXt, iTXt, eXIf (inkl. GPS) und tIME. */
export async function makePngWithMetadata(opts = {}) {
  const png = await encodeAs("png", makePixels(opts.width ?? 30, opts.height ?? 20, "half"));
  const ihdrEnd = 8 + 25;
  const extra = concat(
    pngChunk("tEXt", ascii("Author\0Erika Muster")),
    pngChunk("iTXt", ascii("Comment\0\0\0\0\0geheim")),
    pngChunk("eXIf", makeExifTiff(opts)),
    pngChunk("tIME", Uint8Array.of(0x07, 0xe8, 1, 2, 3, 4, 5)),
  );
  return concat(png.subarray(0, ihdrEnd), extra, png.subarray(ihdrEnd));
}

/** WebP (VP8X) mit EXIF- und XMP-Chunk. */
export async function makeWebpWithMetadata(opts = {}) {
  const width = opts.width ?? 30;
  const height = opts.height ?? 20;
  const webp = await encodeAs("webp", makePixels(width, height));
  const chunk = (type, payload) => concat(ascii(type), u32le(payload.length), payload, payload.length % 2 ? new Uint8Array(1) : new Uint8Array());
  const u24 = (n) => Uint8Array.of(n & 255, (n >> 8) & 255, (n >> 16) & 255);
  const vp8x = chunk("VP8X", concat(Uint8Array.of(0x08 | 0x04, 0, 0, 0), u24(width - 1), u24(height - 1)));
  const body = concat(ascii("WEBP"), vp8x, webp.subarray(12), chunk("EXIF", makeExifTiff(opts)), chunk("XMP ", ascii("<x:xmpmeta>Erika</x:xmpmeta>")));
  return concat(ascii("RIFF"), u32le(body.length), body);
}

// HEVC-Daten zweier 64×48-Bilder (orange und blau, jeweils mit weißem Viertel). Einmalig mit macOS ImageIO
// kodiert; hier bauen wir daraus per Code den HEIF-Container. libheif-js kann selbst nicht kodieren.
const HVCC =
  "010370000000b000000000001ef000fcfdf8f800000b03a00001001740010c01ffff037000000300b0000003000003001e7024a100010023420101037000000300b0000003000003001ea0142041c18c4e21ee45954dc080818020a2000100094401c06172c8405324";
const HEVC_FRAMES = [
  "0000003a2801afa35b2ab4ee383bfffe86f6cba472f2afbfd2bd3135253fb25aff7d03fbf9d57288e2e7ffe743c87ccda77fc6ea86b64a42ab0fc3034f4c",
  "0000003c2801afa35b2ab4fff910fa0e89efffa20af2afbfd2bd3138114ff29b6f7ac3fbf9d57288e2e6ffeaa3fffcd3b5dfc68506b64a42ea93f0cedffc9b26",
];
const hex = (s) => Uint8Array.from(s.match(/../g), (h) => parseInt(h, 16));
const box = (type, ...payload) => {
  const body = concat(...payload);
  return concat(u32be(body.length + 8), ascii(type), body);
};
const fullBox = (type, version, flags, ...payload) => box(type, Uint8Array.of(version, 0, 0, flags), ...payload);
const u16be = (n) => Uint8Array.of(n >> 8, n & 255);

/** HEIC mit `count` (1 oder 2) Bildern zu je 64×48 Pixeln. */
export function makeHeic(count = 1) {
  const frames = HEVC_FRAMES.slice(0, count).map(hex);
  const ids = frames.map((_, i) => i + 1);
  const ftyp = box("ftyp", ascii("heic"), u32be(0), ascii("mif1heic"));
  const build = (mdatStart) => {
    let offset = mdatStart + 8;
    const ilocItems = frames.map((f, i) => {
      const entry = concat(u16be(ids[i]), u16be(0), u16be(1), u32be(offset), u32be(f.length));
      offset += f.length;
      return entry;
    });
    return fullBox(
      "meta",
      0,
      0,
      fullBox("hdlr", 0, 0, u32be(0), ascii("pict"), new Uint8Array(12), Uint8Array.of(0)),
      fullBox("pitm", 0, 0, u16be(1)),
      fullBox("iinf", 0, 0, u16be(ids.length), ...ids.map((id) => fullBox("infe", 2, 0, u16be(id), u16be(0), ascii("hvc1"), Uint8Array.of(0)))),
      box(
        "iprp",
        box("ipco", box("hvcC", hex(HVCC)), fullBox("ispe", 0, 0, u32be(64), u32be(48))),
        fullBox("ipma", 0, 0, u32be(ids.length), ...ids.map((id) => concat(u16be(id), Uint8Array.of(2, 0x81, 0x02)))),
      ),
      fullBox("iloc", 0, 0, Uint8Array.of(0x44, 0x00), u16be(ids.length), ...ilocItems),
    );
  };
  const metaLength = build(0).length;
  const meta = build(ftyp.length + metaLength);
  return concat(ftyp, meta, box("mdat", ...frames));
}

/** SVG, wie es aus Inkscape kommt: Kommentare, Metadaten, leere defs, unnötige Nachkommastellen. */
export const BLOATED_SVG = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="100" height="100" viewBox="0 0 100 100" version="1.1" inkscape:version="1.3">
  <metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description about="x"/></rdf:RDF></metadata>
  <defs></defs>
  <g id="layer1" inkscape:label="Ebene 1">
    <rect style="fill:#ff0000;fill-opacity:1;stroke:none" x="10.000000" y="10.000000" width="80.123456789" height="80.000000" />
    <circle cx="50.00000" cy="50.00000" r="20.000000" fill="#0000ff" />
  </g>
</svg>`;
