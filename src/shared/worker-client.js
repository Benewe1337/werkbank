// Haupt-Thread-Seite des RPC zu einem Worker, der serve() aus worker-host.js nutzt.

export function connect(worker) {
  const pending = new Map();
  let nextId = 1;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((res, rej) => ((resolveReady = res), (rejectReady = rej)));

  const failAll = (message) => {
    rejectReady(new Error(message));
    for (const { reject } of pending.values()) reject(new Error(message));
    pending.clear();
  };

  worker.onmessage = ({ data }) => {
    if (data.type === "ready") return resolveReady();
    if (data.type === "init-error") return failAll(data.message);
    const call = pending.get(data.id);
    if (!call) return;
    if (data.type === "progress") return call.onProgress?.(data.progress);
    pending.delete(data.id);
    if (data.type === "done") call.resolve(data.result);
    else call.reject(new Error(data.message));
  };
  worker.onerror = (e) => {
    e.preventDefault?.();
    failAll(e.message || "WebAssembly konnte nicht geladen werden");
  };

  /**
   * @param {string} method
   * @param {any} payload
   * @param {{transfer?: Transferable[], onProgress?: (p: any) => void}} [opts]
   */
  function call(method, payload, { transfer = [], onProgress } = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      worker.postMessage({ id, method, payload }, transfer);
    });
  }

  return { ready, call };
}
