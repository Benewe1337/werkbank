// SVG mit SVGO verkleinern. `optimize` wird hereingereicht (Browser-Build im Worker, Node-Build im Test).

/** Grobe Prüfung, bevor SVGO mit einer unklaren Meldung scheitert. */
export function looksLikeSvg(text) {
  return /<svg[\s>]/i.test(text);
}

/**
 * @param {(input: string, config: object) => {data: string}} optimize
 * @param {string} text
 * @param {{multipass?: boolean, precision?: number, pretty?: boolean}} [opts]
 */
export function optimizeSvg(optimize, text, { multipass = true, precision = 3, pretty = false } = {}) {
  if (!looksLikeSvg(text)) throw new Error("Kein SVG: Es fehlt das <svg>-Element.");
  let data;
  try {
    data = optimize(text, {
      multipass,
      floatPrecision: precision,
      js2svg: pretty ? { pretty: true, indent: 2 } : undefined,
      plugins: [{ name: "preset-default", params: { overrides: { cleanupNumericValues: { floatPrecision: precision } } } }],
    }).data;
  } catch (error) {
    const message = String(error?.message ?? error).split("\n")[0];
    throw new Error(`SVG ließ sich nicht lesen: ${message}`);
  }
  if (!data || !looksLikeSvg(data)) throw new Error("SVGO hat kein gültiges SVG zurückgegeben.");
  return data;
}

/** Bytes eines Textes in UTF-8. */
export const byteLength = (text) => new TextEncoder().encode(text).length;
