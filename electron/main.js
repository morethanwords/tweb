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
const {createMainWindow, createChatWindow, broadcast} = require('./windows');
const {DEFAULT_NETWORK_CONFIG} = require('./config');

const DIST_DIR = path.join(__dirname, '..', 'dist');
// Static assets Vite doesn't bundle (fonts, images, audio under assets/) live in public/
// and are served at the web root in dev — serve them as a fallback root behind dist/.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DEV_URL = process.env.TWEB_DEV_URL || ''; // e.g. http://localhost:8080
const VERSION = readVersion();

const log = (...args) => console.log('[tweb-electron]', ...args);

let staticServer = null;
let bridge = null;
let networkConfig = loadNetworkConfig();
let appOrigin = '';

// tg:// deep links — routed to the renderer (appImManager.openUrl) once a window is ready.
let mainWindow = null;
let mainWindowReady = false;
const pendingTgLinks = [];

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
    staticServer = new StaticServer([DIST_DIR, PUBLIC_DIR], log);
    appOrigin = await staticServer.start();
  }

  const ctx = {origin: appOrigin, bridgePort, version: VERSION, networkConfig};
  global.__twebCtx = ctx;

  setupMenu();
  openMainWindow();
}

// ---------- tg:// deep links ----------

function isTgLink(arg) {
  return typeof arg === 'string' && /^tg:\/\//i.test(arg);
}

function firstTgLink(argv) {
  return (argv || []).find(isTgLink);
}

function openMainWindow() {
  mainWindowReady = false;
  mainWindow = createMainWindow(global.__twebCtx);
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindowReady = true;
    flushTgLinks();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    mainWindowReady = false;
  });
  return mainWindow;
}

/** Queue a tg:// link and deliver it to the renderer (creating/raising the window). */
function handleTgLink(url) {
  if(!isTgLink(url)) return;
  pendingTgLinks.push(url);

  if(!app.isReady()) return; // boot() will create the window and flush
  if(!mainWindow || mainWindow.isDestroyed()) {
    openMainWindow();
    return;
  }
  if(mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  flushTgLinks();
}

function flushTgLinks() {
  if(!mainWindow || mainWindow.isDestroyed() || !mainWindowReady) return;
  while(pendingTgLinks.length) {
    mainWindow.webContents.send('tg-link', pendingTgLinks.shift());
  }
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

// Register as the OS handler for tg:// links. In dev (`electron electron/main.js`) the
// launcher path + script must be passed so the registration points back at this app.
if(process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('tg', process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('tg');
}

// macOS delivers tg:// links here (can fire before `ready` on cold launch).
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleTgLink(url);
});

const gotLock = app.requestSingleInstanceLock();
if(!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows/Linux deliver the tg:// link as a command-line arg to the running instance.
    const link = firstTgLink(argv);
    if(link) {
      handleTgLink(link);
    } else if(mainWindow && !mainWindow.isDestroyed()) {
      if(mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Windows/Linux cold launch via a tg:// link: it's in our own argv.
    const link = firstTgLink(process.argv);
    if(link) pendingTgLinks.push(link);
    return boot();
  }).catch((err) => {
    log('boot failed:', err);
    app.quit();
  });

  app.on('activate', () => {
    if(BrowserWindow.getAllWindows().length === 0 && global.__twebCtx) {
      openMainWindow();
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
