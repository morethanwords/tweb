import Socket from './transports/websocket';
import MTTransport from './transports/transport';
import HTTP from './transports/http';
import { Modes } from './mtproto_config';

type Servers = {
  [transport: string]: {
    [dcID: number]: MTTransport
  }
  /* websocket: {
    [dcID: number]: Socket
  },
  https: {
    [dcID: number]: HTTPTransport
  },
  http: {
    [dcID: number]: HTTPTransport
  } */
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

  private chosenServers: Servers = {
    websocket: {},
    https: {},
    http: {}
  };

  private chosenUploadServers: Servers = {
    websocket: {},
    https: {},
    http: {}
  };

  public chooseServer(dcID: number, upload?: boolean, transport = 'websocket') {
    let servers = upload && (transport != 'websocket' || Modes.multipleConnections) 
      ? this.chosenUploadServers[transport] 
      : this.chosenServers[transport];

    if(!(dcID in servers)) {
      let chosenServer = '';

      if(transport == 'websocket') {
        let subdomain = this.sslSubdomains[dcID - 1];
        let path = Modes.test ? 'apiws_test' : 'apiws';
        chosenServer = 'wss://' + subdomain + '.web.telegram.org/' + path;
        return servers[dcID] = new Socket(dcID, chosenServer);
      }
  
      if(Modes.ssl || !Modes.http || transport == 'https') {
        let subdomain = this.sslSubdomains[dcID - 1] + (upload ? '-1' : '');
        let path = Modes.test ? 'apiw_test1' : 'apiw1';
        chosenServer = 'https://' + subdomain + '.web.telegram.org/' + path;
        return servers[dcID] = new HTTP(dcID, chosenServer);
      }
  
      for(let dcOption of this.dcOptions) {
        if(dcOption.id == dcID) {
          chosenServer = 'http://' + dcOption.host + (dcOption.port != 80 ? ':' + dcOption.port : '') + '/apiw1';
          return servers[dcID] = new HTTP(dcID, chosenServer);
        }
      }

      console.error('No chosenServer!', dcID);

      return null;
    }
  
    return servers[dcID];
  }
}

export default new DcConfigurator();
