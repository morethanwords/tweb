import MTTransport from './transports/transport';
import Modes from '../../config/modes';

/// #if MTPROTO_HTTP_UPLOAD
// @ts-ignore
import TcpObfuscated from './transports/tcpObfuscated';
// @ts-ignore
import HTTP from './transports/http';
/// #elif !MTPROTO_HTTP
// @ts-ignore
import TcpObfuscated from './transports/tcpObfuscated';
import { isSafari } from '../../helpers/userAgent';
import type MTPNetworker from './networker';
import { notifyAll, isWebWorker } from '../../helpers/context';
import { CancellablePromise, deferredPromise } from '../../helpers/cancellablePromise';
/// #else 
// @ts-ignore
import HTTP from './transports/http';
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

let socketId = 0;
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

  private chosenServers: Servers = {} as any;

  /// #if !MTPROTO_HTTP
  private transportSocket = (dcId: number, connectionType: ConnectionType) => {
    const subdomain = this.sslSubdomains[dcId - 1];
    const path = 'apiws' + TEST_SUFFIX;
    const chosenServer = 'wss://' + subdomain + '.web.telegram.org/' + path;
    const logSuffix = connectionType === 'upload' ? '-U' : connectionType === 'download' ? '-D' : '';

    const retryTimeout = connectionType === 'client' ? 30000 : 10000;
    if(isSafari && isWebWorker && false) {
      class P implements MTTransport {
        private id: number;
        private taskId = 0;
        public networker: MTPNetworker;
        public promises: Map<number, CancellablePromise<Uint8Array>> = new Map();

        constructor(dcId: number, url: string) {
          this.id = ++socketId;

          notifyAll({
            type: 'socketProxy',
            payload: {
              type: 'setup', 
              payload: {
                dcId, 
                url,
                logSuffix,
                retryTimeout
              },
              id: this.id
            }
          });
        }

        send = (payload: Uint8Array) => {
          const task: any = {
            type: 'socketProxy', 
            payload: {
              type: 'send',
              payload,
              id: this.id
            }
          };

          if(this.networker) {
            notifyAll(task);
            return null;
          }
          
          task.payload.taskId = ++this.taskId;
          const deferred = deferredPromise<Uint8Array>();
          this.promises.set(task.id, deferred);
          notifyAll(task);
          return deferred;
        };
      }

      return new P(dcId, chosenServer);
    } else {
      return new TcpObfuscated(dcId, chosenServer, logSuffix, retryTimeout);
    }
  };
  /// #endif

  /// #if MTPROTO_HTTP_UPLOAD || MTPROTO_HTTP
  private transportHTTP = (dcId: number, connectionType: ConnectionType) => {
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

      /// #if MTPROTO_HTTP_UPLOAD
      transport = (transportType === 'websocket' ? this.transportSocket : this.transportHTTP)(dcId, connectionType);
      /// #elif !MTPROTO_HTTP
      transport = this.transportSocket(dcId, connectionType);
      /// #else
      transport = this.transportHTTP(dcId, connectionType);
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
}

export default new DcConfigurator();
