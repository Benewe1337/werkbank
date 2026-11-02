// Lädt große Dateien (z. B. KI-Modelle), die nicht auf npm liegen, beim Build nach public/.
// Jedes Werkzeug kann eine tools/<id>/assets.json haben:
//   [{ "url": "https://…", "path": "models/xyz/model.onnx", "sha256": "…" }]
// Dateien landen unter public/<path> (gitignored) und werden selbst ausgeliefert, damit die Seite
// zur Laufzeit keine fremden Server anfragt. Vorhandene Dateien mit passender Prüfsumme werden übersprungen.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const only = process.env.TOOLS?.split(",").map((s) => s.trim()).filter(Boolean);

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function fetchAsset({ url, path: rel, sha256: expected }, tool) {
  if (!url || !rel || !expected) throw new Error(`tools/${tool}/assets.json: url, path und sha256 sind Pflicht`);
  if (rel.includes("..")) throw new Error(`tools/${tool}/assets.json: ungültiger Pfad ${rel}`);
  const target = path.join(root, "public", rel);
  if (fs.existsSync(target) && sha256(target) === expected) return "vorhanden";
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = crypto.createHash("sha256").update(buf).digest("hex");
  if (actual !== expected) throw new Error(`${rel}: Prüfsumme passt nicht (erwartet ${expected}, erhalten ${actual})`);
  fs.writeFileSync(target, buf);
  return `${(buf.length / 1024 / 1024).toFixed(1)} MB geladen`;
}

const toolsDir = path.join(root, "tools");
for (const tool of fs.readdirSync(toolsDir)) {
  if (only && !only.includes(tool)) continue;
  const manifest = path.join(toolsDir, tool, "assets.json");
  if (!fs.existsSync(manifest)) continue;
  for (const asset of JSON.parse(fs.readFileSync(manifest, "utf8"))) {
    const status = await fetchAsset(asset, tool);
    console.log(`[assets] ${tool}: ${asset.path} (${status})`);
  }
}
