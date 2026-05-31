/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import MTTransport, {MTConnectionConstructable} from '@lib/mtproto/transports/transport';
import Modes from '@config/modes';
import App from '@config/app';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import HTTP from '@lib/mtproto/transports/http';
import Socket from '@lib/mtproto/transports/websocket';
import TcpObfuscated from '@lib/mtproto/transports/tcpObfuscated';
import {IS_WEB_WORKER} from '@helpers/context';
import {DcId} from '@types';
import {getEnvironment} from '@environment/utils';
import SocketProxied from '@lib/mtproto/transports/socketProxied';
import {TcpObfuscatedOptions} from '@lib/mtproto/transports/tcpObfuscated';
import {getElectronProxyConfig, parseMtprotoSecret, shouldUseBridge} from '@lib/mtproto/electronProxyConfig';

export type TransportType = 'websocket' | 'https' | 'http';
export type ConnectionType = 'client' | 'download' | 'upload';
type Servers = {
  [transportType in TransportType]: {
    [connectionType in ConnectionType]: {
      [dcId: DcId]: MTTransport[]
    }
  }
};

const TEST_SUFFIX = Modes.test ? '_test' : '';
const PREMIUM_SUFFIX = '_premium';
const RETRY_TIMEOUT_CLIENT = 3000;
const RETRY_TIMEOUT_DOWNLOAD = 3000;

export function getTelegramConnectionSuffix(connectionType: ConnectionType) {
  return connectionType === 'client' ? '' : '-1';
}

/**
 * Build the local-bridge WebSocket URL and per-connection obfuscation options for a DC.
 * The bridge resolves dc/test/type into a raw TCP target (optionally via SOCKS5/MTProxy);
 * the worker still owns all obfuscation, including MTProxy's secret-keyed handshake.
 */
function buildBridgeTransport(dcId: DcId, connectionType: ConnectionType): {url: string, options: TcpObfuscatedOptions} {
  const config = getElectronProxyConfig();
  const test = Modes.test ? 1 : 0;
  const url = `ws://127.0.0.1:${config.bridgePort}/apiws?dc=${dcId}&test=${test}&type=${connectionType}`;

  const options: TcpObfuscatedOptions = {streamFramed: true};

  if(config.connection === 'mtproxy') {
    const secret = parseMtprotoSecret(config.mtproxy?.secret);
    if(secret) {
      // Embed the target DC id (test-shifted, negated for the media cluster) like tdesktop.
      let protocolDcId = (Modes.test ? 10000 : 0) + dcId;
      if(connectionType !== 'client') protocolDcId = -protocolDcId;
      options.mtproto = {secret: secret.bytes, dcId: protocolDcId, padded: secret.padded};
    }
  }

  return {url, options};
}

export function constructTelegramWebSocketUrl(dcId: DcId, connectionType: ConnectionType, premium?: boolean) {
  if(!import.meta.env.VITE_MTPROTO_HAS_WS) {
    return;
  }

  const suffix = getTelegramConnectionSuffix(connectionType);
  const path = connectionType !== 'client' ? 'apiws' + TEST_SUFFIX + (premium ? PREMIUM_SUFFIX : '') : ('apiws' + TEST_SUFFIX);
  const chosenServer = `wss://${App.suffix.toLowerCase()}ws${dcId}${suffix}.web.telegram.org/${path}`;

  return chosenServer;
}

export class DcConfigurator {
  private sslSubdomains = ['pluto', 'venus', 'aurora', 'vesta', 'flora'];

  private dcOptions = Modes.test ?
    [
      {id: 1, host: '149.154.175.10',  port: 80},
      {id: 2, host: '149.154.167.40',  port: 80},
      {id: 3, host: '149.154.175.117', port: 80}
    ] :
    [
      {id: 1, host: '149.154.175.50',  port: 80},
      {id: 2, host: '149.154.167.50',  port: 80},
      {id: 3, host: '149.154.175.100', port: 80},
      {id: 4, host: '149.154.167.91',  port: 80},
      {id: 5, host: '149.154.171.5',   port: 80}
    ];

  public chosenServers: Servers = {} as any;

