/* eslint-disable spaced-comment */
/// <reference types="vite/client" />
/// <reference types="vitest" />

interface ImportMetaEnv {
  readonly VITE_API_ID: string;
  readonly VITE_API_HASH: string;
  readonly VITE_VERSION: string;
  readonly VITE_VERSION_FULL: string;
  readonly VITE_BUILD: string;
  readonly VITE_MTPROTO_WORKER: string;
  readonly VITE_MTPROTO_SW: string;
  readonly VITE_MTPROTO_HTTP: string;
  readonly VITE_MTPROTO_HTTP_UPLOAD: string;
  readonly VITE_MTPROTO_AUTO: string;
  readonly VITE_MTPROTO_HAS_HTTP: string;
  readonly VITE_MTPROTO_HAS_WS: string;
  readonly VITE_SAFARI_PROXY_WEBSOCKET: string;
  // injected via `define` by vite.preview.config.ts; absent in every other build
  readonly VITE_PREVIEW?: boolean;
  // injected via `define` by vite.preview.config.ts when start-preview.sh is
  // invoked with --no-worker; Modes.noWorker honours it without ?noWorker=1.
  readonly VITE_NO_WORKER?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
