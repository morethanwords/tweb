import {test as base, expect, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

interface Manifest {files: {path: string}[]; workers?: string[]}
interface Reports {attempts: string[]; violations: string[]; copies: string[]}
declare global {interface Window {__shellIsolation: () => Reports}}
export const test = base.extend<{artifact: 'production' | 'reference'; clipboard: 'native' | 'mock'; isolation: {assertClean: () => Promise<void>}}>({
  artifact: ['production', {option: true}],
  clipboard: ['native', {option: true}],
  isolation: [async ({page, artifact, clipboard}, use) => {
    const manifest = JSON.parse(readFileSync(artifact === 'reference' ? 'artifacts/reference-manifest.json' : 'artifacts/build-manifest.json', 'utf8')) as Manifest;
    const paths = new Set(['/', ...manifest.files.map(file => file.path)]);
    const network: string[] = [];
    const errors: string[] = [];
    const lifetimeReports: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Node retains reports across reloads and child-frame lifetimes.
    page.on('console', message => {
      if (message.text().startsWith('__SHELL_ISOLATION__:')) lifetimeReports.push(message.text());
    });
    await page.addInitScript(installBrowserGuards, {mockCopy: clipboard === 'mock', workers: manifest.workers ?? []});
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const legal = url.origin === (artifact === 'reference' ? 'http://127.0.0.1:3123' : 'http://127.0.0.1:3122') && paths.has(url.pathname) && request.method() === 'GET';
      if (!legal) { network.push(request.method() + ' ' + request.url()); await route.abort(); return; }
      await route.continue();
    });
    const assertClean = async () => {
      if (page.url() === 'about:blank') return;
      for (const frame of page.frames()) {
        const reports = await frame.evaluate(() => window.__shellIsolation());
        expect(reports.attempts, 'forbidden API attempts in ' + frame.url()).toEqual([]);
        expect(reports.violations, 'CSP violations in ' + frame.url()).toEqual([]);
      }
      expect(network, 'requests outside production asset manifest').toEqual([]);
      expect(errors, 'uncaught application errors').toEqual([]);
      expect(lifetimeReports, 'forbidden attempts or CSP violations before navigation').toEqual([]);
    };
    await use({assertClean});
    await assertClean();
  }, {auto: true}]
});
export {expect};
export async function assertNoOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

export function installBrowserGuards(options?: {mockCopy?: boolean; workers?: string[]; companion?: boolean}): void {
  const attempts: string[] = [];
  const violations: string[] = [];
  const copies: string[] = [];
  const emit = console.warn.bind(console);
  const record = (kind: 'attempt' | 'violation', value: string) => {
    (kind === 'attempt' ? attempts : violations).push(value);
    emit('__SHELL_ISOLATION__:' + JSON.stringify({kind, value}));
  };
  const blocked = (name: string) => function (..._args: unknown[]): never {
    record('attempt', name);
    throw new Error('Forbidden offline capability: ' + name);
  };
  const method = (object: object | undefined, key: string, name: string) => {
    if (!object) return;
    try { Object.defineProperty(object, key, {configurable: true, writable: true, value: blocked(name)}); } catch { record('attempt', 'guard-install:' + name); }
  };
  const getter = (object: object, key: string, name: string) => {
    try { Object.defineProperty(object, key, {configurable: true, get: blocked(name), set: blocked(name)}); } catch { record('attempt', 'guard-install:' + name); }
  };
  const nativeFetch = window.fetch.bind(window);
  for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'SharedWorker', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'BroadcastChannel', 'Audio', 'AudioContext', 'webkitAudioContext', 'open', 'showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']) method(window, key, key);
  if(options?.companion) window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const allowed = url.origin === location.origin && !url.search && !url.hash &&
      (method === 'GET' && ['/api/session', '/api/document', '/api/context'].includes(url.pathname) || method === 'POST' && url.pathname === '/api/command');
    if(!allowed) return blocked('Unauthorized companion fetch')();
    return nativeFetch(input, init);
  };
  const NativeWorker = window.Worker;
  window.Worker = new Proxy(NativeWorker, {construct(target, args) {
    const url = new URL(String(args[0]), location.href);
    if(url.origin !== location.origin || url.search || url.hash || !options?.workers?.includes(url.pathname) || args[1]?.type !== 'module') return blocked('Unauthorized Worker')();
    return Reflect.construct(target, args);
  }});
  for (const key of ['localStorage', 'sessionStorage', 'indexedDB', 'caches']) getter(window, key, key);
  getter(Document.prototype, 'cookie', 'cookie');
  for (const key of ['serviceWorker', 'mediaDevices', 'geolocation', 'storage']) getter(navigator, key, 'navigator.' + key);
  const clipboard = navigator.clipboard;
  if(clipboard) {
    const writeText = clipboard.writeText.bind(clipboard);
    Object.defineProperty(clipboard, 'writeText', {configurable: true, value: (text: string): Promise<void> => {
      if(!navigator.userActivation?.isActive) return blocked('clipboard.writeText without user activation')();
      if(typeof text !== 'string') return blocked('clipboard.writeText requires plain text')();
      copies.push(text);
      return options?.mockCopy ? Promise.resolve() : writeText(text);
    }});
    for(const key of ['read', 'readText', 'write']) method(clipboard, key, 'clipboard.' + key);
  }
  const execCommand = document.execCommand.bind(document);
  document.execCommand = (command: string, showUI?: boolean, value?: string): boolean => {
    const name = command.toLowerCase();
    if(name === 'paste' || name === 'cut') return blocked('execCommand.' + name)();
    if(name === 'copy') {
      if(!navigator.userActivation?.isActive) return blocked('execCommand.copy without user activation')();
      const active = document.activeElement;
      const text = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement
        ? active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0)
        : window.getSelection()?.toString() ?? '';
      copies.push(text);
      if(options?.mockCopy) return true;
    }
    return execCommand(command, showUI, value);
  };
  method(navigator, 'sendBeacon', 'sendBeacon');
  method(navigator, 'getUserMedia', 'getUserMedia');
  method(navigator, 'webkitGetUserMedia', 'webkitGetUserMedia');
  const originalCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object: Blob | MediaSource): string => {
    if (!(object instanceof Blob) || object.type !== 'application/json') return blocked('non-JSON object URL')();
    return originalCreate(object);
  };
  document.addEventListener('securitypolicyviolation', event => record('violation', event.violatedDirective + ':' + event.blockedURI));
  Object.defineProperty(window, '__shellIsolation', {value: () => ({attempts: [...attempts], violations: [...violations], copies: [...copies]}), writable: false});
}
