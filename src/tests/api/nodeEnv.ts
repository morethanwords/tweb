import nodeCrypto from 'crypto';
import nodePath from 'path';
import {createRequire} from 'module';
import {indexedDB, IDBKeyRange, IDBFactory} from 'fake-indexeddb';

// Load `ws` by absolute file path so Node's resolver does not honour the
// `browser` export condition (which yields a no-op shim that throws). Vite's
// resolver — which Vitest delegates to — also picks the browser condition.
const nodeRequire = createRequire(import.meta.url);
const wsPackageJson = nodeRequire.resolve('ws/package.json');
const wsAbsPath = nodePath.join(nodePath.dirname(wsPackageJson), 'index.js');
const wsModule = nodeRequire(wsAbsPath);
const NodeWebSocket = (wsModule.WebSocket || wsModule.default || wsModule) as typeof globalThis.WebSocket;
if(typeof NodeWebSocket !== 'function') {
  console.warn('[nodeEnv] failed to load Node ws; got', typeof NodeWebSocket, Object.keys(wsModule || {}));
}

let installed = false;

export function installNodeEnv() {
  if(installed) return;
  installed = true;

  ensureSelfAlias();
  installDomShims();
  installCryptoPolyfill();
  installWebSocketPolyfill();
  installIndexedDBPolyfill();
  installCacheStoragePolyfill();
  installBroadcastChannelPolyfill();
  installStoragePolyfill();
}

function installDomShims() {
  const target: any = globalThis as any;

  if(typeof target.location === 'undefined') {
    target.location = {
      href: 'https://web.telegram.org/k/',
      origin: 'https://web.telegram.org',
      protocol: 'https:',
      host: 'web.telegram.org',
      hostname: 'web.telegram.org',
      port: '',
      pathname: '/k/',
      search: '',
      hash: ''
    };
  }

  if(typeof target.navigator === 'undefined') {
    target.navigator = {
      userAgent: 'tweb-node-harness/1.0',
      platform: 'Node',
      vendor: '',
      hardwareConcurrency: 4,
      maxTouchPoints: 0,
      onLine: true,
      language: 'en'
    };
  }

  if(typeof target.window === 'undefined') {
    target.window = target;
  }

  if(typeof target.document === 'undefined') {
    target.document = {
      createElement: () => ({getContext: (): any => null, toDataURL: () => ''}),
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  }
}

class MemoryStorage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(String(key), String(value));
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

function installStoragePolyfill() {
  const target: any = globalThis as any;
  const win: any = (typeof window !== 'undefined' ? window : undefined);

  const localStorageWorks = (() => {
    try {
      const ls = target.localStorage;
      if(!ls || typeof ls.setItem !== 'function') return false;
      ls.setItem('__probe__', '1');
      ls.removeItem('__probe__');
      return true;
    } catch{
      return false;
    }
  })();

  if(!localStorageWorks) {
    const localStorage = new MemoryStorage();
    Object.defineProperty(target, 'localStorage', {configurable: true, value: localStorage});
    if(win && win !== target) {
      Object.defineProperty(win, 'localStorage', {configurable: true, value: localStorage});
    }
  }

  const sessionStorageWorks = (() => {
    try {
      const ss = target.sessionStorage;
      if(!ss || typeof ss.setItem !== 'function') return false;
      ss.setItem('__probe__', '1');
      ss.removeItem('__probe__');
      return true;
    } catch{
      return false;
    }
  })();

  if(!sessionStorageWorks) {
    const sessionStorage = new MemoryStorage();
    Object.defineProperty(target, 'sessionStorage', {configurable: true, value: sessionStorage});
    if(win && win !== target) {
      Object.defineProperty(win, 'sessionStorage', {configurable: true, value: sessionStorage});
    }
  }
}

function installCryptoPolyfill() {
  const target: any = (typeof self !== 'undefined' ? self : globalThis) as any;
  if(target.crypto?.subtle) return;
  Object.defineProperty(target, 'crypto', {
    configurable: true,
    value: {
      subtle: nodeCrypto.webcrypto.subtle,
      getRandomValues: nodeCrypto.webcrypto.getRandomValues.bind(nodeCrypto.webcrypto)
    }
  });
}

function installWebSocketPolyfill() {
  // jsdom installs a WebSocket impl that delegates to ws/browser.js (a no-op shim
  // that throws); we must overwrite it on every surface that mtproto can reach.
  const win: any = (typeof window !== 'undefined' ? window : undefined);
  Object.defineProperty(globalThis, 'WebSocket', {configurable: true, value: NodeWebSocket});
  if(win && win !== globalThis) {
    Object.defineProperty(win, 'WebSocket', {configurable: true, value: NodeWebSocket});
  }
}

function installIndexedDBPolyfill() {
  const target: any = globalThis as any;
  if(target.indexedDB) return;
  target.indexedDB = indexedDB;
  target.IDBKeyRange = IDBKeyRange;
  target.IDBFactory = IDBFactory;
}

function installCacheStoragePolyfill() {
  const target: any = globalThis as any;
  if(target.caches) return;

  const noopCache: Cache = {
    keys: async() => [],
    match: async() => undefined,
    matchAll: async() => [],
    add: async() => {},
    addAll: async() => {},
    put: async() => {},
    delete: async() => false
  };

  const noopCacheStorage: CacheStorage = {
    open: async() => noopCache,
    has: async() => false,
    keys: async() => [],
    match: async() => undefined,
    delete: async() => false
  };
  target.caches = noopCacheStorage;
}

function installBroadcastChannelPolyfill() {
  const target: any = globalThis as any;
  if(target.BroadcastChannel) return;

  class NoopBroadcastChannel {
    public name: string;
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onmessageerror: ((event: MessageEvent) => void) | null = null;

    constructor(name: string) {
      this.name = name;
    }

    public postMessage(_message: any) {}
    public close() {}
    public addEventListener(_type: string, _listener: any) {}
    public removeEventListener(_type: string, _listener: any) {}
    public dispatchEvent(_event: Event) {
      return true;
    }
  }

  target.BroadcastChannel = NoopBroadcastChannel as any;
}

function ensureSelfAlias() {
  const target: any = globalThis as any;
  if(typeof target.self === 'undefined') {
    target.self = globalThis;
  }
}
