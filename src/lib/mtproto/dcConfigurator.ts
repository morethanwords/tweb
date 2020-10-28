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
      [dcID: number]: MTTransport[]
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

  private transportSocket = (dcID: number, connectionType: ConnectionType) => {
    const subdomain = this.sslSubdomains[dcID - 1];
    const path = Modes.test ? 'apiws_test' : 'apiws';
    const chosenServer = 'wss://' + subdomain + '.web.telegram.org/' + path;
    const suffix = connectionType == 'upload' ? '-U' : connectionType == 'download' ? '-D' : '';
    return new Socket(dcID, chosenServer, suffix);
  };

  private transportHTTP = (dcID: number, connectionType: ConnectionType) => {
    if(Modes.ssl || !Modes.http) {
      const subdomain = this.sslSubdomains[dcID - 1] + (connectionType != 'client' ? '-1' : '');
      const path = Modes.test ? 'apiw_test1' : 'apiw1';
      const chosenServer = 'https://' + subdomain + '.web.telegram.org/' + path;
      return new HTTP(dcID, chosenServer);
    } else {
      for(let dcOption of this.dcOptions) {
        if(dcOption.id == dcID) {
          const chosenServer = 'http://' + dcOption.host + (dcOption.port != 80 ? ':' + dcOption.port : '') + '/apiw1';
          return new HTTP(dcID, chosenServer);
        }
      }
    }
  };

  public chooseServer(dcID: number, connectionType: ConnectionType = 'client', transportType: TransportType = 'websocket') {
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

    if(!(dcID in servers)) {
      servers[dcID] = [];
    }

    const transports = servers[dcID];

    if(!transports.length/*  || (upload && transports.length < 1) */) {
      let transport: MTTransport;

      /// #if MTPROTO_HTTP_UPLOAD
      transport = (transportType == 'websocket' ? this.transportSocket : this.transportHTTP)(dcID, connectionType);
      /// #elif !MTPROTO_HTTP
      transport = this.transportSocket(dcID, connectionType);
      /// #else
      transport = this.transportHTTP(dcID, connectionType);
      /// #endif
  
      if(!transport) {
        console.error('No chosenServer!', dcID);
        return null;
      }
      
      transports.push(transport);
      return transport;
    }
  
    return transports[0];
  }
}

export default new DcConfigurator();
