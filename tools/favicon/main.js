import "../../src/shared/style.css";
import "../_bild/bild.css";
import "./style.css";
import { zipSync } from "fflate";
import { formatSize } from "../../src/shared/format.js";
import { connect } from "../../src/shared/worker-client.js";
import { $, engineStatus, mountDrop } from "../../src/shared/ui.js";
import { parseHexColor } from "../_bild/format.js";
import { bindRangeValue } from "../_bild/ui.js";
import { htmlSnippet, svgSize } from "./icons.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
engineStatus($("#engine"), engine.ready);

const SVG_RASTER = 1024;
const MIME = { ico: "image/x-icon", png: "image/png", svg: "image/svg+xml", webmanifest: "application/manifest+json" };
const padding = $("#padding");
const fill = $("#fill");
const color = $("#color");
bindRangeValue(padding, $("#padding-value"), " %");
fill.addEventListener("change", () => (color.disabled = !fill.checked));

let urls = [];
const blobUrl = (blob) => {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  return url;
};

/** SVG im Haupt-Thread rastern: nur hier gibt es eine SVG-Engine. Bild-Element, keine Skripte. */
async function rasterSvg(text) {
  const { width, height } = svgSize(text);
  const scale = SVG_RASTER / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const img = new Image();
  const url = URL.createObjectURL(new Blob([text], { type: MIME.svg }));
  try {
    img.src = url;
    await img.decode().catch(() => {
      throw new Error("Das SVG ließ sich nicht darstellen. Ist es gültig?");
    });
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function showError(error) {
  $("#error").textContent = error instanceof Error ? error.message : String(error);
  $("#error").hidden = false;
  $("#result").hidden = true;
  $("#status").textContent = "";
}

function showResult(files, hasSvg) {
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
  const blobs = files.map((f) => ({ ...f, blob: new Blob([f.bytes], { type: MIME[f.name.split(".").pop()] }) }));

  const previews = $("#previews");
  previews.replaceChildren(
    ...blobs
      .filter((f) => f.name.endsWith(".png") || f.name.endsWith(".ico"))
      .map((f) => {
        const fig = document.createElement("figure");
        const img = document.createElement("img");
        const shown = f.size ? Math.min(f.size, 128) : 32;
        img.src = blobUrl(f.blob);
        img.width = shown;
        img.height = shown;
        img.alt = f.name;
        const cap = document.createElement("figcaption");
        cap.textContent = f.size ? `${f.size} px` : "ICO 16–48 px";
        fig.append(img, cap);
        return fig;
      }),
  );

  $("#files").replaceChildren(
    ...blobs.map((f) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = blobUrl(f.blob);
      a.download = f.name;
      a.textContent = `${f.name} (${formatSize(f.bytes.byteLength)})`;
      li.append(a);
      return li;
    }),
  );

  const zip = zipSync(Object.fromEntries(files.map((f) => [f.name, f.bytes])), { level: 6 });
  $("#zip").href = blobUrl(new Blob([zip], { type: "application/zip" }));
  $("#snippet").textContent = htmlSnippet({ svg: hasSvg });
  $("#error").hidden = true;
  $("#result").hidden = false;
}

async function run(file) {
  $("#status").textContent = `${file.name} wird verarbeitet …`;
  $("#error").hidden = true;
  try {
    const isSvg = file.type === MIME.svg || /\.svg$/i.test(file.name);
    const opts = {
      padding: Number(padding.value) / 100,
      background: fill.checked ? parseHexColor(color.value) : null,
      name: $("#name").value.trim(),
    };
    await engine.ready;
    let files;
    if (isSvg) {
      const text = await file.text();
      const image = await rasterSvg(text);
      files = await engine.call(
        "make",
        { pixels: image.data.buffer, width: image.width, height: image.height, svgText: text, ...opts },
        { transfer: [image.data.buffer] },
      );
    } else {
      const buffer = await file.arrayBuffer();
      files = await engine.call("make", { buffer, ...opts }, { transfer: [buffer] });
    }
    showResult(files, isSvg);
    $("#status").textContent = `Fertig: ${files.length} Dateien aus ${file.name}.`;
  } catch (error) {
    showError(error);
  }
}

mountDrop($("#drop"), {
  accept: ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml",
  multiple: false,
  label: "Logo hier ablegen",
  hint: "PNG, JPG oder SVG, am besten quadratisch",
  onRejected: (f) => showError(new Error(`${f.name} passt nicht (erwartet: PNG, JPG, WebP oder SVG).`)),
  onFiles: ([file]) => run(file),
});

$("#copy").addEventListener("click", async () => {
  const button = $("#copy");
  try {
    await navigator.clipboard.writeText($("#snippet").textContent);
    button.textContent = "Kopiert";
  } catch {
    button.textContent = "Kopieren nicht erlaubt";
  }
  setTimeout(() => (button.textContent = "HTML kopieren"), 2000);
});