  private transportSocket = (dcId: DcId, connectionType: ConnectionType, premium?: boolean) => {
    if(!import.meta.env.VITE_MTPROTO_HAS_WS) {
      return;
    }

    const logSuffix = connectionType === 'upload' ? '-U' : connectionType === 'download' ? '-D' : '';
    const retryTimeout = connectionType === 'client' ? RETRY_TIMEOUT_CLIENT : RETRY_TIMEOUT_DOWNLOAD;

    // Electron raw-TCP / SOCKS5 / MTProxy: route through the local WebSocket->TCP bridge.
    // The browser WebSocket still does the IPC; the bridge turns it into raw obfuscated TCP.
    if(shouldUseBridge()) {
      const {url, options} = buildBridgeTransport(dcId, connectionType);
      return new TcpObfuscated(Socket, dcId, url, logSuffix, retryTimeout, options);
    }

    const chosenServer = constructTelegramWebSocketUrl(dcId, connectionType, premium);

    let oooohLetMeLive: MTConnectionConstructable;
    if(import.meta.env.VITE_MTPROTO_SW || !import.meta.env.VITE_SAFARI_PROXY_WEBSOCKET) {
      oooohLetMeLive = Socket;
    } else {
      oooohLetMeLive = (getEnvironment().IS_SAFARI && IS_WEB_WORKER && typeof(SocketProxied) !== 'undefined') /* || true */ ? SocketProxied : Socket;
    }

    return new TcpObfuscated(oooohLetMeLive, dcId, chosenServer, logSuffix, retryTimeout);
  };

  private transportHTTP = (dcId: DcId, connectionType: ConnectionType, premium?: boolean) => {
    if(!import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      return;
    }

    let chosenServer: string;
    if(Modes.ssl || !Modes.http) {
      const suffix = getTelegramConnectionSuffix(connectionType);
      const subdomain = this.sslSubdomains[dcId - 1] + suffix;
      const path = Modes.test ? 'apiw_test1' : 'apiw1';
      chosenServer = 'https://' + subdomain + '.web.telegram.org/' + path;
    } else {
      for(const dcOption of this.dcOptions) {
        if(dcOption.id === dcId) {
          chosenServer = 'http://' + dcOption.host + (dcOption.port !== 80 ? ':' + dcOption.port : '') + '/apiw1';
          break;
        }
      }
    }

    const logSuffix = connectionType === 'upload' ? '-U' : connectionType === 'download' ? '-D' : '';
    return new HTTP(dcId, chosenServer, logSuffix);
  };

  public chooseServer(
    dcId: DcId,
    connectionType: ConnectionType = 'client',
    transportType: TransportType = Modes.transport,
    reuse = true,
    premium?: boolean
  ) {
    /* if(transportType === 'websocket' && !Modes.multipleConnections) {
      connectionType = 'client';
    } */

    if(!this.chosenServers.hasOwnProperty(transportType)) {
      this.chosenServers[transportType] = {
        client: {},
        download: {},
        upload: {}
      };
    }

    const servers = this.chosenServers[transportType][connectionType];

    if(!(dcId in servers)) {
      servers[dcId] = [];
    }

    const transports = servers[dcId];

    if(!transports.length || !reuse/*  || (upload && transports.length < 1) */) {
      let transport: MTTransport;

      if(import.meta.env.VITE_MTPROTO_HAS_WS && import.meta.env.VITE_MTPROTO_HAS_HTTP) {
        transport = (transportType === 'websocket' ? this.transportSocket : this.transportHTTP)(dcId, connectionType, premium);
      } else if(!import.meta.env.VITE_MTPROTO_HTTP) {
        transport = this.transportSocket(dcId, connectionType, premium);
      } else {
        transport = this.transportHTTP(dcId, connectionType, premium);
      }

      if(!transport) {
        console.error('No chosenServer!', dcId);
        return null;
      }

      if(reuse) {
        transports.push(transport);
      }

      return transport;
    }

    return transports[0];
  }

  public static removeTransport<T>(obj: any, transport: T) {
    for(const transportType in obj) {
      // @ts-ignore
      for(const connectionType in obj[transportType]) {
        // @ts-ignore
        for(const dcId in obj[transportType][connectionType]) {
          // @ts-ignore
          const transports: T[] = obj[transportType][connectionType][dcId];
          indexOfAndSplice(transports, transport);
        }
      }
    }
  }
}
