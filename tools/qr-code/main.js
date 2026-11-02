import "../../src/shared/style.css";
import "../_codes/codes.css";
import { $, downloadBlob } from "../../src/shared/ui.js";
import { debounce } from "../_codes/dom.js";
import { buildPayload, contrastWarning } from "../_codes/payloads.js";
import { buildQr, MAX_LOGO_AREA } from "./render.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const form = /** @type {HTMLFormElement} */ ($("#form"));
const preview = $("#preview");
const info = $("#info");
const warning = $("#warning");
const errorBox = $("#error");
const logoInput = /** @type {HTMLInputElement} */ (form.elements.namedItem("logo"));
const logoSize = /** @type {HTMLInputElement} */ (form.elements.namedItem("logoSize"));
const ecSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem("ecLevel"));
const logoRemove = $("#logo-remove");
const logoHint = $("#logo-hint");

/** @type {{dataUrl: string, image: HTMLImageElement} | null} */
let logo = null;
/** @type {{qr: ReturnType<typeof buildQr>, svg: SVGSVGElement, fg: string, bg: string} | null} */
let current = null;

const value = (name) => {
  const el = form.elements.namedItem(name);
  if (!el) return "";
  return el.type === "checkbox" ? el.checked : el.value.trim();
};

function fieldsFor(type) {
  switch (type) {
    case "text":
      return { text: form.elements.namedItem("text").value };
    case "wifi":
      return { ssid: form.elements.namedItem("ssid").value, password: form.elements.namedItem("password").value, security: value("security"), hidden: value("hidden") };
    case "vcard":
      return Object.fromEntries(["firstName", "lastName", "org", "title", "phone", "email", "url", "street", "zip", "city", "country"].map((k) => [k, value(k)]));
    case "email":
      return { to: value("to"), subject: value("subject"), body: form.elements.namedItem("body").value };
    case "tel":
      return { phone: value("tel") };
    default:
      return {};
  }
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Baut das SVG mit DOM-APIs; der Inhalt landet nur als Pfadgeometrie im Bild, nie als Markup. */
function buildSvg(qr, fg, bg) {
  const svg = svgEl("svg", { xmlns: SVG_NS, viewBox: `0 0 ${qr.size} ${qr.size}`, width: qr.size * 10, height: qr.size * 10 });
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "QR-Code-Vorschau");
  svg.append(svgEl("rect", { width: qr.size, height: qr.size, fill: bg }));
  svg.append(svgEl("path", { d: qr.path, fill: fg }));
  if (qr.logo && logo) {
    const img = svgEl("image", { x: qr.logo.x, y: qr.logo.y, width: qr.logo.size, height: qr.logo.size, preserveAspectRatio: "xMidYMid meet" });
    img.setAttribute("href", logo.dataUrl);
    svg.append(img);
  }
  return svg;
}

function showError(message) {
  current = null;
  preview.replaceChildren();
  info.textContent = "";
  errorBox.textContent = message;
  errorBox.hidden = false;
  for (const id of ["#download-svg", "#download-png"]) $(id).disabled = true;
}

function update() {
  const type = value("type");
  for (const fs of form.querySelectorAll("[data-type]")) fs.hidden = fs.dataset.type !== type;

  const fg = value("fg");
  const bg = value("bg");
  const warn = contrastWarning(fg, bg);
  warning.textContent = warn ?? "";
  warning.hidden = !warn;

  const logoRatio = logo ? (Number(logoSize.value) / 100) * 1 : 0;
  ecSelect.disabled = Boolean(logo);
  if (logo) ecSelect.value = "H";

  let qr;
  try {
    const payload = buildPayload(type, fieldsFor(type));
    qr = buildQr(payload, {
      ecLevel: value("ecLevel"),
      margin: Number(value("margin") || 0),
      moduleShape: value("moduleShape"),
      finderShape: value("finderShape"),
      logoRatio: Math.min(logoRatio, MAX_LOGO_AREA),
    });
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
    return;
  }
  errorBox.hidden = true;
  const svg = buildSvg(qr, fg, bg);
  preview.replaceChildren(svg);
  current = { qr, svg, fg, bg };
  info.textContent = `Version ${qr.version}, ${qr.modules} × ${qr.modules} Module, Fehlerkorrektur ${qr.ecLevel}, ${qr.text.length} Zeichen`;
  for (const id of ["#download-svg", "#download-png"]) $(id).disabled = false;
}

const scheduleUpdate = debounce(update, 80);
form.addEventListener("input", (e) => (e.target === logoInput ? null : scheduleUpdate()));
form.addEventListener("change", (e) => (e.target === logoInput ? null : update()));
form.addEventListener("submit", (e) => e.preventDefault());

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Logo konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Das Logo ist kein lesbares Bild."));
    img.src = src;
  });
}

logoInput.addEventListener("change", async () => {
  const file = logoInput.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await readAsDataUrl(file);
    logo = { dataUrl, image: await loadImage(dataUrl) };
    logoSize.disabled = false;
    logoRemove.hidden = false;
    logoHint.textContent = "Mit Logo gilt immer Fehlerkorrektur H. Teste den Code vor dem Druck mit deinem Handy.";
    logoHint.hidden = false;
  } catch (error) {
    logo = null;
    logoInput.value = "";
    logoHint.textContent = error.message;
    logoHint.hidden = false;
  }
  update();
});

logoRemove.addEventListener("click", () => {
  logo = null;
  logoInput.value = "";
  logoSize.disabled = true;
  logoRemove.hidden = true;
  logoHint.hidden = true;
  ecSelect.disabled = false;
  update();
});

$("#download-svg").addEventListener("click", () => {
  if (!current) return;
  const clone = /** @type {SVGSVGElement} */ (current.svg.cloneNode(true));
  clone.removeAttribute("role");
  clone.removeAttribute("aria-label");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  downloadBlob(new Blob([xml], { type: "image/svg+xml" }), "qr-code.svg");
});

$("#download-png").addEventListener("click", async () => {
  if (!current) return;
  const { qr, fg, bg } = current;
  const size = Number(/** @type {HTMLSelectElement} */ ($("#png-size")).value);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  const scale = size / qr.size;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = fg;
  ctx.fill(new Path2D(qr.path));
  ctx.restore();
  if (qr.logo && logo) {
    const { image } = logo;
    const box = qr.logo.size * scale;
    // SVG-Logos ohne feste Größe melden 0 × 0: dann quadratisch einpassen.
    const iw = image.naturalWidth || 1;
    const ih = image.naturalHeight || 1;
    const fit = Math.min(box / iw, box / ih);
    const w = iw * fit;
    const h = ih * fit;
    ctx.drawImage(image, qr.logo.x * scale + (box - w) / 2, qr.logo.y * scale + (box - h) / 2, w, h);
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return showError("PNG konnte nicht erzeugt werden.");
  downloadBlob(blob, "qr-code.png");
});

update();
