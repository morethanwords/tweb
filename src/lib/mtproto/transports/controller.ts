/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import App from '../../../config/app';
import deferredPromise from '../../../helpers/cancellablePromise';
import EventListenerBase from '../../../helpers/eventListenerBase';
import pause from '../../../helpers/schedulers/pause';
import {TransportType, DcConfigurator} from '../dcConfigurator';
import type HTTP from './http';
import type TcpObfuscated from './tcpObfuscated';
import MTTransport from './transport';

export class MTTransportController extends EventListenerBase<{
  change: (opened: MTTransportController['opened']) => void,
  transport: (type: TransportType) => void
}> {
  private opened: Map<TransportType, number>;
  private transports: {[k in TransportType]?: MTTransport};
  private pinging: boolean;
  private dcConfigurator: DcConfigurator;

  constructor() {
    super(true);

    this.opened = new Map();
    /* this.addEventListener('change', (opened) => {
      this.dispatchEvent('transport', opened.get('websocket') || !opened.get('https') ? 'websocket' : 'https');
    }); */

    this.addEventListener('change', (opened) => {
      if(!opened.get('websocket')) {
        this.waitForWebSocket();
      }
    });

    // setTimeout(() => {
    // this.waitForWebSocket();
    // }, 200); // wait for first transport so won't have delay for first WS
  }

  public async pingTransports() {
    const dcConfigurator = this.dcConfigurator ??= new DcConfigurator();
    const timeout = 2000;
    const transports: {[k in TransportType]?: MTTransport} = this.transports = {
      https: dcConfigurator.chooseServer(App.baseDcId, 'client', 'https', false),
      websocket: dcConfigurator.chooseServer(App.baseDcId, 'client', 'websocket', false)
    };

    const httpPromise = deferredPromise<boolean>();
    ((this.transports.https as HTTP)._send(new Uint8Array(), 'no-cors') as any as Promise<any>)
    .then(() => httpPromise.resolve(true), () => httpPromise.resolve(false));
    setTimeout(() => httpPromise.resolve(false), timeout);

    const websocketPromise = deferredPromise<boolean>();
    const socket = transports.websocket as TcpObfuscated;
    socket.setAutoReconnect(false);
    socket.connection.addEventListener('close', () => websocketPromise.resolve(false), {once: true});
    socket.connection.addEventListener('open', () => websocketPromise.resolve(true), {once: true});
    setTimeout(() => {
      if(websocketPromise.isFulfilled || websocketPromise.isRejected) {
        return;
      }

      if(socket.connection) {
        socket.connection.close();
      }

      websocketPromise.resolve(false);
    }, timeout);

    const [isHttpAvailable, isWebSocketAvailable] = await Promise.all([httpPromise, websocketPromise]);

    for(const transportType in transports) {
      const transport = transports[transportType as TransportType];
      transport.destroy();
    }

    const result = {
      https: isHttpAvailable || this.opened.get('https') > 0,
      websocket: isWebSocketAvailable || this.opened.get('websocket') > 0
    };

    // result.websocket = false;
    return result;
  }

  public async waitForWebSocket() {
    if(this.pinging) return;
    this.pinging = true;

    while(true) {
      const {https, websocket} = await this.pingTransports();
      if(https || websocket) {
        this.dispatchEvent('transport', websocket || !https ? 'websocket' : 'https');
      }

      if(websocket) {
        break;
      }

      await pause(10000);
    }

    this.pinging = false;
  }

  public setTransportValue(type: TransportType, value: boolean) {
    let length = this.opened.get(type) || 0;
    length += value ? 1 : -1;

    this.opened.set(type, length);
    this.dispatchEvent('change', this.opened);
  }

  public setTransportOpened(type: TransportType) {
    return this.setTransportValue(type, true);
  }

  public setTransportClosed(type: TransportType) {
    return this.setTransportValue(type, false);
  }
}

const transportController = new MTTransportController();
export default transportController;
