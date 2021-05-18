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

import MTPNetworker from "./networker";
import { ConnectionStatusChange, InvokeApiOptions } from "../../types";
import MTTransport from "./transports/transport";

export class NetworkerFactory {
  public updatesProcessor: (obj: any) => void = null;
  public onConnectionStatusChange: (info: ConnectionStatusChange) => void = null;
  public akStopped = false;

  public setUpdatesProcessor(callback: (obj: any) => void) {
    this.updatesProcessor = callback;
  }

  public getNetworker(dcId: number, authKey: number[], authKeyID: Uint8Array, serverSalt: number[], transport: MTTransport, options: InvokeApiOptions) {
    //console.log('NetworkerFactory: creating new instance of MTPNetworker:', dcId, options);
    return new MTPNetworker(dcId, authKey, authKeyID, serverSalt, transport, options);
  }

  public startAll() {
    if(this.akStopped) {
      this.akStopped = false;
      this.updatesProcessor && this.updatesProcessor({_: 'new_session_created'});
    }
  }

  public stopAll() {
    this.akStopped = true;
  }
}

export default new NetworkerFactory();
