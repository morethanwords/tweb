import {IS_PREVIEW} from '@config/debug';

/*
 * The preview tab runs permanently hidden, and Chrome throttles DOM timers in
 * hidden tabs down to one wake-up per minute (or freezes them outright) — so
 * every setTimeout-driven flow (transitions, queues, previewRaf's rAF shim)
 * eventually stalls. Worker threads are exempt from that throttling, so under
 * the preview flag every window timer is re-driven by a tiny inline worker:
 * the page executes timer callbacks in response to worker messages, which are
 * delivered immediately regardless of visibility.
 *
 * The Page Visibility API is spoofed to 'visible' as well, so the app never
 * pauses media, animations or polling the way it would in a real background
 * tab. Must be imported before any other module (see src/index.ts) so no code
 * captures the native timers. Production builds fold all of this away.
 */
if(IS_PREVIEW && typeof(window) !== 'undefined') {
  type StoredTimer = {callback: (...args: any[]) => void, args: any[], isInterval?: boolean};

  const workerSource = `
    var timers = {};
    onmessage = function(e) {
      var d = e.data;
      if(d.type === 'timeout') timers[d.id] = setTimeout(function() { delete timers[d.id]; postMessage(d.id); }, d.delay);
      else if(d.type === 'interval') timers[d.id] = setInterval(function() { postMessage(d.id); }, d.delay);
      else if(d.type === 'clear') { clearTimeout(timers[d.id]); clearInterval(timers[d.id]); delete timers[d.id]; }
    };
  `;

  const worker = new Worker(URL.createObjectURL(new Blob([workerSource], {type: 'application/javascript'})));
  const timers = new Map<number, StoredTimer>();
  let autoIncrement = 0;

  const set = (type: 'timeout' | 'interval', callback: StoredTimer['callback'], delay: number, args: any[]) => {
    const id = ++autoIncrement;
    timers.set(id, {callback, args, isInterval: type === 'interval'});
    worker.postMessage({type, id, delay: delay || 0});
    return id;
  };

  const clear = (id: number) => {
    if(!timers.delete(id)) {
      return;
    }

    worker.postMessage({type: 'clear', id});
  };

  worker.addEventListener('message', (e) => {
    const id = e.data as number;
    const timer = timers.get(id);
    if(!timer) {
      return;
    }

    if(!timer.isInterval) {
      timers.delete(id);
    }

    if(typeof(timer.callback) === 'function') {
      timer.callback(...timer.args);
    }
  });

  window.setTimeout = ((callback: StoredTimer['callback'], delay?: number, ...args: any[]) => set('timeout', callback, delay, args)) as any;
  window.setInterval = ((callback: StoredTimer['callback'], delay?: number, ...args: any[]) => set('interval', callback, delay, args)) as any;
  window.clearTimeout = window.clearInterval = clear as any;

  window.requestIdleCallback = ((callback: IdleRequestCallback) => {
    return window.setTimeout(() => callback({didTimeout: false, timeRemaining: () => 50} as IdleDeadline), 1);
  }) as any;
  window.cancelIdleCallback = clear as any;

  // * pretend the tab is visible and focused, so nothing pauses itself
  const defineGetter = (object: any, property: string, value: any) => {
    try {
      Object.defineProperty(object, property, {get: () => value, configurable: true});
    } catch{}
  };

  defineGetter(document, 'hidden', false);
  defineGetter(document, 'visibilityState', 'visible');
  document.hasFocus = () => true;

  const swallowEvent = (e: Event) => e.stopImmediatePropagation();
  document.addEventListener('visibilitychange', swallowEvent, true);
  window.addEventListener('visibilitychange', swallowEvent, true);

  // * Chrome defers raster decoding in hidden tabs, so img.decode() never
  // * resolves there — wait for the load event instead
  HTMLImageElement.prototype.decode = function() {
    return new Promise<void>((resolve, reject) => {
      if(this.complete) {
        if(this.naturalWidth) resolve();
        else reject(new DOMException('broken image', 'EncodingError'));
        return;
      }

      this.addEventListener('load', () => resolve(), {once: true});
      this.addEventListener('error', () => reject(new DOMException('broken image', 'EncodingError')), {once: true});
    });
  };
}

export {};
