/*
 * Shared constants for the tweb Electron shell.
 *
 * Lives in the main process (CommonJS). Telegram data-center IP addresses are the
 * well-known bootstrap addresses also baked into the official clients; the raw-TCP
 * transport needs IPs (there is no DNS-name routing like the WebSocket subdomains).
 */

// Telegram production / test data centers. TCP MTProto is served on 443/80/5222 — we use 443.
const DC_IP = {
  prod: {
    1: '149.154.175.50',
    2: '149.154.167.50',
    3: '149.154.175.100',
    4: '149.154.167.91',
    5: '149.154.171.5'
  },
  test: {
    1: '149.154.175.10',
    2: '149.154.167.40',
    3: '149.154.175.117'
  }
};

const DC_PORT = 443;

// IPv6 fallbacks (same DCs). Unused by default but handy if a network is v6-only.
const DC_IPV6 = {
  prod: {
    1: '2001:b28:f23d:f001::a',
    2: '2001:67c:4e8:f002::a',
    3: '2001:b28:f23d:f003::a',
    4: '2001:67c:4e8:f004::a',
    5: '2001:b28:f23f:f005::a'
  },
  test: {
    1: '2001:b28:f23d:f001::e',
    2: '2001:67c:4e8:f002::e',
    3: '2001:b28:f23d:f003::e'
  }
};

function dcIp(dcId, test, ipv6) {
  const table = ipv6 ? DC_IPV6 : DC_IP;
  const set = test ? table.test : table.prod;
  // Test config only has 3 DCs; media/other dc ids may exceed it — clamp sensibly.
  return set[dcId] || set[2] || set[1];
}

// Default network configuration. `connection` selects how the *client* connection reaches Telegram.
//   'websocket' — direct wss:// to telegram.org (browser WebSocket, no bridge)
//   'tcp'       — raw obfuscated TCP straight to the DC (via the local bridge)
//   'socks5'    — raw obfuscated TCP to the DC, tunneled through a SOCKS5 proxy
//   'mtproxy'   — raw obfuscated TCP to an MTProto proxy (secret-keyed obfuscation done in the worker)
const DEFAULT_NETWORK_CONFIG = {
  connection: 'websocket',
  socks5: {host: '', port: 1080, username: '', password: ''},
  mtproxy: {host: '', port: 443, secret: ''}
};

module.exports = {DC_IP, DC_IPV6, DC_PORT, dcIp, DEFAULT_NETWORK_CONFIG};
