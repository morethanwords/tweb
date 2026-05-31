/*
 * Preload bridge. Runs with Node access in an isolated world and exposes a tiny,
 * audited surface to the renderer via contextBridge.
 *
 * Two globals are exposed:
 *   - window.electronApp      : full shell API (config, proxy settings, chat windows)
 *   - window.electronHelpers  : { openExternal } — the minimal shape tweb already
 *                               expects (see src/lib/richTextProcessor/wrapRichText.ts)
 */

const {contextBridge, ipcRenderer, shell} = require('electron');

function readConfig() {
  const arg = process.argv.find((a) => a.startsWith('--tweb-config='));
  if(!arg) return {isElectron: true};
  try {
    return JSON.parse(Buffer.from(arg.slice('--tweb-config='.length), 'base64').toString('utf8'));
  } catch(e) {
    return {isElectron: true};
  }
}

const config = readConfig();

const SAFE_EXTERNAL = /^(https?|tg|mailto|tel):/i;
function openExternal(url) {
  if(typeof url === 'string' && SAFE_EXTERNAL.test(url)) {
    ipcRenderer.send('shell:open-external', url);
  }
}

const api = {
  isElectron: true,
  platform: config.platform,
  version: config.version,
  bridgePort: config.bridgePort,
  origin: config.origin,
  // Initial snapshot of the persisted proxy/transport config (kept in sync via onNetworkConfig).
  networkConfig: config.networkConfig,

  openExternal,

  // Proxy / transport settings (mirrored into the main process for the TCP bridge).
  getNetworkConfig: () => ipcRenderer.invoke('network:get-config'),
  setNetworkConfig: (cfg) => ipcRenderer.invoke('network:set-config', cfg),
  onNetworkConfig: (cb) => {
    const handler = (_e, cfg) => cb(cfg);
    ipcRenderer.on('network:config', handler);
    return () => ipcRenderer.removeListener('network:config', handler);
  },

  // Open a chat in its own window.
  openChatWindow: (opts) => ipcRenderer.send('window:open-chat', opts),

  // Window controls (used by a custom titlebar if desired).
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close')
};

contextBridge.exposeInMainWorld('electronApp', api);
contextBridge.exposeInMainWorld('electronHelpers', {openExternal});
