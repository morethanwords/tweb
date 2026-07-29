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
  // Custom globally configured DC options
  readonly VITE_DC_HOST?: string;
  readonly VITE_DC_PORT?: string;
  readonly VITE_BASE_DC_ID?: string;
  // Custom globally configured hosts
  readonly VITE_ALLOWED_HOSTS?: string;
  readonly VITE_APP_ORIGIN?: string;
  // RSA public key configurations for production and test environments
  readonly VITE_RSA_MODULUS?: string;
  readonly VITE_RSA_EXPONENT?: string;
  readonly VITE_RSA_TEST_MODULUS?: string;
  readonly VITE_RSA_TEST_EXPONENT?: string;
  // Custom app properties
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_PROTOCOL?: string;
  readonly VITE_SHORT_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
