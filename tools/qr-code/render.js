// QR-Code-Geometrie: Modul-Matrix von `qrcode`, Formen als abgerundete Rechtecke, daraus ein SVG-Pfad.
// Derselbe Pfad zeichnet die Vorschau (SVG) und das PNG (Canvas, Path2D). Ohne DOM, damit testbar.
import QRCode from "qrcode";

export const EC_LEVELS = ["L", "M", "Q", "H"];
export const MODULE_SHAPES = ["square", "rounded", "dots"];
export const FINDER_SHAPES = ["square", "rounded", "circle"];
/** Logo höchstens so viel Fläche des Codes (ohne Rand). Bei 18-20 % lesen Scanner manche Codes trotz H nicht mehr. */
export const MAX_LOGO_AREA = 0.16;
export const FINDER = 7;
/** Mit Logo mindestens diese Version: bei sehr kleinen Codes frisst das Logo sonst zu viele Module. */
export const MIN_LOGO_VERSION = 5;

/**
 * Ein Rechteck mit eigenen Eckradien [oben links, oben rechts, unten rechts, unten links].
 * hole = true: wird gegenläufig gezeichnet und stanzt aus (Nonzero-Füllregel).
 * @typedef {{x: number, y: number, w: number, h: number, r: [number, number, number, number], hole?: boolean}} Shape
 */

const FINDER_RADII = {
  square: [0, 0, 0],
  rounded: [2, 1.4, 0.9],
  circle: [3.5, 2.5, 1.5],
};

const rr = (x, y, size, r, hole = false) => ({ x, y, w: size, h: size, r: [r, r, r, r], hole });

/** Liegt das Modul in einem der drei Eckmarker (7×7)? */
export function inFinder(row, col, n) {
  const near = (v) => v < FINDER;
  const far = (v) => v >= n - FINDER;
  return (near(row) && near(col)) || (near(row) && far(col)) || (far(row) && near(col));
}

/** Logo-Feld in Modulen (ohne Rand): quadratisch, mittig, ratio = Anteil an der Fläche. */
export function logoBox(n, ratio) {
  const r = Math.min(Math.max(ratio, 0), MAX_LOGO_AREA);
  const size = Math.sqrt(r) * n;
  const start = (n - size) / 2;
  return { x: start, y: start, size };
}

/**
 * @param {string} text
 * @param {{ecLevel?: string, margin?: number, moduleShape?: string, finderShape?: string, logoRatio?: number}} [opts]
 *   logoRatio > 0 reserviert ein Logo-Feld und erzwingt Fehlerkorrektur H.
 */
export function buildQr(text, { ecLevel = "M", margin = 4, moduleShape = "square", finderShape = "square", logoRatio = 0 } = {}) {
  if (!text) throw new Error("Kein Inhalt.");
  if (!MODULE_SHAPES.includes(moduleShape)) throw new Error(`Unbekannte Modulform: ${moduleShape}`);
  if (!FINDER_SHAPES.includes(finderShape)) throw new Error(`Unbekannte Eckform: ${finderShape}`);
  const level = logoRatio > 0 ? "H" : ecLevel;
  if (!EC_LEVELS.includes(level)) throw new Error(`Unbekannte Fehlerkorrektur: ${level}`);
  const m = Math.max(0, Math.min(20, Math.round(margin)));

  let qr;
  try {
    qr = QRCode.create(text, { errorCorrectionLevel: level });
    if (logoRatio > 0 && qr.version < MIN_LOGO_VERSION) {
      qr = QRCode.create(text, { errorCorrectionLevel: level, version: MIN_LOGO_VERSION });
    }
  } catch (error) {
    if (/too big|amount of data/i.test(String(error?.message))) {
      throw new Error("Zu viel Inhalt für einen QR-Code. Kürze den Text oder wähle eine niedrigere Fehlerkorrektur.");
    }
    throw error;
  }
  const n = qr.modules.size;
  const data = qr.modules.data;
  const dark = (row, col) => row >= 0 && col >= 0 && row < n && col < n && data[row * n + col] === 1;

  const logo = logoRatio > 0 ? logoBox(n, logoRatio) : null;
  const covered = (row, col) =>
    logo !== null && col + 1 > logo.x && col < logo.x + logo.size && row + 1 > logo.y && row < logo.y + logo.size;

  /** @type {Shape[]} */
  const shapes = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!dark(row, col) || inFinder(row, col, n) || covered(row, col)) continue;
      const x = col + m;
      const y = row + m;
      if (moduleShape === "dots") {
        shapes.push(rr(x + 0.05, y + 0.05, 0.9, 0.45));
      } else if (moduleShape === "rounded") {
        const up = dark(row - 1, col);
        const down = dark(row + 1, col);
        const left = dark(row, col - 1);
        const right = dark(row, col + 1);
        const c = 0.5;
        shapes.push({ x, y, w: 1, h: 1, r: [!up && !left ? c : 0, !up && !right ? c : 0, !down && !right ? c : 0, !down && !left ? c : 0] });
      } else {
        shapes.push(rr(x, y, 1, 0));
      }
    }
  }

  const [outer, ring, inner] = FINDER_RADII[finderShape];
  for (const [row, col] of [
    [0, 0],
    [0, n - FINDER],
    [n - FINDER, 0],
  ]) {
    const x = col + m;
    const y = row + m;
    shapes.push(rr(x, y, 7, outer), rr(x + 1, y + 1, 5, ring, true), rr(x + 2, y + 2, 3, inner));
  }

  return {
    text,
    version: qr.version,
    ecLevel: level,
    modules: n,
    margin: m,
    size: n + 2 * m,
    shapes,
    path: shapesToPath(shapes),
    logo: logo && { x: logo.x + m, y: logo.y + m, size: logo.size },
  };
}

