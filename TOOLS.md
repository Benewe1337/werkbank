# Ein Werkzeug anlegen

Jedes Werkzeug ist ein Ordner `tools/<id>/` und wird automatisch zu einer Seite `/tools/<id>/`
und zu einem Eintrag auf der Startseite. Vorlagen: `tools/zuschnitt/` (Dateien rein → Dateien raus)
und `tools/pdf-zusammenfuegen/` (Auswahl ordnen, dann ein Ergebnis).

## Dateien

| Datei | Pflicht | Inhalt |
|---|---|---|
| `tool.json` | ja | `{ "title", "group", "summary", "order" }`. `group` ist eine von: PDF, Bilder, Video & Audio, Text, Codes, Daten, Archive. `summary` ist ein kurzer, konkreter Satz ohne Punkt. |
| `index.html` | ja | Seite. Enthält `<!--header-->` und `<!--footer-->`, `<main class="page">` mit `h1`, `p.lede`, `section.work`. |
| `main.js` | ja | UI-Logik. Importiert zuerst `../../src/shared/style.css`. |
| `worker.js` | wenn WASM | Rechnet im Web Worker, nutzt `serve()` aus `src/shared/worker-host.js`. |
| `*.js` (Logik) | empfohlen | Reine Funktionen ohne DOM, damit sie in Vitest (Node) testbar sind. |
| `style.css` | optional | Nur werkzeugspezifische Ergänzungen. Gemeinsames gehört in `src/shared/style.css`. |
| `assets.json` | optional | Große Dateien, die nicht auf npm liegen (Modelle). Siehe unten. |

`tool.json` erst anlegen, wenn die Seite baut. Ordner ohne `tool.json` werden ignoriert
(gut für geteilte Hilfsmodule, z. B. `tools/_ffmpeg/`).

## Bausteine (`src/shared/`)

- `ui.js`: `mountDrop(el, {accept, multiple, label, hint, onFiles, onRejected})`,
  `createJobList(el)` → `jobs.add(name)` → `job.status(text, state)`, `job.note(text, level)`,
  `job.result(blob, fileName, {label, preview})`, `job.fail(error)`. Ab zwei Ergebnissen erscheint „Alle als ZIP“.
  `processEach(files, jobs, fn)`, `rejectInto(jobs, "PDF")`, `engineStatus(el, ready)`, `downloadBlob`, `$`.
- `worker-client.js` / `worker-host.js`: RPC mit Ready-Handshake. Im Worker die WASM erst innerhalb
  von `serve(async () => { … })` laden (dynamischer Import), sonst gehen frühe Nachrichten verloren.
- `format.js`: `formatSize`, `formatSaving`, `outputName`, `baseName`, `matchesAccept`, `parsePageRanges`.
- CSS-Klassen: `.options`, `.field` (+ `.grow`, `.check`), `.button` (+ `.ghost`), `.row`, `.panel`,
  `.stage` (Vorschau mit Schachbrett), `pre.code`, `table.data` in `.table-wrap`, `.hint`, `.error`,
  `.queue`/`.queue-item`/`.icon-button`.

Gibt es eine Status-Anzeige der WebAssembly, heißt das Element `#engine`; Tests warten darauf.

## Regeln

- **Nichts verlässt den Browser.** Keine Laufzeit-Anfragen an fremde Server (CSP in `vercel.json`
  erlaubt nur `'self'`). WASM/Worker/Daten über Vite-Imports (`?url`, `new URL(…, import.meta.url)`) bündeln.
- **Große Modelle** über `tools/<id>/assets.json` (`[{url, path, sha256}]`): `scripts/fetch-assets.mjs`
  lädt sie beim Build nach `public/<path>` (gitignored) und prüft die Prüfsumme. Revision in der URL pinnen.
- Rechnen im Worker, nicht im Haupt-Thread, sobald es spürbar dauert.
- Fehler landen sichtbar am Job (`job.fail`), nie nur in der Konsole. Verständliche deutsche Meldungen.
- Texte: kurz, sachlich, Du-Form. Keine Werbesprache.
- Touch-Ziele ≥ 44 px, Labels an allen Eingaben, Tastatur muss reichen.

## Tests

- Unit: `tests/unit/tools/<id>.test.js` für die reine Logik (Vitest, Node). Testdateien zur Laufzeit
  erzeugen (siehe `tests/fixtures/`), keine Binärdateien committen.
- E2E: `tests/e2e/tools/<id>.spec.js` (Playwright). Hilfen in `tests/e2e/helpers.js`
  (`openTool`, `downloadFirst`, `file`). Mindestens: Hauptweg mit echtem Ergebnis prüfen + ein Fehlerfall.
- `tests/e2e/home.spec.js` prüft automatisch, dass jede Seite ohne Fehler startet.

```bash
npm test                                             # Unit
npx playwright test                                  # E2E gegen Produktions-Build (mit CSP-Headern)
PORT=5310 E2E_DEV=1 npx playwright test tests/e2e/tools/x.spec.js     # schnell gegen Dev-Server
PORT=5310 TOOLS=x npx playwright test tests/e2e/tools/x.spec.js       # Build nur von x, mit CSP
```
