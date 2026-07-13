import IS_SHARED_WORKER_OFFSCREEN_CANVAS_SUPPORTED from '@environment/sharedWorkerOffscreenCanvasSupport';
import {logger} from '@lib/logger';
import type {SpoilerRendererInMessage, SpoilerRendererOutMessage} from '@components/spoilerRenderer.worker';

export type SpoilerRendererConnection = {
  postMessage: (message: SpoilerRendererInMessage | ImageBitmap, transfer?: Transferable[]) => void,
  release: () => void
};

/**
 * The spoiler-rendering worker. It presents into OffscreenCanvases transferred from
 * the tab, which is incompatible with a SharedWorker (see
 * IS_SHARED_WORKER_OFFSCREEN_CANVAS_SUPPORTED — a cross-process present kills the
 * renderer), so it runs as a per-tab dedicated Worker. The SharedWorker branch is
 * kept behind that flag in case the platform ever supports the combination.
 *
 * Consumers (bluff spoilers, media spoilers) hold a refcounted handle that owns
 * their message listener; the underlying connection and the per-tab 'bye' are
 * managed here only.
 */

const log = logger('spoiler-renderer');

type Underlying = {port: MessagePort | Worker, dispose: () => void};

const messageListeners = new Set<(message: SpoilerRendererOutMessage) => void>();
let connection: Underlying;
let users = 0;
let failed = false;
let pagehideListenerAdded = false;

export function hasSpoilerRendererFailed() {
  return failed;
}

function onError(error: ErrorEvent) {
  log.error('the worker failed, new spoilers will fall back to the main thread', error);
  failed = true;
  messageListeners.forEach((listener) => listener({type: 'connection-error'}));
}

function connect(): Underlying {
  let port: MessagePort | Worker, dispose: () => void;
  if(IS_SHARED_WORKER_OFFSCREEN_CANVAS_SUPPORTED) {
    const sharedWorker = new SharedWorker(new URL('./spoilerRenderer.worker.ts', import.meta.url), {type: 'module'});
    sharedWorker.addEventListener('error', onError);
    port = sharedWorker.port;
    dispose = () => {
      (port as MessagePort).postMessage({type: 'bye'});
      (port as MessagePort).close();
    };

    // tell the worker to drop this tab's state when the tab goes away
    if(!pagehideListenerAdded) {
      pagehideListenerAdded = true;
      window.addEventListener('pagehide', () => {
        connection?.port.postMessage({type: 'bye'});
      });
    }
  } else {
    const worker = new Worker(new URL('./spoilerRenderer.worker.ts', import.meta.url), {type: 'module'});
    worker.addEventListener('error', onError);
    port = worker;
    dispose = () => worker.terminate();
  }

  port.onmessage = (event: MessageEvent<SpoilerRendererOutMessage>) => {
    messageListeners.forEach((listener) => listener(event.data));
  };

  return {port, dispose};
}

export function retainSpoilerRenderer(onMessage?: (message: SpoilerRendererOutMessage) => void): SpoilerRendererConnection {
  ++users;
  connection ??= connect();
  if(onMessage) messageListeners.add(onMessage);

  let released = false;
  return {
    postMessage: (message, transfer) => {
      if(!released) connection?.port.postMessage(message, transfer);
    },
    release: () => {
      if(released) return;
      released = true;

      if(onMessage) messageListeners.delete(onMessage);
      if(!--users && connection) {
        connection.dispose();
        connection = undefined;
      }
    }
  };
}
