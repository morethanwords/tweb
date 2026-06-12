import IS_SHARED_WORKER_SUPPORTED from '@environment/sharedWorkerSupport';
import type {SpoilerRendererInMessage, SpoilerRendererOutMessage} from '@components/spoilerRenderer.worker';

export type SpoilerRendererPort = {
  postMessage: (message: SpoilerRendererInMessage | ImageBitmap, transfer?: Transferable[]) => void
};

/**
 * One spoiler-rendering worker for the whole app — a SharedWorker when available,
 * so every tab feeds from the same simulations, with a dedicated worker fallback.
 * The connection is refcounted by its consumers (bluff spoilers, media spoilers).
 */

const messageListeners = new Set<(message: SpoilerRendererOutMessage) => void>();
let connection: {port: SpoilerRendererPort, dispose: () => void};
let users = 0;

export function addSpoilerRendererListener(listener: (message: SpoilerRendererOutMessage) => void) {
  messageListeners.add(listener);
}

function connect() {
  let port: MessagePort | Worker, dispose: () => void;
  if(IS_SHARED_WORKER_SUPPORTED) {
    const sharedWorker = new SharedWorker(new URL('./spoilerRenderer.worker.ts', import.meta.url), {type: 'module'});
    port = sharedWorker.port;
    dispose = () => {
      (port as MessagePort).postMessage({type: 'bye'});
      (port as MessagePort).close();
    };

    // tell the worker to drop this tab's state when the tab goes away
    window.addEventListener('pagehide', () => {
      if(connection?.port === port) port.postMessage({type: 'bye'});
    });
  } else {
    const worker = new Worker(new URL('./spoilerRenderer.worker.ts', import.meta.url), {type: 'module'});
    port = worker;
    dispose = () => worker.terminate();
  }

  port.onmessage = (event: MessageEvent<SpoilerRendererOutMessage>) => {
    messageListeners.forEach((listener) => listener(event.data));
  };

  return {port, dispose};
}

export function retainSpoilerRenderer(): SpoilerRendererPort {
  ++users;
  connection ??= connect();
  return connection.port;
}

export function releaseSpoilerRenderer() {
  if(--users || !connection) return;

  connection.dispose();
  connection = undefined;
}
