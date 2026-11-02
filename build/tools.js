// Liest die Werkzeug-Beschreibungen (tools/<id>/tool.json) und rendert die Übersicht der Startseite.
import fs from "node:fs";
import path from "node:path";

export const GROUPS = ["PDF", "Bilder", "Video & Audio", "Text", "Codes", "Daten", "Archive"];

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** @returns {{id: string, title: string, group: string, summary: string, order: number}[]} */
export function loadTools(root) {
  const dir = path.join(root, "tools");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "tool.json")))
    .map((d) => {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, d.name, "tool.json"), "utf8"));
      for (const key of ["title", "group", "summary"]) {
        if (!meta[key]) throw new Error(`tools/${d.name}/tool.json: "${key}" fehlt`);
      }
      if (!GROUPS.includes(meta.group)) throw new Error(`tools/${d.name}/tool.json: unbekannte Gruppe "${meta.group}"`);
      return { id: d.name, order: 100, ...meta };
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "de"));
}

export function renderToolIndex(tools) {
  return GROUPS.map((group) => {
    const items = tools.filter((t) => t.group === group);
    if (items.length === 0) return "";
    const links = items
      .map(
        (t) =>
          `<li><a href="/tools/${t.id}/"><span class="tool-title">${escape(t.title)}</span></a></li>`,
      )
      .join("");
    return `<section class="group"><h2>${escape(group)}</h2><ul>${links}</ul></section>`;
  }).join("");
}
