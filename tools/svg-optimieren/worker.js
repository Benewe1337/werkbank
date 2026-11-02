// SVGO läuft im Worker, damit große SVGs die Seite nicht blockieren.
import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const { optimize } = await import("svgo/browser");
  const { optimizeSvg } = await import("./svg.js");
  return {
    optimize: ({ text, options }) => optimizeSvg(optimize, text, options),
  };
});
