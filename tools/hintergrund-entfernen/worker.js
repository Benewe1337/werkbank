import { serve } from "../../src/shared/worker-host.js";
// WebAssembly und Emscripten-Lader von onnxruntime-web, von Vite als Dateien mitgeliefert (kommen von 'self').
// Das Paket gibt sie nicht über "exports" frei, daher der direkte Pfad.
import ortMjs from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url";
import ortWasm from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";

serve(async () => {
  const ort = await import("onnxruntime-web/wasm");
  const codecs = await import("../_bild/codecs.js");
  const { detectFormat } = await import("../_bild/format.js");
  const r = await import("./remove.js");

  // Ohne Cross-Origin-Isolation gibt es kein SharedArrayBuffer: also ausdrücklich ein Thread, kein Proxy.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };

  let session = null;
  const getSession = (progress) =>
    (session ??= (async () => {
      const model = await r.loadChunked(fetch, r.modelBase(self.location.origin), r.MODEL_KEY, (loaded, total) =>
        progress({ step: "model", loaded, total }),
      );
      return ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    })().catch((error) => {
      session = null; // beim nächsten Bild neu versuchen
      throw new Error(`Das Modell ließ sich nicht laden: ${error.message ?? error}`);
    }));

  return {
    async remove({ buffer }, ctx) {
      const bytes = new Uint8Array(buffer);
      const format = detectFormat(bytes);
      if (!["jpeg", "png", "webp", "avif"].includes(format)) throw new Error("Kein unterstütztes Bild. Erlaubt sind JPG, PNG, WebP und AVIF.");
      const s = await getSession(ctx.progress);
      ctx.progress({ step: "decode" });
      const image = await codecs.decode(bytes, format);
      ctx.progress({ step: "infer" });
      const input = new ort.Tensor("float32", r.toInputTensor(image), [1, 3, r.RESOLUTION, r.RESOLUTION]);
      const result = await s.run({ input });
      const mask = r.maskFromOutput(result.output.data, image.width, image.height);
      input.dispose?.();
      result.output.dispose?.();
      ctx.progress({ step: "encode" });
      const out = r.applyMask(image, mask);
      const png = await codecs.encode(out, "png", { optimise: false });
      ctx.transfer([png.buffer]);
      return { bytes: png, width: image.width, height: image.height, transparent: r.transparentShare(out) };
    },
  };
});
