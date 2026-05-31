/*
 * Minimal SOCKS5 client (RFC 1928 + RFC 1929 username/password auth).
 *
 * socks5Connect() opens a TCP connection to the SOCKS5 server, negotiates a CONNECT
 * to the target host:port, and resolves with a connected, ready-to-use net.Socket
 * positioned right after the SOCKS reply — i.e. a transparent byte pipe to the target.
 */

const net = require('net');

const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;

function isIPv4(host) {
  return net.isIPv4(host);
}
function isIPv6(host) {
  return net.isIPv6(host);
}

function buildAddress(host, port) {
  let head;
  let addr;
  if(isIPv4(host)) {
    head = Buffer.from([ATYP_IPV4]);
    addr = Buffer.from(host.split('.').map((n) => parseInt(n, 10)));
  } else if(isIPv6(host)) {
    head = Buffer.from([ATYP_IPV6]);
    // Expand to 16 bytes.
    const words = expandIPv6(host);
    addr = Buffer.alloc(16);
    for(let i = 0; i < 8; ++i) addr.writeUInt16BE(words[i], i * 2);
  } else {
    const domain = Buffer.from(host, 'utf8');
    head = Buffer.from([ATYP_DOMAIN, domain.length]);
    addr = domain;
  }
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port, 0);
  return Buffer.concat([head, addr, portBuf]);
}

function expandIPv6(host) {
  // Handle :: compression; ignore embedded IPv4 form for brevity (DC addrs are pure v6).
  const halves = host.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] !== undefined ? (halves[1] ? halves[1].split(':') : []) : [];
  const missing = 8 - left.length - right.length;
  const words = [
    ...left,
    ...Array(halves.length > 1 ? Math.max(missing, 0) : 0).fill('0'),
    ...right
  ].map((w) => parseInt(w || '0', 16));
  while(words.length < 8) words.push(0);
  return words.slice(0, 8);
}

/**
 * @param {{host:string, port:number, username?:string, password?:string}} proxy
 * @param {string} targetHost
 * @param {number} targetPort
 * @returns {Promise<net.Socket>}
 */
function socks5Connect(proxy, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({host: proxy.host, port: proxy.port});
    let stage = 'greeting';
    let settled = false;

    const fail = (err) => {
      if(settled) return;
      settled = true;
      socket.destroy();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onData = (data) => {
      try {
        if(stage === 'greeting') {
          if(data.length < 2 || data[0] !== 0x05) return fail('SOCKS5: bad greeting reply');
          const method = data[1];
          if(method === 0x00) {
            stage = 'request';
            sendRequest();
          } else if(method === 0x02) {
            stage = 'auth';
            sendAuth();
          } else if(method === 0xFF) {
            return fail('SOCKS5: no acceptable auth method (server rejected)');
          } else {
            return fail('SOCKS5: unsupported auth method ' + method);
          }
        } else if(stage === 'auth') {
          if(data.length < 2 || data[1] !== 0x00) return fail('SOCKS5: authentication failed');
          stage = 'request';
          sendRequest();
        } else if(stage === 'request') {
          if(data.length < 2 || data[0] !== 0x05) return fail('SOCKS5: bad CONNECT reply');
          const rep = data[1];
          if(rep !== 0x00) return fail('SOCKS5: CONNECT failed (code ' + rep + ')');
          // Consume the bound-address tail of the reply, then hand over a clean pipe.
          const consumed = replyLength(data);
          if(consumed < 0 || data.length < consumed) return fail('SOCKS5: short CONNECT reply');
          settled = true;
          socket.removeListener('data', onData);
          const leftover = data.subarray(consumed);
          if(leftover.length) socket.unshift(leftover);
          resolve(socket);
        }
      } catch(err) {
        fail(err);
      }
    };

    const sendGreeting = () => {
      const methods = (proxy.username || proxy.password) ? [0x00, 0x02] : [0x00];
      socket.write(Buffer.from([0x05, methods.length, ...methods]));
    };
    const sendAuth = () => {
      const u = Buffer.from(proxy.username || '', 'utf8');
      const p = Buffer.from(proxy.password || '', 'utf8');
      socket.write(Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]));
    };
    const sendRequest = () => {
      // VER=5, CMD=CONNECT(1), RSV=0
      socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), buildAddress(targetHost, targetPort)]));
    };

    socket.on('connect', sendGreeting);
    socket.on('data', onData);
    socket.on('error', fail);
    socket.on('close', () => fail('SOCKS5: connection closed during handshake'));
    socket.setTimeout(15000, () => fail('SOCKS5: handshake timeout'));
    socket.once('data', () => socket.setTimeout(0));
  });
}

// Length of a SOCKS5 reply given its ATYP, so we know where the tunneled stream begins.
function replyLength(data) {
  const atyp = data[3];
  if(atyp === ATYP_IPV4) return 4 + 4 + 2;
  if(atyp === ATYP_IPV6) return 4 + 16 + 2;
  if(atyp === ATYP_DOMAIN) return 4 + 1 + data[4] + 2;
  return -1;
}

module.exports = {socks5Connect};
