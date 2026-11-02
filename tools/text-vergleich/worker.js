import { serve } from "../../src/shared/worker-host.js";

// Kein WebAssembly: jsdiff läuft hier nur, damit große Texte die Seite nicht einfrieren.
serve(async () => {
  const { compareTexts, makePatch } = await import("./compare.js");
  return {
    compare: ({ before, after, options }) => compareTexts(before, after, options),
    patch: ({ before, after, nameA, nameB }) => makePatch(before, after, nameA, nameB),
  };
});
