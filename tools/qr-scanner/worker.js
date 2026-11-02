import { serve } from "../../src/shared/worker-host.js";

serve(async () => {
  const { default: wasmUrl } = await import("zxing-wasm/reader/zxing_reader.wasm?url");
  const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
  // .wasm aus dem eigenen Build laden, nicht vom CDN.
  await prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? new URL(wasmUrl, self.location.href).href : prefix + path) },
    fireImmediately: true,
  });
  const simplify = (results) =>
    results.filter((r) => r.isValid).map((r) => ({ format: r.format, text: r.text, contentType: r.contentType }));
  return {
    /** Bilddatei (PNG, JPEG, …) oder RGBA-Pixel eines Kamerabilds. */
    async read({ file, image, tryHarder = true }) {
      const input = file ?? image;
      const results = await readBarcodes(input, { tryHarder, maxNumberOfSymbols: 8, formats: [] });
      return simplify(results);
    },
  };
});
