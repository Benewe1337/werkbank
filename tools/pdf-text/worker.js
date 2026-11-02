import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const mupdf = await import("mupdf");
  const { extractText } = await import("./text.js");
  return {
    extract({ buffer }) {
      return extractText(mupdf, new Uint8Array(buffer));
    },
  };
});
