// Dekodieren und Kodieren über die Squoosh-Codecs (@jsquash) und libheif, jeweils als WebAssembly.
// Für den Web Worker gedacht. Codecs werden erst geladen, wenn ein Format wirklich gebraucht wird.
import { FORMATS, flattenAlpha } from "./format.js";

/** Formate, die wir schreiben können (HEIC nicht: dafür gibt es keinen freien Encoder im Browser). */
export const ENCODABLE = ["jpeg", "png", "webp", "avif"];

const once = (load) => {
  let p;
  return () => (p ??= load());
};

const codec = {
  jpegDec: once(() => import("@jsquash/jpeg/decode.js")),
  jpegEnc: once(() => import("@jsquash/jpeg/encode.js")),
  pngDec: once(() => import("@jsquash/png/decode.js")),
  pngEnc: once(() => import("@jsquash/png/encode.js")),
  webpDec: once(() => import("@jsquash/webp/decode.js")),
  webpEnc: once(() => import("@jsquash/webp/encode.js")),
  avifDec: once(() => import("@jsquash/avif/decode.js")),
  avifEnc: once(() => import("@jsquash/avif/encode.js")),
  oxipng: once(() => import("@jsquash/oxipng/optimise.js")),
  resize: once(() => import("@jsquash/resize")),
  heif: once(async () => (await import("libheif-js/libheif-wasm/libheif-bundle.mjs")).default()),
};

const toImageData = (img) =>
  typeof ImageData !== "undefined" && !(img instanceof ImageData) ? new ImageData(img.data, img.width, img.height) : img;

/** Lädt die WebAssembly der genannten Formate vorab (damit „bereit“ auch stimmt). */
export async function warmup(formats) {
  const tasks = [];
  for (const f of formats) {
    if (f === "jpeg") tasks.push(codec.jpegDec().then((m) => m.init()), codec.jpegEnc().then((m) => m.init()));
    if (f === "png") tasks.push(codec.pngDec().then((m) => m.init()), codec.pngEnc().then((m) => m.init()));
    if (f === "heic") tasks.push(codec.heif());
  }
  await Promise.all(tasks);
}

/**
 * Alle Bilder einer HEIC/HEIF-Datei (iPhone-Serien, Live-Photo-Standbilder …) als Pixel.
 * @param {Uint8Array} bytes
 * @returns {Promise<ImageData[]>}
 */
export async function decodeHeic(bytes) {
  const libheif = await codec.heif();
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(bytes);
  if (!images.length) throw new Error("Keine Bilder in der HEIC-Datei gefunden. Ist die Datei beschädigt?");
  const out = [];
  for (const image of images) {
    const width = image.get_width();
    const height = image.get_height();
    const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
    const pixels = await new Promise((resolve) => image.display(target, resolve));
    image.free();
    if (!pixels) throw new Error("Ein Bild in der HEIC-Datei ließ sich nicht dekodieren.");
    out.push(toImageData(pixels));
  }
  return out;
}

/**
 * @param {Uint8Array} bytes
 * @param {keyof typeof FORMATS} format
 * @returns {Promise<ImageData>}
 */
export async function decode(bytes, format) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  try {
    switch (format) {
      case "jpeg":
        return (await codec.jpegDec()).default(buffer, { preserveOrientation: true });
      case "png":
        return (await codec.pngDec()).default(buffer);
      case "webp":
        return await (await codec.webpDec()).default(buffer);
      case "avif": {
        const img = await (await codec.avifDec()).default(buffer);
        if (!img) throw new Error("leer");
        return img;
      }
      case "heic":
        return (await decodeHeic(bytes))[0];
    }
  } catch (error) {
    throw new Error(`${FORMATS[format]?.label ?? "Bild"} ließ sich nicht lesen. Ist die Datei beschädigt? (${error.message ?? error})`);
  }
  throw new Error(`${FORMATS[format]?.label ?? "Dieses Format"} wird hier nicht unterstützt.`);
}

/**
 * PNG verlustfrei verkleinern (oxipng).
 * @param {Uint8Array} bytes PNG-Datei
 */
export async function optimisePng(bytes, level = 2) {
  const { default: optimise } = await codec.oxipng();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Uint8Array(await optimise(buffer, { level, interlace: false, optimiseAlpha: true }));
}

/**
 * @param {ImageData} image
 * @param {"jpeg"|"png"|"webp"|"avif"} format
 * @param {{quality?: number, background?: [number, number, number], optimise?: boolean}} [opts] optimise: PNG zusätzlich mit oxipng verkleinern
 * @returns {Promise<Uint8Array>}
 */
export async function encode(image, format, { quality = 75, background = [255, 255, 255], optimise = true } = {}) {
  switch (format) {
    case "jpeg": {
      const flat = toImageData(flattenAlpha(image, background));
      return new Uint8Array(await (await codec.jpegEnc()).default(flat, { quality }));
    }
    case "png": {
      const png = new Uint8Array(await (await codec.pngEnc()).default(toImageData(image)));
      return optimise ? optimisePng(png) : png;
    }
    case "webp":
      return new Uint8Array(await (await codec.webpEnc()).default(toImageData(image), { quality }));
    case "avif":
      return new Uint8Array(await (await codec.avifEnc()).default(toImageData(image), { quality, speed: 6 }));
  }
  throw new Error(`In ${FORMATS[format]?.label ?? format} kann hier nicht gespeichert werden.`);
}

/**
 * Hochwertig skalieren (Lanczos3, mit vormultipliziertem Alpha, damit keine dunklen Ränder entstehen).
 * @param {ImageData} image
 * @param {number} width
 * @param {number} height
 */
export async function resize(image, width, height) {
  if (image.width === width && image.height === height) return image;
  const { default: run } = await codec.resize();
  // resize() arbeitet direkt auf dem Puffer; eine Kopie schützt das Original.
  const copy = toImageData({ data: new Uint8ClampedArray(image.data), width: image.width, height: image.height });
  return run(copy, { width, height, method: "lanczos3", fitMethod: "stretch", premultiply: true, linearRGB: true });
}
