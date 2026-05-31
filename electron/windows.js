/*
 * BrowserWindow management: the main app window and per-chat detached windows.
 */

const path = require('path');
const {BrowserWindow, shell} = require('electron');

const PRELOAD = path.join(__dirname, 'preload.js');

/** @type {Set<BrowserWindow>} */
const allWindows = new Set();

function buildPreloadArg(ctx) {
  // Synchronously available to the preload via process.argv before the renderer runs.
  return '--tweb-config=' + Buffer.from(JSON.stringify({
    bridgePort: ctx.bridgePort,
    origin: ctx.origin,
    platform: process.platform,
    version: ctx.version,
    networkConfig: ctx.networkConfig,
    isElectron: true
  })).toString('base64');
}

function baseWebPreferences(ctx) {
  return {
    preload: PRELOAD,
    additionalArguments: [buildPreloadArg(ctx)],
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false, // preload needs ipcRenderer; we keep it minimal instead
    spellcheck: true,
    backgroundThrottling: false
  };
}

function wireWindow(win) {
  allWindows.add(win);
  win.on('closed', () => allWindows.delete(win));

  // External links open in the OS browser, never in-app.
  win.webContents.setWindowOpenHandler(({url}) => {
    if(/^https?:\/\//.test(url) || /^(tg|mailto|tel):/.test(url)) {
      shell.openExternal(url);
    }
    return {action: 'deny'};
  });

  // Block in-app navigation away from our origin (defense in depth).
  win.webContents.on('will-navigate', (event, url) => {
    try {
      const u = new URL(url);
      const here = new URL(win.webContents.getURL());
      if(u.origin !== here.origin) {
        event.preventDefault();
        if(/^https?:$/.test(u.protocol)) shell.openExternal(url);
      }
    } catch(e) {}
  });
}

/**
 * @param {{origin:string, bridgePort:number, version:string, query?:string}} ctx
 */
function createMainWindow(ctx) {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 380,
    minHeight: 480,
    title: 'Telegram',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: baseWebPreferences(ctx)
  });

  wireWindow(win);
  win.loadURL(ctx.origin + '/' + (ctx.query || ''));
  return win;
}

/**
 * A detached single-chat window. `peerId`/`threadId` drive the existing hash deep-link,
 * and `mode=chat` makes the renderer hide the chat list and show only the conversation.
 * @param {{origin:string, bridgePort:number, version:string}} ctx
 * @param {{peerId:string|number, threadId?:number, title?:string}} opts
 */
function createChatWindow(ctx, opts) {
  const peer = String(opts.peerId);
  const params = new URLSearchParams();
  params.set('p', peer);
  if(opts.threadId) params.set('thread', String(opts.threadId));

  const win = new BrowserWindow({
    width: 720,
    height: 800,
    minWidth: 360,
    minHeight: 480,
    title: opts.title || 'Telegram',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: baseWebPreferences(ctx)
  });

  wireWindow(win);
  // ?mode=chat is read on boot to enter single-chat layout; the hash opens the peer.
  win.loadURL(`${ctx.origin}/?mode=chat#/im?${params.toString()}`);
  return win;
}

function broadcast(channel, payload) {
  for(const win of allWindows) {
    if(!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

module.exports = {createMainWindow, createChatWindow, broadcast, allWindows};
