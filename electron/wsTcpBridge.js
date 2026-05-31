/*
 * Local WebSocket -> raw-TCP bridge for the Electron shell.
 *
 * The MTProto stack runs in a SharedWorker with no Node access, so it cannot open raw
 * sockets. Instead it keeps using a browser WebSocket, pointed at this server on
 * 127.0.0.1. For each WS connection we open a raw TCP socket to the target Telegram DC
 * (optionally tunneled through SOCKS5, or aimed at an MTProto proxy) and pipe bytes
 * verbatim in both directions. The WS hop never leaves the machine — the wire protocol
 * to Telegram is genuine raw obfuscated TCP.
 *
 * The byte stream is AES-CTR-obfuscated by the worker, so this bridge is intentionally
 * dumb: it never inspects, frames, or reorders payloads. Packet reframing of the TCP
 * stream happens back in the worker (see TcpObfuscated stream mode).
 */

const http = require('http');
const net = require('net');
const {WebSocketServer} = require('ws');
const {dcIp, DC_PORT} = require('./config');
const {socks5Connect} = require('./socks5');

class WsTcpBridge {
  /**
   * @param {() => {connection:string, socks5:object, mtproxy:object}} getConfig
   * @param {(...args:any[]) => void} [log]
   */
  constructor(getConfig, log) {
    this.getConfig = getConfig;
    this.log = log || (() => {});
    this.port = 0;
    this._server = null;
    this._wss = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      const server = this._server = http.createServer();
      const wss = this._wss = new WebSocketServer({
        server,
        // Telegram's WS uses the 'binary' subprotocol; echo it back so the browser is happy.
        handleProtocols: (protocols) => (protocols.has('binary') ? 'binary' : false),
        perMessageDeflate: false,
        maxPayload: 16 * 1024 * 1024
      });

      wss.on('connection', (ws, req) => this._onConnection(ws, req));
      server.on('error', reject);
      // Bind to loopback only, on a random free port.
      server.listen(0, '127.0.0.1', () => {
        this.port = server.address().port;
        this.log('ws-tcp bridge listening on', this.port);
        resolve(this.port);
      });
    });
  }

  close() {
    try {
      this._wss && this._wss.close();
    } catch(e) {}
    try {
      this._server && this._server.close();
    } catch(e) {}
  }

  _resolveTarget(query) {
    const dcId = Math.abs(parseInt(query.get('dc'), 10) || 2);
    const test = query.get('test') === '1';
    const ipv6 = query.get('ipv6') === '1';
    const cfg = this.getConfig() || {};
    const connection = cfg.connection || 'tcp';

    if(connection === 'mtproxy') {
      const mt = cfg.mtproxy || {};
      if(!mt.host || !mt.port) throw new Error('MTProxy host/port not configured');
      return {host: mt.host, port: +mt.port, socks: null, label: 'mtproxy ' + mt.host};
    }

    const host = dcIp(dcId, test, ipv6);
    const port = DC_PORT;
    if(connection === 'socks5') {
      const s = cfg.socks5 || {};
      if(!s.host || !s.port) throw new Error('SOCKS5 host/port not configured');
      return {host, port, socks: s, label: 'socks5->' + host};
    }

    // 'tcp' (direct) or anything else => direct raw TCP to the DC.
    return {host, port, socks: null, label: 'tcp ' + host};
  }

  async _onConnection(ws, req) {
    let target;
    try {
      const query = new URL(req.url, 'http://localhost').searchParams;
      target = this._resolveTarget(query);
    } catch(err) {
      this.log('bridge target error:', err.message);
      try {
        ws.close();
      } catch(e) {}
      return;
    }

    let tcp = null;
    let tcpReady = false;
    let closed = false;
    const outbound = []; // WS -> TCP bytes buffered until the socket is connected

    const cleanup = () => {
      if(closed) return;
      closed = true;
      try {
        ws.close();
      } catch(e) {}
      try {
        tcp && tcp.destroy();
      } catch(e) {}
    };

    // WS -> TCP (buffer until connected).
    ws.on('message', (data, isBinary) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if(tcpReady && tcp) {
        tcp.write(buf);
      } else {
        outbound.push(buf);
      }
    });
    ws.on('close', cleanup);
    ws.on('error', cleanup);

    try {
      tcp = target.socks ?
        await socks5Connect(target.socks, target.host, target.port) :
        await connectTcp(target.host, target.port);
    } catch(err) {
      this.log('bridge connect failed (' + target.label + '):', err.message);
      cleanup();
      return;
    }

    if(closed) {
      try {
        tcp.destroy();
      } catch(e) {}
      return;
    }

    this.log('bridge connected:', target.label);
    tcp.setNoDelay(true);

    // TCP -> WS (raw chunks; the worker reframes by MTProto packet length).
    tcp.on('data', (chunk) => {
      if(ws.readyState === ws.OPEN) ws.send(chunk, {binary: true});
    });
    tcp.on('close', cleanup);
    tcp.on('error', cleanup);

    // Flush anything the worker sent before the socket was ready (e.g. the obf init packet).
    tcpReady = true;
    for(const buf of outbound) tcp.write(buf);
    outbound.length = 0;
  }
}

function connectTcp(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({host, port});
    const onError = (err) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(15000, () => onError(new Error('TCP connect timeout')));
    socket.once('connect', () => {
      socket.setTimeout(0);
      socket.removeListener('error', onError);
      resolve(socket);
    });
    socket.once('error', onError);
  });
}

module.exports = {WsTcpBridge};
