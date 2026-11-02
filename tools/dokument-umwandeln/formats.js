// Formate, Erkennung und Aufruf von pandoc (ohne DOM; `convert` wird hereingereicht, damit Node-Tests
// die Node-Variante von pandoc-wasm und der Worker die Browser-Variante nutzen können).
import { zipSync } from "fflate";

/** Pandoc-Name → Anzeige, Endung, MIME-Typ, ob Binärformat, ob als Eingabe/Ausgabe angeboten. */
export const FORMATS = {
  markdown: { label: "Markdown", ext: "md", mime: "text/markdown", in: true, out: true },
  docx: {
    label: "Word (DOCX)",
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    binary: true,
    in: true,
    out: true,
  },
  odt: { label: "OpenDocument (ODT)", ext: "odt", mime: "application/vnd.oasis.opendocument.text", binary: true, in: true, out: true },
  html: { label: "HTML", ext: "html", mime: "text/html", in: true, out: true },
  latex: { label: "LaTeX", ext: "tex", mime: "application/x-tex", in: true, out: true },
  rst: { label: "reStructuredText", ext: "rst", mime: "text/x-rst", in: true, out: true },
  epub: { label: "EPUB", ext: "epub", mime: "application/epub+zip", binary: true, in: true, out: true },
  plain: { label: "Klartext", ext: "txt", mime: "text/plain", in: false, out: true },
};

export const INPUT_FORMATS = Object.keys(FORMATS).filter((f) => FORMATS[f].in);
export const OUTPUT_FORMATS = Object.keys(FORMATS).filter((f) => FORMATS[f].out);

const BY_EXTENSION = {
  md: "markdown",
  markdown: "markdown",
  mdown: "markdown",
  mkd: "markdown",
  txt: "markdown",
  docx: "docx",
  odt: "odt",
  html: "html",
  htm: "html",
  xhtml: "html",
  tex: "latex",
  latex: "latex",
  ltx: "latex",
  rst: "rst",
  rest: "rst",
  epub: "epub",
};

/** Endungen für das accept-Attribut der Ablage. */
export const ACCEPT = Object.keys(BY_EXTENSION)
  .map((e) => `.${e}`)
  .join(",");

/** Eingabeformat aus dem Dateinamen raten; null, wenn unbekannt. */
export function detectFormat(fileName) {
  const ext = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (ext && BY_EXTENSION[ext]) ?? null;
}

/** Sinnvolles Standardziel: Word-Dateien werden Markdown, alles andere Word. */
export function defaultTarget(from) {
  return from === "docx" ? "markdown" : "docx";
}

/** Formate mit Bildern als externe Dateien: Bilder landen zusammen mit dem Text in einer ZIP. */
const EXTRACTS_MEDIA = new Set(["markdown", "latex", "rst"]);
/** Formate mit eigenständigem Dokumentkopf. */
const STANDALONE = new Set(["html", "latex", "docx", "odt", "epub"]);

/**
 * Optionen für pandoc (entspricht einer pandoc-Defaults-Datei).
 * @param {string} from
 * @param {string} to
 * @param {string} inputName
 * @param {string} title
 */
export function buildOptions(from, to, inputName, title) {
  if (!FORMATS[from]?.in) throw new Error(`Eingabeformat wird nicht unterstützt: ${from}`);
  if (!FORMATS[to]?.out) throw new Error(`Ausgabeformat wird nicht unterstützt: ${to}`);
  const options = {
    from,
    to,
    "input-files": [inputName],
    "output-file": `output.${FORMATS[to].ext}`,
  };
  if (STANDALONE.has(to)) options.standalone = true;
  if (to === "html") {
    options["embed-resources"] = true;
    options.metadata = { pagetitle: title };
  }
  if (to === "epub") options.metadata = { title };
  if (EXTRACTS_MEDIA.has(to)) options["extract-media"] = "media";
  return options;
}

/** Dateiendung der Eingabe in pandocs Dateisystem (pandoc erkennt manches selbst an der Endung). */
const inputName = (from) => `input.${FORMATS[from].ext}`;

/** Pandoc-Meldungen ab Stufe WARNING als kurze deutsche Hinweise. */
export function warningNotes(warnings = []) {
  return warnings
    .filter((w) => w.verbosity === "WARNING")
    .map((w) => String(w.pretty ?? w.type).split("\n")[0])
    .filter((text, i, all) => all.indexOf(text) === i);
}

/** Fehlermeldung aus stderr, ohne das „ERROR:“-Präfix von pandoc. */
export function errorMessage(stderr) {
  const text = String(stderr ?? "").trim();
  if (!text) return "Pandoc hat keine Ausgabe erzeugt.";
  return `Umwandlung fehlgeschlagen: ${text.replace(/^ERROR:\s*/i, "").split("\n")[0]}`;
}

/**
 * Wandelt ein Dokument um.
 * @param {(options: object, stdin: string|null, files: Record<string, Blob|string>) => Promise<any>} convert pandoc-wasm convert()
 * @param {{bytes: Uint8Array, from: string, to: string, baseName: string}} input
 * @returns {Promise<{bytes: Uint8Array, fileName: string, mime: string, media: number, notes: string[]}>}
 */
export async function convertDocument(convert, { bytes, from, to, baseName }) {
  if (!bytes?.length) throw new Error("Die Datei ist leer.");
  const name = inputName(from);
  const options = buildOptions(from, to, name, baseName);
  const result = await convert(options, null, { [name]: new Blob([bytes]) });
  const output = result.files?.[options["output-file"]];
  if (!output) throw new Error(errorMessage(result.stderr));

  const outBytes = new Uint8Array(await output.arrayBuffer());
  const notes = warningNotes(result.warnings);
  const media = Object.entries(result.mediaFiles ?? {});
  const fileName = `${baseName}.${FORMATS[to].ext}`;
  if (media.length === 0) return { bytes: outBytes, fileName, mime: FORMATS[to].mime, media: 0, notes };

  // Text mit ausgelagerten Bildern: alles zusammen als ZIP, Pfade im Text bleiben gültig.
  const files = { [fileName]: outBytes };
  for (const [path, blob] of media) files[path] = new Uint8Array(await blob.arrayBuffer());
  return { bytes: zipSync(files), fileName: `${baseName}.zip`, mime: "application/zip", media: media.length, notes };
}
