import '../lib/polyfill';
// Exercise the real DC selector, HTTP transport, socket and reconnect code.
jest.mock('../config/app', () => ({__esModule: true, default: {suffix: 'K', baseDcId: 2}}));
jest.mock('../lib/mtproto/transports/controller', () => ({__esModule: true, default: {
  setTransportOpened: jest.fn(), setTransportClosed: jest.fn(), setTransportValue: jest.fn()
}}));
jest.mock('../lib/mtproto/transports/obfuscation', () => ({__esModule: true, default: class {}}));

describe('MTProto relay transport integration', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env.VITE_MTPROTO_RELAY_PATH = '/mtproto';
  });
  afterEach(() => {
    delete process.env.VITE_MTPROTO_RELAY_PATH;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('socket disconnect and transport fallback never dial Telegram directly', async() => {
    const sockets: Array<{url: string, listeners: Record<string, Function>}> = [];
    const OriginalWebSocket = self.WebSocket;
    const originalFetch = self.fetch;
    self.WebSocket = class {
      listeners: Record<string, Function> = {};
      constructor(public url: string) { sockets.push(this); }
      addEventListener(name: string, fn: Function) { this.listeners[name] = fn; }
      removeEventListener(name: string) { delete this.listeners[name]; }
      close() {}
    } as any;
    try {
      const {DcConfigurator} = require('../lib/mtproto/dcConfigurator');
      const dc = new DcConfigurator();
      const tcp = dc.chooseServer(2, 'download', 'websocket');
      expect(sockets[0].url).toBe('ws://localhost/mtproto/kws2-1/apiws');
      sockets[0].listeners.close();
      jest.runOnlyPendingTimers();
      expect(sockets).toHaveLength(2);
      expect(sockets[1].url).toBe(sockets[0].url);
      tcp.destroy();
      const http = dc.chooseServer(2, 'upload', 'https');
      self.fetch = jest.fn().mockRejectedValue(new Error('Relay unavailable'));
      await expect(http._send(new Uint8Array([1, 2]))).rejects.toThrow('Relay unavailable');
      expect(self.fetch).toHaveBeenCalledWith('http://localhost/mtproto/venus-1/apiw1', expect.objectContaining({method: 'POST'}));
      expect(self.fetch).toHaveBeenCalledTimes(1);
    } finally {
      self.WebSocket = OriginalWebSocket;
      self.fetch = originalFetch;
    }
  });

  test('disabled relay preserves the DC selector original HTTPS URL', async() => {
    delete process.env.VITE_MTPROTO_RELAY_PATH;
    const originalFetch = self.fetch;
    self.fetch = jest.fn().mockRejectedValue(new Error('Test stop'));
    try {
      const {DcConfigurator} = require('../lib/mtproto/dcConfigurator');
      const http = new DcConfigurator().chooseServer(3, 'download', 'https');
      await expect(http._send(new Uint8Array([1]))).rejects.toThrow('Test stop');
      expect(self.fetch).toHaveBeenCalledWith('https://aurora-1.web.telegram.org/apiw1', expect.objectContaining({method: 'POST'}));
    } finally {
      self.fetch = originalFetch;
    }
  });
});
