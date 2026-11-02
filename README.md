# Werkbank

Datei-Werkzeuge ohne Werbung: PDFs, Bilder, Video/Audio, Text, Codes, Daten, Archive.
Alles läuft als WebAssembly im Browser, Dateien werden nicht hochgeladen.

## Entwicklung

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Unit-Tests (Vitest)
npx playwright test  # E2E gegen den Produktions-Build, inkl. Startup-Test aller Seiten
npm run build        # -> dist/
```

Neues Werkzeug anlegen: siehe [TOOLS.md](TOOLS.md). Design: [Design.md](Design.md).

## Deployment

Vercel (statisch). `vercel.json` setzt CSP und Sicherheits-Header; dieselben Header gelten in `vite preview`,
damit CSP-Probleme schon in den E2E-Tests auffallen.

## Lizenz

AGPL-3.0-or-later (MuPDF ist AGPL, ffmpeg/pandoc GPL). Einzelne Bibliotheken haben eigene Lizenzen, siehe `package.json`.
