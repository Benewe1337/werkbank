import { serve } from "../../src/shared/worker-host.js";
// pandoc-wasm exportiert nur ".", dessen Browser-Variante `import("./pandoc.wasm")` braucht (ESM-WASM,
// in Vite nicht ohne Plugin). Deshalb den Kern direkt laden und die .wasm als URL ausliefern.
import wasmUrl from "../../node_modules/pandoc-wasm/src/pandoc.wasm?url";

serve(async () => {
  const { createPandocInstance } = await import("../../node_modules/pandoc-wasm/src/core.js");
  const { convertDocument } = await import("./formats.js");
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`pandoc.wasm nicht gefunden (HTTP ${res.status})`);
  const binary = await res.arrayBuffer();
  let pandoc = await createPandocInstance(binary);

  return {
    async convert(input, ctx) {
      try {
        const result = await convertDocument(pandoc.convert, input);
        ctx.transfer([result.bytes.buffer]);
        return result;
      } catch (error) {
        // Ein Absturz im Haskell-Laufzeitsystem hinterlässt eine unbrauchbare Instanz: neu starten.
        if (error instanceof WebAssembly.RuntimeError) {
          pandoc = await createPandocInstance(binary);
          throw new Error("Pandoc ist bei dieser Datei abgestürzt. Ist sie beschädigt?");
        }
        throw error;
      }
    },
  };
});
