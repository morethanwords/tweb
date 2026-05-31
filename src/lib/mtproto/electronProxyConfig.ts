/*
 * Runtime network configuration for the Electron shell, held inside the MTProto worker.
 *
 * The renderer reads the user's choice from app settings and pushes it here via the
 * `setElectronConfig` worker invoke (see apiManagerProxy / index.worker). dcConfigurator
 * reads it to decide whether to route a connection through the local WebSocket->TCP
 * bridge, and Obfuscation reads the MTProxy secret derived from it.
 */

import bytesFromHex from '@helpers/bytes/bytesFromHex';

export type ElectronNetworkConnection = 'websocket' | 'tcp' | 'socks5' | 'mtproxy';

export type ElectronProxyConfig = {
  isElectron: boolean;
  bridgePort?: number;
  connection: ElectronNetworkConnection;
  socks5?: {host: string, port: number, username?: string, password?: string};
  mtproxy?: {host: string, port: number, secret: string};
};

let config: ElectronProxyConfig = {
  isElectron: false,
  connection: 'websocket'
};

export function setElectronProxyConfig(partial: Partial<ElectronProxyConfig>) {
  config = {...config, ...partial};
}

export function getElectronProxyConfig() {
  return config;
}

/** True when a connection should be routed through the local TCP bridge instead of wss. */
export function shouldUseBridge() {
  return !!(config.isElectron && config.bridgePort && config.connection && config.connection !== 'websocket');
}

function base64UrlToBytes(s: string) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while(s.length % 4) s += '=';
  try {
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; ++i) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch(e) {
    return null;
  }
}

function secretToBytes(secret: string) {
  secret = (secret || '').trim();
  if(!secret) return null;
  if(/^[0-9a-fA-F]+$/.test(secret) && (secret.length % 2) === 0) {
    return bytesFromHex(secret);
  }
  return base64UrlToBytes(secret);
}

/**
 * Parse an MTProxy secret into the 16-byte obfuscation key material plus a flag for which
 * transport codec it implies (per tdesktop TcpConnection::Protocol::Create):
 *   - 16 bytes                  -> abridged framing, secret-keyed obfuscation
 *   - 0xDD + 16 bytes           -> padded framing (a.k.a. "dd")
 *   - 0xEE + 16 bytes + domain  -> fake-TLS ("ee"); the inner 16 bytes use padded framing,
 *                                  but the outer TLS wrapper is NOT implemented (best effort).
 */
export function parseMtprotoSecret(secret: string): {bytes: Uint8Array, padded: boolean, fakeTls: boolean} | null {
  const bytes = secretToBytes(secret);
  if(!bytes || bytes.length < 16) return null;

  if(bytes[0] === 0xee && bytes.length >= 18) {
    return {bytes: bytes.slice(1, 17), padded: true, fakeTls: true};
  }
  if(bytes[0] === 0xdd && bytes.length === 17) {
    return {bytes: bytes.slice(1, 17), padded: true, fakeTls: false};
  }
  return {bytes: bytes.slice(0, 16), padded: false, fakeTls: false};
}
