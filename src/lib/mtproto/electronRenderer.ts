/*
 * Renderer-side glue for the Electron shell.
 *
 * The Electron main process is the single source of truth for the network configuration
 * (persisted to userData and exposed synchronously via the preload). This module reads it,
 * forwards it into the MTProto worker (`setElectronConfig`), and keeps the worker in sync
 * when the user changes proxy settings.
 */

import type {ElectronProxyConfig} from '@lib/mtproto/electronProxyConfig';

export function getElectronApp() {
  return typeof window !== 'undefined' ? window.electronApp : undefined;
}

export function isElectron() {
  return !!getElectronApp()?.isElectron;
}

/** Detached single-chat window: the renderer was launched with ?mode=chat. */
export function isChatWindowMode() {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('mode') === 'chat';
  } catch(e) {
    return false;
  }
}

/** Add the body class that collapses the UI to a single conversation. Call before render. */
export function applyChatWindowMode() {
  if(isChatWindowMode()) {
    document.documentElement.classList.add('is-chat-window');
  }
}

let tgLinkSubscribed = false;

/**
 * Subscribe to tg:// deep links delivered by the OS (Electron only) and route each to the
 * given handler (typically appImManager.openUrl). Buffered links replay immediately.
 */
export function initTgLinks(handler: (url: string) => void) {
  const app = getElectronApp();
  if(!app?.isElectron || tgLinkSubscribed || !app.onOpenTgLink) {
    return;
  }

  tgLinkSubscribed = true;
  app.onOpenTgLink((url) => {
    try {
      handler(url);
    } catch(e) {}
  });
}

/** Open a chat in its own OS window (Electron only); resolves to false when unavailable. */
export function openChatInWindow(opts: {peerId: PeerId, threadId?: number, title?: string}) {
  const app = getElectronApp();
  if(!app?.openChatWindow) {
    return false;
  }

  app.openChatWindow({peerId: opts.peerId, threadId: opts.threadId, title: opts.title});
  return true;
}

// Renderer-local mirror of the persisted network config (the preload value is read-only).
let cachedNetworkConfig: ElectronNetworkConfig | undefined;

export function getCurrentNetworkConfig(): ElectronNetworkConfig | undefined {
  return cachedNetworkConfig || getElectronApp()?.networkConfig;
}

export function setCurrentNetworkConfig(config: ElectronNetworkConfig) {
  cachedNetworkConfig = config;
}

export function buildElectronProxyConfig(): Partial<ElectronProxyConfig> {
  const app = getElectronApp();
  if(!app?.isElectron) {
    return {isElectron: false, connection: 'websocket'};
  }

  const net = getCurrentNetworkConfig() || ({} as ElectronNetworkConfig);
  return {
    isElectron: true,
    bridgePort: app.bridgePort,
    connection: net.connection || 'websocket',
    socks5: net.socks5,
    mtproxy: net.mtproxy
  };
}

let subscribed = false;

/**
 * Push the current network config into the worker and (once) subscribe to live changes.
 * Safe to call repeatedly — the subscription is installed only the first time. The window
 * that initiates a change applies it to the (shared) worker itself; here we only keep each
 * window's local cache fresh so its settings UI reflects edits made elsewhere.
 */
export function initElectronConfig(push: (config: Partial<ElectronProxyConfig>) => void) {
  cachedNetworkConfig ||= getElectronApp()?.networkConfig;
  push(buildElectronProxyConfig());

  const app = getElectronApp();
  if(!app?.isElectron || subscribed || !app.onNetworkConfig) {
    return;
  }

  subscribed = true;
  app.onNetworkConfig((config) => {
    cachedNetworkConfig = config;
  });
}
