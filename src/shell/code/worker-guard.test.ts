import {afterEach, expect, test, vi} from 'vitest';
afterEach(() => {vi.unstubAllGlobals(); vi.resetModules();});
test('worker guard records and blocks transport, storage, nested workers and CSP violations', async () => {
  const postMessage = vi.fn(), addEventListener = vi.fn();
  const worker = {postMessage, addEventListener, navigator: {}} as Record<string, unknown>;
  vi.stubGlobal('self', worker);
  await import('./worker-guard');
  for(const capability of ['fetch','XMLHttpRequest','WebSocket','Worker','importScripts','BroadcastChannel']) {
    expect(() => (worker[capability] as () => unknown)()).toThrow('blocked');
    expect(postMessage).toHaveBeenLastCalledWith({kind:'isolation-violation', capability});
  }
  expect(() => worker.indexedDB).toThrow('blocked');
  expect(() => (worker.navigator as Record<string, unknown>).storage).toThrow('blocked');
  const cspListener = addEventListener.mock.calls.find(([name]) => name === 'securitypolicyviolation')![1];
  cspListener({effectiveDirective:'connect-src'});
  expect(postMessage).toHaveBeenLastCalledWith({kind:'isolation-violation', capability:'CSP:connect-src'});
});
