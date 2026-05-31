# tweb Electron shell

Packages Telegram Web K as a desktop app, and adds desktop-only networking that the
browser can't do: a **raw obfuscated TCP transport** (like the official desktop client)
as an alternative to WebSocket, plus **SOCKS5** and **MTProto-proxy** support. It also
adds **opening a chat in its own window**.

## Quick start

```bash
pnpm install                 # installs electron + electron-builder
pnpm electron                # production: builds the renderer, then launches Electron
pnpm electron:run            # launches Electron against an existing dist/ build
pnpm electron:dev            # launches against the Vite dev server (run `pnpm start` first)
pnpm electron:smoke          # headless: proves the TCP/SOCKS5 path against a real DC (no GUI)
pnpm electron:pack           # builds installers into dist-electron/ (electron-builder)
```

`pnpm electron:dev` expects a dev server at `http://localhost:8080`; override with
`TWEB_DEV_URL`.

## How it works

The renderer is served over `http://127.0.0.1:<port>` from the main process (not
`file://`), so SharedWorker / ServiceWorker / IndexedDB behave exactly as on the web.

The MTProto stack runs inside a SharedWorker, which has no Node access and cannot open raw
sockets. So instead of rewriting the worker, the main process runs a **local
WebSocket→TCP bridge**:

```
SharedWorker (MTProto: obfuscation + codec)
      │  ws://127.0.0.1:<bridgePort>   (browser WebSocket — never leaves the machine)
      ▼
Electron main process  ──►  raw obfuscated TCP  ──►  Telegram DC
   (optionally via SOCKS5, or aimed at an MTProto proxy)
```

The byte stream the worker sends is already AES-CTR-obfuscated, so the bridge is a dumb
pipe — it never inspects or reframes payloads. The *wire* protocol reaching Telegram is
genuine raw obfuscated TCP, identical to what tdesktop sends. The WebSocket hop is purely
a local IPC mechanism to get bytes from the sandboxed worker to Node.

Because raw TCP delivers arbitrary chunk boundaries (and the bytes are encrypted, so the
bridge can't see packet lengths), the worker's receive path (`TcpObfuscated`, stream mode)
buffers the decrypted stream and reframes it into MTProto packets by length — the same
thing a native TCP client does.

### MTProxy

MTProxy uses the same obfuscated transport with two additions, both done in the worker's
`Obfuscation` (so no MTProto crypto lives in the main process):

- the AES keys are derived as `SHA256(handshake_slice ++ secret)`;
- the target DC id is embedded in the handshake (int16 LE, test-shifted, media-negated).

Secret formats: a 16-byte hex/base64url secret → abridged framing; a `dd…` secret →
padded framing. `ee…` (fake-TLS) secrets are parsed but the fake-TLS wrapper is **not**
implemented, so those proxies won't connect — use a plain or `dd` secret.

### SOCKS5

Implemented in `socks5.js` (RFC 1928 + 1929 username/password auth). It tunnels the raw
TCP connection to the DC; obfuscation is unchanged. SOCKS5 and MTProxy are mutually
exclusive, mirroring the official clients.

## tg:// deep links

The app registers as the OS handler for the `tg://` scheme (`app.setAsDefaultProtocolClient`
+ electron-builder `protocols`). A `tg://` link opened anywhere — browser, another app —
launches/raises the app and routes the URL to `appImManager.openUrl()`, the same internal
handler tweb already uses for `tg://`/`t.me` links inside messages (resolve, join,
privatepost, addstickers, …). Cold-launch links are buffered (macOS `open-url`, Windows/Linux
argv) until the renderer is ready. Links *inside* messages stay fully in-app and never round-trip
through the OS.

## Configuring the connection

In-app: hamburger menu → **Connection** (visible only under Electron). Choose WebSocket
(default), TCP (direct), SOCKS5, or MTProxy, fill in the proxy details, and Save — the
connection switches live (no restart). The choice is persisted by the main process in
`<userData>/network-config.json` and pushed into the worker before it connects.

## Files

| File | Role |
|---|---|
| `main.js` | App lifecycle, IPC, wires the static server + bridge + windows |
| `preload.js` | Exposes `window.electronApp` and `window.electronHelpers` to the renderer |
| `windows.js` | Main window + detached single-chat windows (`?mode=chat`) |
| `staticServer.js` | Serves the built renderer over loopback HTTP (Range-capable) |
| `wsTcpBridge.js` | Local WebSocket→TCP bridge (direct / SOCKS5 / MTProxy) |
| `socks5.js` | SOCKS5 CONNECT client |
| `config.js` | Telegram DC IPs/ports, default network config |
| `test/bridgeSmoke.js` | Headless end-to-end proof of the TCP + SOCKS5 path |

## Security notes

- `contextIsolation: true`, `nodeIntegration: false`; the preload exposes a small, audited
  surface only.
- External links always open in the OS browser; cross-origin navigation is blocked.
- The bridge and static server bind to `127.0.0.1` only.
