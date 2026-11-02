import { serve } from "../../src/shared/worker-host.js";
import { buildZip } from "./zip.js";

serve(async () => ({
  async zip({ entries, level }, ctx) {
    let last = 0;
    return buildZip(entries, {
      level,
      onProgress: (done, total) => {
        const now = Date.now();
        if (now - last > 100 || done === total) {
          last = now;
          ctx.progress({ done, total });
        }
      },
    });
  },
}));
