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

import type {ConnectionStatusChange} from './connectionStatus';
import MTPNetworker from './networker';
import {InvokeApiOptions} from '../../types';
import App from '../../config/app';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import {AppManager} from '../appManagers/manager';

export class NetworkerFactory extends AppManager {
  private networkers: MTPNetworker[] = [];
  public language = navigator.language || App.langPackCode;
  public updatesProcessor: (obj: any) => void = null;
  // public onConnectionStatusChange: (status: ConnectionStatusChange) => void = null;
  public akStopped = false;

  public onConnectionStatusChange(status: ConnectionStatusChange) {
    this.rootScope.dispatchEvent('connection_status_change', status);
    //  ({type: 'connectionStatusChange', payload: status});
  }

  public removeNetworker(networker: MTPNetworker) {
    indexOfAndSplice(this.networkers, networker);
  }

  public setUpdatesProcessor(callback: (obj: any) => void) {
    this.updatesProcessor = callback;
  }

  public getNetworker(dcId: number, authKey: Uint8Array, authKeyId: Uint8Array, serverSalt: Uint8Array, options: InvokeApiOptions) {
    // console.log('NetworkerFactory: creating new instance of MTPNetworker:', dcId, options);
    const networker = new MTPNetworker(this, this.timeManager, dcId, authKey, authKeyId, serverSalt, this.getAccountNumber(), options);
    this.networkers.push(networker);
    return networker;
  }

  public startAll() {
    if(this.akStopped) {
      const stoppedNetworkers = this.networkers.filter((networker) => networker.isStopped());

      this.akStopped = false;
      this.updatesProcessor && this.updatesProcessor({_: 'new_session_created'});

      for(const networker of stoppedNetworkers) {
        networker.sendPingDelayDisconnect();
        networker.scheduleRequest();
      }
    }
  }

  public stopAll() {
    this.akStopped = true;
  }

  public setLanguage(langCode: string) {
    this.language = langCode;
    for(const networker of this.networkers) {
      if(!networker.isFileNetworker) {
        networker.connectionInited = false;
      }
    }
  }

  public unsetConnectionInited() {
    for(const networker of this.networkers) {
      networker.connectionInited = false;
    }
  }

  public forceReconnectTimeout() {
    for(const networker of this.networkers) {
      networker.forceReconnectTimeout();
    }
  }

  public forceReconnect() {
    for(const networker of this.networkers) {
      if(!networker.isFileNetworker) {
        networker.forceReconnect();
        break;
      }
    }
  }
}
