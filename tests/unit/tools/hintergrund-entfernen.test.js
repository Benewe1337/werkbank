import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MODEL_KEY,
  RESOLUTION,
  applyMask,
  describeProgress,
  loadChunked,
  maskFromOutput,
  modelBase,
  resizeBilinear,
  toInputTensor,
  transparentShare,
} from "../../../tools/hintergrund-entfernen/remove.js";
import { makePixels } from "../../fixtures/bild.js";

const assets = JSON.parse(fs.readFileSync("tools/hintergrund-entfernen/assets.json", "utf8"));

/** fetch-Ersatz, der aus einem Verzeichnis liest (wie der Webserver aus public/models/imgly/). */
const fileFetch = (dir, files) => async (url) => {
  const name = url.split("/").pop();
  const body = files?.[name] ?? (fs.existsSync(path.join(dir, name)) ? fs.readFileSync(path.join(dir, name)) : null);
  if (body === null) return new Response("fehlt", { status: 404 });
  return new Response(body);
};

describe("hintergrund-entfernen: Modell", () => {
  it("lädt von der eigenen Herkunft", () => {
    expect(modelBase("https://werkbank.example")).toBe("https://werkbank.example/models/imgly/");
  });

  it("assets.json ist auf Version 1.7.0 gepinnt und landet unter models/imgly/", () => {
    expect(assets.length).toBe(12);
    for (const a of assets) {
      expect(a.url).toMatch(/^https:\/\/staticimgly\.com\/@imgly\/background-removal-data\/1\.7\.0\/dist\//);
      expect(a.path).toMatch(/^models\/imgly\/[\w.]+$/);
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("setzt Teile in der richtigen Reihenfolge zusammen und prüft Größen", async () => {
    const resources = { "/models/x": { size: 6, chunks: [{ name: "b", offsets: [3, 6] }, { name: "a", offsets: [0, 3] }] } };
    const files = { "resources.json": JSON.stringify(resources), a: Uint8Array.of(1, 2, 3), b: Uint8Array.of(4, 5, 6) };
    const progress = [];
    const out = await loadChunked(fileFetch("/nirgends", files), "https://x/models/imgly/", "/models/x", (l, t) => progress.push([l, t]));
    expect([...out]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(progress.at(-1)).toEqual([6, 6]);
    await expect(loadChunked(fileFetch("/nirgends", { ...files, b: Uint8Array.of(4) }), "https://x/m/", "/models/x")).rejects.toThrow("unvollständig");
    await expect(loadChunked(fileFetch("/nirgends", files), "https://x/m/", "/models/y")).rejects.toThrow("nicht vorhanden");
    await expect(loadChunked(fileFetch("/nirgends", {}), "https://x/m/", "/models/x")).rejects.toThrow("HTTP 404");
  });

  it.skipIf(!fs.existsSync("public/models/imgly/resources.json"))("assets.json deckt alle Teile des Modells ab, und sie passen zusammen", async () => {
    const resources = JSON.parse(fs.readFileSync("public/models/imgly/resources.json", "utf8"));
    const paths = new Set(assets.map((a) => a.path));
    for (const chunk of resources[MODEL_KEY].chunks) expect(paths.has(`models/imgly/${chunk.name}`)).toBe(true);
    const model = await loadChunked(fileFetch("public/models/imgly"), "https://x/models/imgly/", MODEL_KEY);
    expect(model.length).toBe(resources[MODEL_KEY].size);
    expect(model[0]).toBe(0x08); // ONNX-Protobuf beginnt mit Feld 1 (ir_version)
  });
});

describe("hintergrund-entfernen: Vor- und Nachverarbeitung", () => {
  it("skaliert bilinear", () => {
    const out = resizeBilinear(Uint8Array.of(0, 100, 200, 255), 2, 2, 1, 4, 4);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(50);
    expect(out.length).toBe(16);
  });

  it("baut den Eingabetensor planar und normalisiert", () => {
    const t = toInputTensor(makePixels(16, 8));
    expect(t.length).toBe(3 * RESOLUTION * RESOLUTION);
    expect(t[2 * RESOLUTION * RESOLUTION]).toBeCloseTo((160 - 128) / 256, 5); // Blau ist überall 160
    expect(Math.max(...t.subarray(0, 1000))).toBeLessThan(0.5);
  });

  it("setzt die Maske als Alphakanal, ohne vorhandene Transparenz zu verlieren", () => {
    const output = new Float32Array(RESOLUTION * RESOLUTION);
    for (let y = 0; y < RESOLUTION; y++) for (let x = RESOLUTION / 2; x < RESOLUTION; x++) output[y * RESOLUTION + x] = 1;
    const img = makePixels(20, 10);
    const mask = maskFromOutput(output, 20, 10);
    const out = applyMask(img, mask);
    expect(out.data[3]).toBe(0);
    expect(out.data[19 * 4 + 3]).toBe(255);
    expect(transparentShare(out)).toBeCloseTo(0.5, 1);
    expect(img.data[3]).toBe(255); // Original unverändert
  });

  it("beschreibt den Fortschritt", () => {
    expect(describeProgress({ step: "model", loaded: 10 * 1024 * 1024, total: 44 * 1024 * 1024 })).toBe("Modell wird geladen: 10 von 44 MB");
    expect(describeProgress({ step: "infer" })).toBe("Hintergrund wird erkannt …");
  });
});
