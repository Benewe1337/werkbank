import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  buildOptions,
  convertDocument,
  defaultTarget,
  detectFormat,
  errorMessage,
  warningNotes,
} from "../../../tools/dokument-umwandeln/formats.js";
import { SAMPLE_MARKDOWN, docxText, makePng } from "../../fixtures/text.js";

// Echte Umwandlung mit der Node-Variante von pandoc-wasm (dieselbe .wasm wie im Browser).
const { convert } = await import("pandoc-wasm");
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

describe("dokument-umwandeln: Formate", () => {
  it("erkennt Formate an der Endung", () => {
    expect(["a.md", "B.DOCX", "c.htm", "d.tex", "e.rst", "f.epub", "g.odt", "h.txt"].map(detectFormat)).toEqual([
      "markdown", "docx", "html", "latex", "rst", "epub", "odt", "markdown",
    ]);
    expect(detectFormat("bild.png")).toBeNull();
    expect(detectFormat("ohne-endung")).toBeNull();
  });

  it("wählt ein sinnvolles Standardziel", () => {
    expect(defaultTarget("docx")).toBe("markdown");
    expect(defaultTarget("markdown")).toBe("docx");
  });

  it("baut pandoc-Optionen je nach Ziel", () => {
    expect(buildOptions("markdown", "html", "input.md", "t")).toMatchObject({ standalone: true, "embed-resources": true, "output-file": "output.html" });
    expect(buildOptions("docx", "markdown", "input.docx", "t")).toMatchObject({ "extract-media": "media" });
    expect(buildOptions("markdown", "plain", "input.md", "t").standalone).toBeUndefined();
    expect(() => buildOptions("pdf", "html", "x", "t")).toThrow(/Eingabeformat/);
    expect(() => buildOptions("markdown", "pdf", "x", "t")).toThrow(/Ausgabeformat/);
  });

  it("filtert Warnungen und Fehlermeldungen", () => {
    expect(warningNotes([{ verbosity: "INFO", pretty: "x" }, { verbosity: "WARNING", pretty: "Bild fehlt\nDetails" }])).toEqual(["Bild fehlt"]);
    expect(errorMessage("ERROR: kaputt\nmehr")).toBe("Umwandlung fehlgeschlagen: kaputt");
    expect(errorMessage("")).toMatch(/keine Ausgabe/);
  });
});

describe("dokument-umwandeln: pandoc", () => {
  it("wandelt Markdown in DOCX mit erwartetem Inhalt", async () => {
    const r = await convertDocument(convert, { bytes: enc(SAMPLE_MARKDOWN), from: "markdown", to: "docx", baseName: "bericht" });
    expect(r.fileName).toBe("bericht.docx");
    const text = docxText(unzipSync, r.bytes);
    expect(text).toContain("Werkbank Bericht");
    expect(text).toContain("Grüße aus Köln");
  });

  it("wandelt Markdown in HTML", async () => {
    const r = await convertDocument(convert, { bytes: enc(SAMPLE_MARKDOWN), from: "markdown", to: "html", baseName: "bericht" });
    const html = dec(r.bytes);
    expect(html).toContain("<strong>fett</strong>");
    expect(html).toContain("<title>bericht</title>");
  });

  it("legt Bilder aus DOCX zusammen mit Markdown in eine ZIP", async () => {
    const md = "# Bild\n\n![Rot](rot.png)\n";
    const docx = await convert({ from: "markdown", to: "docx", "input-files": ["in.md"], "output-file": "o.docx" }, null, {
      "in.md": md,
      "rot.png": new Blob([makePng()]),
    });
    const bytes = new Uint8Array(await docx.files["o.docx"].arrayBuffer());
    const r = await convertDocument(convert, { bytes, from: "docx", to: "markdown", baseName: "bild" });
    expect(r.fileName).toBe("bild.zip");
    const files = unzipSync(r.bytes);
    const image = Object.keys(files).find((f) => f.endsWith(".png"));
    expect(image).toBeTruthy();
    expect(dec(files["bild.md"])).toContain(image);
  });

  it("meldet kaputte Dateien verständlich", async () => {
    await expect(convertDocument(convert, { bytes: enc("kein zip"), from: "docx", to: "html", baseName: "x" })).rejects.toThrow(/Umwandlung fehlgeschlagen/);
    await expect(convertDocument(convert, { bytes: new Uint8Array(), from: "markdown", to: "html", baseName: "x" })).rejects.toThrow(/leer/);
  });
});
