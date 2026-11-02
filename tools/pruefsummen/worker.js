import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const { ALGORITHMS, hashBlob } = await import("./hashing.js");
  // WebAssembly einmal vorab instanziieren, damit #engine erst „bereit“ meldet, wenn hash-wasm wirklich läuft.
  await Promise.all(ALGORITHMS.map((a) => a.create()));
  return {
    /** Datei wird stückweise gelesen (File ist im Worker per slice() lesbar, nichts wird komplett geladen). */
    async hash({ file, ids }, ctx) {
      let last = 0;
      return hashBlob(file, ids, (done, total) => {
        const now = Date.now();
        if (now - last > 100 || done === total) {
          last = now;
          ctx.progress({ done, total });
        }
      });
    },
  };
});
