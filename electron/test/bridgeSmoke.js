/*
 * Headless end-to-end smoke test for the WebSocket->TCP bridge.
 *
 * Reproduces, in plain Node, exactly what the MTProto worker does: build the obfuscated2
 * 64-byte handshake, frame a `req_pq_multi` with the abridged codec, obfuscate it, push it
 * through the local bridge, and verify Telegram answers with `resPQ`. A success proves the
 * whole raw-TCP path: WS hop -> bridge -> TCP -> DC, AES-CTR obfuscation, abridged framing,
 * and the stream reframer (we reframe the reply the same way the worker does).
 *
 * Also stands up a throwaway local SOCKS5 server and repeats the test through it to prove
 * electron/socks5.js. No GUI, no Electron binary required.
 *
 * Run: node electron/test/bridgeSmoke.js
 */

const crypto = require('crypto');
const net = require('net');
const {WsTcpBridge} = require('../wsTcpBridge');

const RESPQ_CONSTRUCTOR = 0x05162463;

// ---------- obfuscation (mirror of src/lib/mtproto/transports/obfuscation.ts) ----------

function buildHandshake() {
  let payload;
  while(true) {
    payload = crypto.randomBytes(64);
    const val = payload.readUInt32LE(0);
    const val2 = payload.readUInt32LE(4);
    if(payload[0] !== 0xef &&
      val !== 0x44414548 && val !== 0x54534f50 && val !== 0x20544547 &&
      val !== 0x4954504f && val !== 0xeeeeeeee && val !== 0xdddddddd &&
      val2 !== 0x00000000) break;
  }

  const reversed = Buffer.from(payload).reverse();
  const encKey = payload.subarray(8, 40);
  const encIv = payload.subarray(40, 56);
  const decKey = reversed.subarray(8, 40);
  const decIv = reversed.subarray(40, 56);

  // Abridged tag.
  payload[56] = payload[57] = payload[58] = payload[59] = 0xef;

  const sendCipher = crypto.createCipheriv('aes-256-ctr', encKey, encIv);
  const recvCipher = crypto.createCipheriv('aes-256-ctr', decKey, decIv);

  const encrypted = sendCipher.update(payload); // advances send CTR by 64
  const wire = Buffer.concat([payload.subarray(0, 56), encrypted.subarray(56, 64)]);

  return {wire, sendCipher, recvCipher};
}

// ---------- abridged codec ----------

function abridgedEncode(body) {
  const len = body.length >> 2;
  let header;
  if(len < 127) header = Buffer.from([len]);
  else header = Buffer.from([0x7f, len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff]);
  return Buffer.concat([header, body]);
}

function abridgedPacketLength(data) {
  if(data.length < 1) return -1;
  const first = data[0];
  if(first < 127) return 1 + (first << 2);
  if(data.length < 4) return -1;
  const words = data[1] | (data[2] << 8) | (data[3] << 16);
  return 4 + (words << 2);
}

function abridgedReadPacket(data) {
  if(data[0] >= 127) return data.subarray(4);
  return data.subarray(1);
}

// ---------- MTProto unencrypted req_pq_multi ----------

function buildReqPqMulti() {
  const nonce = crypto.randomBytes(16);
  const body = Buffer.alloc(4 + 16);
  body.writeUInt32LE(0xbe7e8ef1, 0); // req_pq_multi#be7e8ef1
  nonce.copy(body, 4);

  const msg = Buffer.alloc(8 + 8 + 4 + body.length);
  // auth_key_id = 0 (unencrypted)
  const msgId = (BigInt(Math.floor(Date.now() / 1000)) << 32n) & ~3n;
  msg.writeBigUInt64LE(msgId, 8);
  msg.writeUInt32LE(body.length, 16);
  body.copy(msg, 20);
  return {msg, nonce};
}

// ---------- one attempt over the bridge ----------

