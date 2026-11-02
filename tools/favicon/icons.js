// Favicons erzeugen: quadratisch einpassen, in alle Größen skalieren, ICO-Container, Manifest, HTML.
// Reine Funktionen; Codecs (resize/encode) werden hereingereicht.

export const ICO_SIZES = [16, 32, 48];
export const PNG_FILES = [
  { name: "apple-touch-icon.png", size: 180, opaque: true },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];
export const MAX_PADDING = 0.3;

const enc = new TextEncoder();

/**
 * Bild mittig auf eine quadratische Fläche setzen, mit Innenabstand und optionalem Hintergrund.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {{padding?: number, background?: [number, number, number]|null}} opts padding: Anteil je Seite (0–0,3)
 */
export function composeSquare(image, { padding = 0, background = null } = {}) {
  if (!(padding >= 0 && padding <= MAX_PADDING)) throw new Error("Der Innenabstand muss zwischen 0 und 30 % liegen.");
  const side = Math.max(1, Math.round(Math.max(image.width, image.height) / (1 - 2 * padding)));
  const ox = Math.floor((side - image.width) / 2);
  const oy = Math.floor((side - image.height) / 2);
  const out = new Uint8ClampedArray(side * side * 4);
  if (background) {
    for (let i = 0; i < out.length; i += 4) out.set([...background, 255], i);
  }
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const s = (y * image.width + x) * 4;
      const d = ((y + oy) * side + x + ox) * 4;
      const a = image.data[s + 3] / 255;
      if (!background) {
        out.set(image.data.subarray(s, s + 4), d);
        continue;
      }
      for (let c = 0; c < 3; c++) out[d + c] = image.data[s + c] * a + background[c] * (1 - a);
      out[d + 3] = 255;
    }
  }
  return { data: out, width: side, height: side };
}

/**
 * ICO-Datei aus PNG-Bildern (PNG-in-ICO, von allen aktuellen Browsern und Windows Vista+ verstanden).
 * @param {{size: number, png: Uint8Array}[]} entries
 */
export function buildIco(entries) {
  if (!entries.length) throw new Error("ICO braucht mindestens ein Bild.");
  const headerSize = 6 + entries.length * 16;
  const total = headerSize + entries.reduce((n, e) => n + e.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true); // reserviert
  view.setUint16(2, 1, true); // Typ: Icon
  view.setUint16(4, entries.length, true);
  let offset = headerSize;
  entries.forEach(({ size, png }, i) => {
    const e = 6 + i * 16;
    out[e] = size >= 256 ? 0 : size; // 0 bedeutet 256
    out[e + 1] = size >= 256 ? 0 : size;
    out[e + 2] = 0; // keine Palette
    out[e + 3] = 0;
    view.setUint16(e + 4, 1, true); // Farbebenen
    view.setUint16(e + 6, 32, true); // Bit pro Pixel
    view.setUint32(e + 8, png.length, true);
    view.setUint32(e + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}

/** Seitenverhältnis eines SVG aus viewBox oder width/height des Wurzelelements. */
export function svgSize(text) {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!root) throw new Error("Kein SVG: Es fehlt das <svg>-Element.");
  const attr = (name) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(root)?.[1];
  const viewBox = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) return { width: viewBox[2], height: viewBox[3], viewBox };
  const w = parseFloat(attr("width"));
  const h = parseFloat(attr("height"));
  if (w > 0 && h > 0) return { width: w, height: h, viewBox: [0, 0, w, h] };
  return { width: 100, height: 100, viewBox: null };
}

const toHex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/**
 * favicon.svg mit Innenabstand/Hintergrund: das Original wird als verschachteltes <svg> eingesetzt.
 * Ohne beides bleibt das Original unverändert.
 */
export function wrapSvg(text, { padding = 0, background = null } = {}) {
  if (!padding && !background) return text;
  const { width, height } = svgSize(text);
  const side = Math.max(width, height) / (1 - 2 * padding);
  const x = (side - width) / 2;
  const y = (side - height) / 2;
  const inner = text
    .replace(/<\?xml[^>]*\?>/i, "")
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .replace(/<svg\b([^>]*)>/i, (_, attrs) => {
      const cleaned = attrs.replace(/\s(x|y|width|height)\s*=\s*["'][^"']*["']/gi, "");
      return `<svg${cleaned} x="${x}" y="${y}" width="${width}" height="${height}">`;
    })
    .trim();
  const rect = background ? `<rect width="100%" height="100%" fill="${toHex(background)}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}">${rect}${inner}</svg>`;
}

/** site.webmanifest für Android/Chrome. */
export function manifest({ name = "", themeColor = "#ffffff", backgroundColor = "#ffffff" } = {}) {
  return `${JSON.stringify(
    {
      name,
      short_name: name,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      theme_color: themeColor,
      background_color: backgroundColor,
      display: "standalone",
    },
    null,
    2,
  )}\n`;
}

/** Was in den <head> der Website gehört. */
export function htmlSnippet({ svg = false } = {}) {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="48x48">',
    svg ? '<link rel="icon" href="/favicon.svg" type="image/svg+xml">' : null,
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Alle Dateien erzeugen.
 * @param {{resize: Function, encode: Function}} codecs
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image Quelle in voller Größe
 * @param {{padding?: number, background?: [number, number, number]|null, name?: string, svgText?: string|null}} opts
 * @returns {Promise<{name: string, bytes: Uint8Array, size?: number}[]>}
 */
export async function makeFavicons(codecs, image, { padding = 0, background = null, name = "", svgText = null } = {}) {
  const square = composeSquare(image, { padding, background });
  const opaque = background ? square : composeSquare(image, { padding, background: [255, 255, 255] });
  const png = async (source, size) => codecs.encode(await codecs.resize(source, size, size), "png");

  const icoEntries = [];
  for (const size of ICO_SIZES) icoEntries.push({ size, png: await png(square, size) });
  const files = [{ name: "favicon.ico", bytes: buildIco(icoEntries) }];
  if (svgText) files.push({ name: "favicon.svg", bytes: enc.encode(wrapSvg(svgText, { padding, background })) });
  for (const f of PNG_FILES) files.push({ name: f.name, size: f.size, bytes: await png(f.opaque ? opaque : square, f.size) });
  const color = background ? toHex(background) : "#ffffff";
  files.push({ name: "site.webmanifest", bytes: enc.encode(manifest({ name, themeColor: color, backgroundColor: color })) });
  return files;
}
