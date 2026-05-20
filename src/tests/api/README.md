# MTProto API tests (Node.js harness)

This folder contains a Vitest harness that boots the worker-side MTProto stack
in Node so you can call `apiManager.invokeApi(...)` from a test.

There is no auth flow in Node — you log in once in the browser, export the
auth keys, and feed them to the harness as a JSON seed.

## Prerequisites

1. `VITE_API_ID` / `VITE_API_HASH` in `.env.local` at the repo root
   (Vitest reads `.env*` via Vite). Without these the harness throws.

2. A seed JSON file with auth keys for the account you want to drive.

## Producing a seed

Open `https://web.telegram.org/k/?test=1` (test DC) or `https://web.telegram.org/k/`,
log in, then run this snippet in DevTools console:

```js
(async () => {
  const prefix = location.search.includes('test=1') ? 't_' : '';
  const get = (k) => { try { return JSON.parse(localStorage.getItem(prefix + k)); } catch { return localStorage.getItem(prefix + k); } };
  const acc = get('account1') || {};
  const dcId = acc.dcId;
  const authKeys = {};
  for (let i = 1; i <= 5; i++) {
    const key = acc[`dc${i}_auth_key`] || get(`dc${i}_auth_key`);
    const salt = acc[`dc${i}_server_salt`] || get(`dc${i}_server_salt`);
    if (key && salt) authKeys[i] = { key, salt };
  }
  const seed = {
    userId: Number(acc.userId),
    dcId,
    authKeys,
    timeOffset: get('server_time_offset')
  };
  console.log(JSON.stringify(seed, null, 2));
})();
```

Save the output as `tmp/seed.json` (gitignored).

## Running

```bash
TG_API_TEST=1 TG_API_SEED=./tmp/seed.json pnpm test src/tests/api
```

By default the harness flips `Modes.test = true`. To talk to production DCs
instead, also set `TG_API_PROD_DC=1` and use a production seed.

When `TG_API_TEST` is unset the api tests are skipped, so `pnpm test` keeps
working in environments without credentials.

## Writing your own test

```ts
import {createTestClient} from './harness';

const client = await createTestClient({ seed, testDc: true });
const result = await client.apiManager.invokeApi('users.getFullUser', {
  id: { _: 'inputUserSelf' }
});
```

`client.managers` is the same registry the SharedWorker hands to the UI —
use `appMessagesManager`, `appUsersManager`, etc. directly.

## How it works

- `nodeEnv.ts` — installs polyfills for `WebSocket` (via `ws`), `indexedDB`
  (via `fake-indexeddb`), `caches`, `BroadcastChannel`, `crypto.subtle`.
- `inlineCrypto.ts` — registers the same crypto methods that
  `crypto.worker.ts` uses, so MTProto crypto runs in-process instead of in a
  separate worker.
- `harness.ts` — bootstraps `AppStateManager` + `AppStoragesManager` and calls
  `createManagers(...)` directly, bypassing the SharedWorker / `apiManagerProxy`
  layers entirely.
- The `MTProtoMessagePort.postMessage` path no-ops in test mode
  (`superMessagePort.ts` already gates on `import.meta.env.MODE === 'test'`),
  so manager → main-thread mirror calls are silently dropped.

## Caveats

- `fake-indexeddb` is in-memory only; storage is reset every test run.
- File downloads, CacheStorage and BroadcastChannel are stubbed — anything
  that exercises media or cross-tab sync is out of scope.
- Crypto runs inline on the event loop, not in `worker_threads`. Heavy auth
  flows can block the main thread briefly.
