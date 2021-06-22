/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import MTTransport, { MTConnectionConstructable } from './transports/transport';
import Modes from '../../config/modes';

/// #if MTPROTO_HTTP || MTPROTO_HTTP_UPLOAD
import HTTP from './transports/http';
/// #endif

/// #if !MTPROTO_HTTP
import Socket from './transports/websocket';
import TcpObfuscated from './transports/tcpObfuscated';
import { isSafari } from '../../helpers/userAgent';
import { isWebWorker } from '../../helpers/context';
import SocketProxied from './transports/socketProxied';
import App from '../../config/app';
/// #endif

export type TransportType = 'websocket' | 'https' | 'http';
export type ConnectionType = 'client' | 'download' | 'upload';
type Servers = {
  [transportType in TransportType]: {
    [connectionType in ConnectionType]: {
      [dcId: number]: MTTransport[]
    }
  }
};

const TEST_SUFFIX = Modes.test ? '_test' : '';

export class DcConfigurator {
  private sslSubdomains = ['pluto', 'venus', 'aurora', 'vesta', 'flora'];

  private dcOptions = Modes.test
    ? [
      {id: 1, host: '149.154.175.10',  port: 80},
      {id: 2, host: '149.154.167.40',  port: 80},
      {id: 3, host: '149.154.175.117', port: 80}
    ]
    : [
      {id: 1, host: '149.154.175.50',  port: 80},
      {id: 2, host: '149.154.167.50',  port: 80},
      {id: 3, host: '149.154.175.100', port: 80},
      {id: 4, host: '149.154.167.91',  port: 80},
      {id: 5, host: '149.154.171.5',   port: 80}
    ];

  public chosenServers: Servers = {} as any;

  /// #if !MTPROTO_HTTP
  private transportSocket = (dcId: number, connectionType: ConnectionType, suffix: string) => {
    const path = 'apiws' + TEST_SUFFIX;
    const chosenServer = `wss://${App.suffix.toLowerCase()}ws${dcId}${suffix}.web.telegram.org/${path}`;
    const logSuffix = connectionType === 'upload' ? '-U' : connectionType === 'download' ? '-D' : '';

    const retryTimeout = connectionType === 'client' ? 10000 : 10000;

    const oooohLetMeLive: MTConnectionConstructable = (isSafari && isWebWorker && typeof(SocketProxied) !== 'undefined') /* || true */ ? SocketProxied : Socket;

    return new TcpObfuscated(oooohLetMeLive, dcId, chosenServer, logSuffix, retryTimeout);
  };
  /// #endif

  /// #if MTPROTO_HTTP_UPLOAD || MTPROTO_HTTP
  private transportHTTP = (dcId: number, connectionType: ConnectionType, suffix: string) => {
    if(Modes.ssl || !Modes.http) {
      const subdomain = this.sslSubdomains[dcId - 1] + (connectionType !== 'client' ? '-1' : '');
      const path = Modes.test ? 'apiw_test1' : 'apiw1';
      const chosenServer = 'https://' + subdomain + '.web.telegram.org/' + path;
      return new HTTP(dcId, chosenServer);
    } else {
      for(let dcOption of this.dcOptions) {
        if(dcOption.id === dcId) {
          const chosenServer = 'http://' + dcOption.host + (dcOption.port !== 80 ? ':' + dcOption.port : '') + '/apiw1';
          return new HTTP(dcId, chosenServer);
        }
      }
    }
  };
  /// #endif

  public chooseServer(dcId: number, connectionType: ConnectionType = 'client', transportType: TransportType = 'websocket', reuse = true) {
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

      const suffix = connectionType === 'client' ? '' : '-1';

      /// #if MTPROTO_HTTP_UPLOAD
      transport = (transportType === 'websocket' ? this.transportSocket : this.transportHTTP)(dcId, connectionType, suffix);
      /// #elif !MTPROTO_HTTP
      transport = this.transportSocket(dcId, connectionType, suffix);
      /// #else
      transport = this.transportHTTP(dcId, connectionType, suffix);
      /// #endif
  
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
          const idx = transports.indexOf(transport);
          if(idx !== -1) {
            transports.splice(idx, 1);
          }
        }
      }
    }
  }
}

export default new DcConfigurator();
