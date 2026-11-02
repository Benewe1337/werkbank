import "../../src/shared/style.css";
import "../_codes/codes.css";
import "./style.css";
import { connect } from "../../src/shared/worker-client.js";
import { $, engineStatus, mountDrop } from "../../src/shared/ui.js";
import { copyButton, h } from "../_codes/dom.js";
import { describe, explainCameraError, formatLabel, KIND_LABEL } from "./describe.js";

const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
engineStatus($("#engine"), engine.ready);

const results = $("#results");
const status = $("#status");
const video = /** @type {HTMLVideoElement} */ ($("#video"));
const cameraBox = $("#camera");
const startButton = $("#camera-start");
const stopButton = $("#camera-stop");
/** Abstand zwischen zwei Kamerabildern, die gelesen werden. */
const SCAN_INTERVAL_MS = 200;

const seen = new Set();

function renderResult({ format, text }, source) {
  const info = describe(text);
  const body = [];
  if (info.kind === "url") {
    body.push(h("a", { class: "text-link", href: info.url, target: "_blank", rel: "noopener noreferrer nofollow", text: info.url }));
  } else if (info.kind === "wifi") {
    body.push(h("dl", { class: "pairs" }, info.rows.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })])));
  }
  if (info.kind !== "url") body.push(h("pre", { class: "code result-text", text }));
  const item = h(
    "li",
    { class: "result-item", "data-kind": info.kind },
    h("span", { class: "result-meta", text: `${formatLabel(format)} · ${KIND_LABEL[info.kind]} · ${source}` }),
    ...body,
    h("div", { class: "row" }, copyButton(() => text, "Inhalt kopieren")),
  );
  results.prepend(item);
}

function showFound(found, source) {
  for (const r of found) renderResult(r, source);
}

mountDrop($("#drop"), {
  accept: "image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp",
  label: "Bild mit Code hier ablegen",
  hint: "Foto oder Screenshot",
  onRejected: (file) => (status.textContent = `${file.name}: Das ist kein Bild.`),
  onFiles: async (files) => {
    for (const file of files) {
      status.textContent = `${file.name} wird gelesen …`;
      try {
        await engine.ready;
        const found = await engine.call("read", { file });
        if (found.length === 0) {
          status.textContent = `${file.name}: Kein Code gefunden. Versuch ein schärferes oder größeres Bild.`;
          continue;
        }
        status.textContent = `${file.name}: ${found.length === 1 ? "1 Code" : `${found.length} Codes`} gefunden.`;
        showFound(found, file.name);
      } catch (error) {
        status.textContent = `${file.name}: ${error.message.includes("decode") ? "Das Bild ließ sich nicht öffnen." : error.message}`;
      }
    }
  },
});

/** @type {MediaStream | null} */
let stream = null;
let timer = 0;
let busy = false;
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

async function scanFrame() {
  if (!stream || busy || video.readyState < 2) return;
  busy = true;
  try {
    const w = video.videoWidth;
    const h2 = video.videoHeight;
    if (!w || !h2) return;
    canvas.width = w;
    canvas.height = h2;
    ctx.drawImage(video, 0, 0, w, h2);
    const image = ctx.getImageData(0, 0, w, h2);
    const found = await engine.call("read", { image, tryHarder: false }, { transfer: [image.data.buffer] });
    const fresh = found.filter((r) => !seen.has(`${r.format}:${r.text}`));
    for (const r of fresh) seen.add(`${r.format}:${r.text}`);
    if (fresh.length) {
      showFound(fresh, "Kamera");
      status.textContent = "Code erkannt. Die Kamera sucht weiter.";
    }
  } catch (error) {
    status.textContent = error.message;
  } finally {
    busy = false;
  }
}

function stopCamera() {
  clearInterval(timer);
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
  video.srcObject = null;
  cameraBox.hidden = true;
  startButton.hidden = false;
  stopButton.hidden = true;
}

startButton.addEventListener("click", async () => {
  status.textContent = "Kamera wird gestartet …";
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new TypeError("no mediaDevices");
    // Rückkamera bevorzugen (ideal, nicht exact: Laptops haben nur eine Frontkamera).
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
  } catch (error) {
    status.textContent = explainCameraError(error);
    return;
  }
  seen.clear();
  video.srcObject = stream;
  cameraBox.hidden = false;
  startButton.hidden = true;
  stopButton.hidden = false;
  await video.play().catch(() => {});
  status.textContent = "Halte den Code ins Bild.";
  await engine.ready;
  timer = window.setInterval(scanFrame, SCAN_INTERVAL_MS);
});

stopButton.addEventListener("click", () => {
  stopCamera();
  status.textContent = "Kamera beendet.";
});

// Kamera nicht im Hintergrund weiterlaufen lassen.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && stream) {
    stopCamera();
    status.textContent = "Kamera beendet, weil die Seite im Hintergrund war.";
  }
});
window.addEventListener("pagehide", stopCamera);
