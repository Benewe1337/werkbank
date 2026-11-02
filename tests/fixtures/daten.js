// Testdaten für Codes, Daten und Archive, zur Laufzeit erzeugt (keine Binärdateien im Repo).
import { gzipSync, strToU8, zipSync } from "fflate";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { prepareZXingModule, readBarcodes, writeBarcode } from "zxing-wasm/full";

// zxing-wasm lädt seine .wasm sonst vom CDN; in Node direkt aus node_modules.
const require = createRequire(import.meta.url);
prepareZXingModule({
  overrides: { wasmBinary: readFileSync(require.resolve("zxing-wasm/full/zxing_full.wasm")).buffer },
});

/** Liest alle Codes aus PNG/JPEG-Bytes oder einem RGBA-Bild {data, width, height}. */
export async function readCodes(image, formats = []) {
  const input = image instanceof Uint8Array || Buffer.isBuffer(image) ? new Uint8Array(image) : image;
  const results = await readBarcodes(input, { formats, tryHarder: true, maxNumberOfSymbols: 4 });
  return results.map((r) => ({ format: r.format, text: r.text }));
}

/** Erzeugt einen Code als PNG-Bytes (für Uploads in den Scanner). */
export async function makeCodePng(text, format = "QRCode", scale = 6) {
  const result = await writeBarcode(text, { format, scale });
  if (result.error) throw new Error(result.error);
  return new Uint8Array(await result.image.arrayBuffer());
}

export const SAMPLE_ROWS = [
  { name: "Anna", ort: "Köln", plz: "01067", alter: 31 },
  { name: "Bernd; der Zweite", ort: "Hamburg", plz: "20095", alter: 45 },
];

/** CSV wie aus einem deutschen Excel-Export: Semikolon, CRLF. */
export const CSV_SEMICOLON = 'name;ort;plz;alter\r\nAnna;Köln;01067;31\r\n"Bernd; der Zweite";Hamburg;20095;45\r\n';

/** ZIP aus {pfad: inhalt}. */
export function makeZip(files) {
  return zipSync(Object.fromEntries(Object.entries(files).map(([p, c]) => [p, typeof c === "string" ? strToU8(c) : c])));
}

/** Minimales ustar-Archiv aus {pfad: inhalt}. */
export function makeTar(files) {
  const blocks = [];
  const enc = new TextEncoder();
  for (const [path, content] of Object.entries(files)) {
    const data = typeof content === "string" ? enc.encode(content) : content;
    const header = new Uint8Array(512);
    const put = (str, offset, len) => header.set(enc.encode(str).slice(0, len), offset);
    put(path, 0, 100);
    put("0000644\0", 100, 8);
    put("0000000\0", 108, 8);
    put("0000000\0", 116, 8);
    put(`${data.length.toString(8).padStart(11, "0")}\0`, 124, 12);
    put(`${Math.floor(Date.UTC(2024, 0, 1) / 1000).toString(8).padStart(11, "0")}\0`, 136, 12);
    put("        ", 148, 8);
    put("0", 156, 1);
    put("ustar\0", 257, 6);
    put("00", 263, 2);
    const sum = header.reduce((a, b) => a + b, 0);
    put(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
    blocks.push(header, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of blocks) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

export const makeTarGz = (files) => gzipSync(makeTar(files));

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crcByte = (crc, b) => (CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0;
const crc32 = (data) => (data.reduce((c, b) => crcByte(c, b), 0xffffffff) ^ 0xffffffff) >>> 0;

/**
 * ZIP mit klassischer PKWARE-Verschlüsselung (ZipCrypto), Methode „stored“.
 * fflate kann nicht verschlüsseln, libarchive.js schreibt keine Passwort-ZIPs, also hier von Hand.
 */
export function makeEncryptedZip(files, password) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = enc.encode(path);
    const data = typeof content === "string" ? enc.encode(content) : content;
    const crc = crc32(data);
    let k0 = 0x12345678;
    let k1 = 0x23456789;
    let k2 = 0x34567890;
    const update = (b) => {
      k0 = crcByte(k0, b);
      k1 = (Math.imul((k1 + (k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0;
      k2 = crcByte(k2, k1 >>> 24);
    };
    const stream = () => {
      const t = (k2 | 2) & 0xffff;
      return (Math.imul(t, t ^ 1) >>> 8) & 0xff;
    };
    for (const b of enc.encode(password)) update(b);
    const plain = new Uint8Array(12 + data.length);
    for (let i = 0; i < 11; i++) plain[i] = (i * 37 + 11) & 0xff;
    plain[11] = crc >>> 24;
    plain.set(data, 12);
    const cipher = plain.map((p) => {
      const c = p ^ stream();
      update(p);
      return c;
    });
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0001 | 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, cipher.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0001 | 0x0800, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, cipher.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    locals.push(new Uint8Array(local.buffer), name, cipher);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + cipher.length;
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, centrals.length / 2, true);
  end.setUint16(10, centrals.length / 2, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
