// Testdaten der Text-Werkzeuge, zur Laufzeit erzeugt (keine Binärdateien im Repo).
import zlib from "node:zlib";

/** Kleines rotes PNG (ohne Bildbibliothek), z. B. als Bild in Dokumenten. */
export function makePng(width = 8, height = 8) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, Buffer.from([255, 0, 0]))]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const SAMPLE_MARKDOWN = "# Werkbank Bericht\n\nDas ist **fett** und *kursiv*.\n\n- Erster Punkt\n- Zweiter Punkt\n\nUmlaute: Grüße aus Köln.\n";

/** Text aus einer DOCX (word/document.xml, Tags entfernt). */
export function docxText(unzipSync, bytes) {
  const xml = new TextDecoder().decode(unzipSync(new Uint8Array(bytes))["word/document.xml"]);
  return xml.replace(/<w:p[ >]/g, "\n$&").replace(/<[^>]+>/g, "");
}

/** Gesprochener Testsatz für die Transkription. */
export const SPEECH_TEXT = "Hallo, das ist ein Test. Heute scheint die Sonne über Berlin.";
