// Worker-Seite des RPC. onmessage wird sofort gesetzt; Aufrufe werden gepuffert, bis init() fertig ist.
// So gehen keine Nachrichten verloren, während die WebAssembly lädt (Top-Level-Await-Falle).

/**
 * @param {() => Promise<Record<string, (payload: any, ctx: {progress: (p: any) => void, transfer: (t: Transferable[]) => void}) => any>>} init
 */
export function serve(init) {
  const queue = [];
  let handlers = null;

  const run = async ({ id, method, payload }) => {
    const transfers = [];
    const ctx = {
      progress: (p) => self.postMessage({ id, type: "progress", progress: p }),
      transfer: (list) => transfers.push(...list),
    };
    try {
      const fn = handlers[method];
      if (!fn) throw new Error(`Unbekannte Methode: ${method}`);
      const result = await fn(payload, ctx);
      self.postMessage({ id, type: "done", result }, transfers);
    } catch (error) {
      self.postMessage({ id, type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  self.onmessage = ({ data }) => (handlers ? run(data) : queue.push(data));

  init().then(
    (h) => {
      handlers = h;
      self.postMessage({ type: "ready" });
      for (const msg of queue.splice(0)) run(msg);
    },
    (error) => self.postMessage({ type: "init-error", message: error instanceof Error ? error.message : String(error) }),
  );
}