function attempt(bridgePort, query) {
  return new Promise((resolve, reject) => {
    const {wire, sendCipher, recvCipher} = buildHandshake();
    const {msg, nonce} = buildReqPqMulti();

    const url = `ws://127.0.0.1:${bridgePort}/apiws?${query}`;
    const ws = new WebSocket(url, ['binary']);
    ws.binaryType = 'arraybuffer';

    let recvBuffer = Buffer.alloc(0);
    let done = false;
    const finish = (err, ok) => {
      if(done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch(e) {}
      err ? reject(err) : resolve(ok);
    };
    const timer = setTimeout(() => finish(new Error('timeout waiting for resPQ')), 12000);

    ws.onopen = () => {
      ws.send(wire);
      ws.send(sendCipher.update(abridgedEncode(msg)));
    };
    ws.onerror = (e) => finish(new Error('ws error: ' + (e.message || e.type || 'unknown')));
    ws.onclose = () => finish(new Error('ws closed before resPQ'));
    ws.onmessage = (event) => {
      const chunk = Buffer.from(recvCipher.update(Buffer.from(event.data)));
      recvBuffer = Buffer.concat([recvBuffer, chunk]);

      while(recvBuffer.length) {
        const total = abridgedPacketLength(recvBuffer);
        if(total < 0 || recvBuffer.length < total) break;
        const packet = abridgedReadPacket(recvBuffer.subarray(0, total));
        recvBuffer = recvBuffer.subarray(total);

        // packet = auth_key_id(8) + msg_id(8) + len(4) + resPQ
        if(packet.length >= 24) {
          const constructor = packet.readUInt32LE(20);
          if(constructor === RESPQ_CONSTRUCTOR) {
            const echoed = packet.subarray(24, 40);
            if(Buffer.compare(echoed, nonce) === 0) return finish(null, {matchedNonce: true});
            return finish(null, {matchedNonce: false});
          }
          return finish(new Error('unexpected constructor 0x' + constructor.toString(16)));
        }
      }
    };
  });
}

// ---------- minimal local SOCKS5 server (CONNECT only) ----------

function startLocalSocks5() {
  return new Promise((resolve) => {
    const server = net.createServer((client) => {
      let stage = 'greet';
      client.once('data', (greeting) => {
        // reply: no-auth
        client.write(Buffer.from([0x05, 0x00]));
        client.once('data', (req) => {
          // parse CONNECT target
          const atyp = req[3];
          let host;
          let off = 4;
          if(atyp === 0x01) {
            host = `${req[4]}.${req[5]}.${req[6]}.${req[7]}`;
            off = 8;
          } else if(atyp === 0x03) {
            const l = req[4];
            host = req.subarray(5, 5 + l).toString();
            off = 5 + l;
          } else {
            client.end();
            return;
          }
          const port = req.readUInt16BE(off);
          const upstream = net.connect({host, port}, () => {
            // success reply (BND.ADDR 0.0.0.0:0)
            client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            client.pipe(upstream);
            upstream.pipe(client);
          });
          upstream.on('error', () => client.end());
          client.on('error', () => upstream.destroy());
        });
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({server, port: server.address().port}));
  });
}

// ---------- runner ----------

async function main() {
  let failures = 0;
  let config = {connection: 'tcp', socks5: {}, mtproxy: {}};
  const bridge = new WsTcpBridge(() => config, (...a) => console.log('  [bridge]', ...a));
  const bridgePort = await bridge.start();

  // 1) direct raw TCP to a production DC
  try {
    console.log('\n[1] direct raw TCP -> DC2 (production, port 443)');
    config = {connection: 'tcp', socks5: {}, mtproxy: {}};
    const res = await attempt(bridgePort, 'dc=2&test=0&type=client');
    console.log('    ✓ got resPQ; nonce echoed:', res.matchedNonce);
    if(!res.matchedNonce) failures++;
  } catch(err) {
    failures++;
    console.log('    ✗ FAILED:', err.message);
  }

  // 2) raw TCP through a local SOCKS5 proxy
  let socks;
  try {
    console.log('\n[2] raw TCP -> DC2 through local SOCKS5');
    socks = await startLocalSocks5();
    config = {connection: 'socks5', socks5: {host: '127.0.0.1', port: socks.port}, mtproxy: {}};
    const res = await attempt(bridgePort, 'dc=2&test=0&type=client');
    console.log('    ✓ got resPQ via SOCKS5; nonce echoed:', res.matchedNonce);
    if(!res.matchedNonce) failures++;
  } catch(err) {
    failures++;
    console.log('    ✗ FAILED:', err.message);
  } finally {
    socks && socks.server.close();
  }

  bridge.close();
  console.log('\n' + (failures ? `FAILED (${failures})` : 'ALL PASSED'));
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('smoke runner crashed:', err);
  process.exit(1);
});
