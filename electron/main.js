/*
 * tweb Electron — main process entry.
 *
 * Boot sequence:
 *   1. start the local WebSocket->TCP bridge (raw obfuscated TCP / SOCKS5 / MTProxy)
 *   2. serve the built renderer over http://127.0.0.1 (dev: use the Vite dev server)
 *   3. open the main window, passing the bridge port + origin to the preload
 */

const path = require('path');
const fs = require('fs');
const {app, BrowserWindow, ipcMain, shell, Menu} = require('electron');
const {StaticServer} = require('./staticServer');
const {WsTcpBridge} = require('./wsTcpBridge');
const {createMainWindow, createChatWindow, broadcast, allWindows} = require('./windows');
const {DEFAULT_NETWORK_CONFIG} = require('./config');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.TWEB_DEV_URL || ''; // e.g. http://localhost:8080
const VERSION = readVersion();

const log = (...args) => console.log('[tweb-electron]', ...args);

let staticServer = null;
let bridge = null;
let networkConfig = loadNetworkConfig();
let appOrigin = '';

// ---------- network config persistence ----------

function configPath() {
  return path.join(app.getPath('userData'), 'network-config.json');
}

function loadNetworkConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    return normalizeConfig(JSON.parse(raw));
  } catch(e) {
    return {...DEFAULT_NETWORK_CONFIG};
  }
}

function normalizeConfig(cfg) {
  cfg = cfg || {};
  return {
    connection: ['websocket', 'tcp', 'socks5', 'mtproxy'].includes(cfg.connection) ? cfg.connection : 'websocket',
    socks5: {...DEFAULT_NETWORK_CONFIG.socks5, ...(cfg.socks5 || {})},
    mtproxy: {...DEFAULT_NETWORK_CONFIG.mtproxy, ...(cfg.mtproxy || {})}
  };
}

function saveNetworkConfig() {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(networkConfig, null, 2));
  } catch(e) {
    log('failed to persist network config:', e.message);
  }
}

// ---------- boot ----------

function readVersion() {
  try {
    return require('../package.json').version;
  } catch(e) {
    return '0.0.0';
  }
}

async function boot() {
  bridge = new WsTcpBridge(() => networkConfig, log);
  const bridgePort = await bridge.start();

  if(DEV_URL) {
    appOrigin = DEV_URL;
    log('using dev renderer at', appOrigin);
  } else {
    staticServer = new StaticServer(DIST_DIR, log);
    appOrigin = await staticServer.start();
  }

  const ctx = {origin: appOrigin, bridgePort, version: VERSION, networkConfig};
  global.__twebCtx = ctx;

  setupMenu();
  createMainWindow(ctx);
}

// ---------- IPC ----------

ipcMain.handle('network:get-config', () => networkConfig);

ipcMain.handle('network:set-config', (_event, cfg) => {
  networkConfig = normalizeConfig(cfg);
  if(global.__twebCtx) global.__twebCtx.networkConfig = networkConfig;
  saveNetworkConfig();
  log('network config updated:', networkConfig.connection);
  broadcast('network:config', networkConfig);
  return networkConfig;
});

ipcMain.on('shell:open-external', (_event, url) => {
  if(typeof url === 'string' && /^(https?|tg|mailto|tel):/i.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.on('window:open-chat', (_event, opts) => {
  if(!opts || (opts.peerId === undefined || opts.peerId === null)) return;
  createChatWindow(global.__twebCtx, opts);
});

ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if(!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

// ---------- menu (minimal, mostly for shortcuts) ----------

function setupMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{role: 'appMenu'}] : []),
    {role: 'fileMenu'},
    {role: 'editMenu'},
    {role: 'viewMenu'},
    {role: 'windowMenu'}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- lifecycle ----------

const gotLock = app.requestSingleInstanceLock();
if(!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = allWindows.values().next().value;
    if(win) {
      if(win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(boot).catch((err) => {
    log('boot failed:', err);
    app.quit();
  });

  app.on('activate', () => {
    if(BrowserWindow.getAllWindows().length === 0 && global.__twebCtx) {
      createMainWindow(global.__twebCtx);
    }
  });
}

app.on('window-all-closed', () => {
  if(process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  bridge && bridge.close();
  staticServer && staticServer.close();
});
