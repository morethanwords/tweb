import MTTransport from './transports/transport';
import { Modes } from './mtproto_config';

/// #if MTPROTO_HTTP_UPLOAD
// @ts-ignore
import Socket from './transports/websocket';
// @ts-ignore
import HTTP from './transports/http';
/// #elif !MTPROTO_HTTP
// @ts-ignore
import Socket from './transports/websocket';
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

  private transportSocket = (dcId: number, connectionType: ConnectionType) => {
    const subdomain = this.sslSubdomains[dcId - 1];
    const path = Modes.test ? 'apiws_test' : 'apiws';
    const chosenServer = 'wss://' + subdomain + '.web.telegram.org/' + path;
    const suffix = connectionType == 'upload' ? '-U' : connectionType == 'download' ? '-D' : '';
    return new Socket(dcId, chosenServer, suffix);
  };

  private transportHTTP = (dcId: number, connectionType: ConnectionType) => {
    if(Modes.ssl || !Modes.http) {
      const subdomain = this.sslSubdomains[dcId - 1] + (connectionType != 'client' ? '-1' : '');
      const path = Modes.test ? 'apiw_test1' : 'apiw1';
      const chosenServer = 'https://' + subdomain + '.web.telegram.org/' + path;
      return new HTTP(dcId, chosenServer);
    } else {
      for(let dcOption of this.dcOptions) {
        if(dcOption.id == dcId) {
          const chosenServer = 'http://' + dcOption.host + (dcOption.port != 80 ? ':' + dcOption.port : '') + '/apiw1';
          return new HTTP(dcId, chosenServer);
        }
      }
    }
  };

  public chooseServer(dcId: number, connectionType: ConnectionType = 'client', transportType: TransportType = 'websocket', reuse = true) {
    /* if(transportType == 'websocket' && !Modes.multipleConnections) {
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
      transport = (transportType == 'websocket' ? this.transportSocket : this.transportHTTP)(dcId, connectionType);
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