const num = (v) => String(Math.round(v * 1000) / 1000);

/** SVG-Pfad eines Rechtecks mit Eckradien; Löcher laufen gegen den Uhrzeigersinn. */
export function shapePath({ x, y, w, h, r: [tl, tr, br, bl], hole = false }) {
  const arc = (rad, ex, ey, sweep) => (rad > 0 ? `A${num(rad)} ${num(rad)} 0 0 ${sweep} ${num(ex)} ${num(ey)}` : `L${num(ex)} ${num(ey)}`);
  if (!hole) {
    return [
      `M${num(x + tl)} ${num(y)}`,
      `L${num(x + w - tr)} ${num(y)}`,
      arc(tr, x + w, y + tr, 1),
      `L${num(x + w)} ${num(y + h - br)}`,
      arc(br, x + w - br, y + h, 1),
      `L${num(x + bl)} ${num(y + h)}`,
      arc(bl, x, y + h - bl, 1),
      `L${num(x)} ${num(y + tl)}`,
      arc(tl, x + tl, y, 1),
      "Z",
    ].join("");
  }
  return [
    `M${num(x + tl)} ${num(y)}`,
    arc(tl, x, y + tl, 0),
    `L${num(x)} ${num(y + h - bl)}`,
    arc(bl, x + bl, y + h, 0),
    `L${num(x + w - br)} ${num(y + h)}`,
    arc(br, x + w, y + h - br, 0),
    `L${num(x + w)} ${num(y + tr)}`,
    arc(tr, x + w - tr, y, 0),
    "Z",
  ].join("");
}

export function shapesToPath(shapes) {
  return shapes.map(shapePath).join("");
}

/** Liegt der Punkt in der Form (inkl. abgerundeter Ecken)? Für Tests und Rasterung ohne Canvas. */
export function containsPoint({ x, y, w, h, r: [tl, tr, br, bl] }, px, py) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const corners = [
    [tl, x + tl, y + tl, px < x + tl && py < y + tl],
    [tr, x + w - tr, y + tr, px > x + w - tr && py < y + tr],
    [br, x + w - br, y + h - br, px > x + w - br && py > y + h - br],
    [bl, x + bl, y + h - bl, px < x + bl && py > y + h - bl],
  ];
  for (const [rad, cx, cy, inCorner] of corners) {
    if (rad > 0 && inCorner && (px - cx) ** 2 + (py - cy) ** 2 > rad * rad) return false;
  }
  return true;
}

/**
 * Rastert die Formen in ein Graustufenbild (RGBA), 0 = dunkel. Für Tests (zxing liest das direkt).
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function rasterize(qr, pixelsPerModule = 8) {
  const width = Math.round(qr.size * pixelsPerModule);
  const winding = new Int16Array(width * width);
  for (const s of qr.shapes) {
    const x0 = Math.max(0, Math.floor(s.x * pixelsPerModule));
    const y0 = Math.max(0, Math.floor(s.y * pixelsPerModule));
    const x1 = Math.min(width, Math.ceil((s.x + s.w) * pixelsPerModule));
    const y1 = Math.min(width, Math.ceil((s.y + s.h) * pixelsPerModule));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        if (containsPoint(s, (px + 0.5) / pixelsPerModule, (py + 0.5) / pixelsPerModule)) winding[py * width + px] += s.hole ? -1 : 1;
      }
    }
  }
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  winding.forEach((w, i) => {
    if (w > 0) data.fill(0, i * 4, i * 4 + 3);
  });
  return { data, width, height: width };
}
