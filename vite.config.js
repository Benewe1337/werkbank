import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { loadTools, renderToolIndex } from "./build/tools.js";

const root = import.meta.dirname;
const partial = (name) => fs.readFileSync(path.join(root, "src/partials", `${name}.html`), "utf8");

/**
 * Jede tools/<id>/index.html ist ein eigener Einstiegspunkt (Mehrseiten-App, kein Router).
 * TOOLS=a,b baut nur diese Werkzeuge (für parallele Entwicklung/Tests).
 */
function toolInputs() {
  const only = process.env.TOOLS?.split(",").map((s) => s.trim()).filter(Boolean);
  const inputs = { main: path.join(root, "index.html") };
  for (const tool of loadTools(root)) {
    if (only && !only.includes(tool.id)) continue;
    inputs[tool.id] = path.join(root, "tools", tool.id, "index.html");
  }
  return inputs;
}

/** Setzt gemeinsame Teile in jede Seite ein: <!--header-->, <!--footer-->, <!--tools-->. */
function partials() {
  return {
    name: "werkbank-partials",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html
          .replace("<!--header-->", partial("header"))
          .replace("<!--footer-->", partial("footer"))
          .replace("<!--tools-->", () => renderToolIndex(loadTools(root)));
      },
    },
  };
}

/** Dieselben Header wie auf Vercel auch in `vite preview`, damit CSP-Fehler schon im Test auffallen. */
function vercelHeaders() {
  const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const all = config.headers.find((h) => h.source === "/(.*)");
  return Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
}

export default defineConfig({
  plugins: [partials()],
  preview: { headers: vercelHeaders() },
  // Diese Pakete laden ihre .wasm selbst bzw. nutzen Top-Level-Await: nicht vorbündeln.
  optimizeDeps: {
    exclude: [
      "mupdf",
      "@ffmpeg/ffmpeg",
      "@ffmpeg/util",
      "@jsquash/jpeg",
      "@jsquash/png",
      "@jsquash/webp",
      "@jsquash/avif",
      "@jsquash/oxipng",
      "@jsquash/resize",
      "zxing-wasm",
      "hash-wasm",
      "@duckdb/duckdb-wasm",
      "libarchive.js",
      "pandoc-wasm",
    ],
  },
  build: {
    target: "esnext",
    // OUT_DIR erlaubt parallele Builds (z. B. dist-5301 für PORT=5301).
    outDir: process.env.OUT_DIR ?? "dist",
    rollupOptions: { input: toolInputs() },
    chunkSizeWarningLimit: 4000,
  },
  worker: { format: "es" },
  test: {
    include: ["tests/unit/**/*.test.js"],
    testTimeout: 120_000,
  },
});
