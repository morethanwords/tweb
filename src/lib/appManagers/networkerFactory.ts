/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import MTPNetworker from '@lib/mtproto/networker';
import App from '@config/app';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import {AppManager} from '@appManagers/manager';
import AccountController from '@lib/accounts/accountController';
import bytesToHex from '@helpers/bytes/bytesToHex';
import {getEnvironment} from '@environment/utils';
import sessionStorage from '@lib/sessionStorage';

export class NetworkerFactory extends AppManager {
  private networkers: MTPNetworker[] = [];
  public language = navigator.language || App.langPackCode;
  // CRM: operator label folded into initConnection's app_version so this
  // session is attributable to a specific agent across all of the user's devices.
  public agentName: string;
  public updatesProcessor: (obj: any) => void = null;
  // public onConnectionStatusChange: (status: ConnectionStatusChange) => void = null;
  public akStopped = false;

  constructor() {
    super();
    this.name = 'NET-FACTORY';

    // Restore the persisted agent label so reconnections keep tagging the
    // session even before the login card has a chance to set it.
    sessionStorage.get('agent_name').then((agentName) => {
      if(agentName && !this.agentName) {
        this.agentName = agentName;
      }
    }).catch(() => {});
  }

  // Fold the operator's agent label (when set) into the app version string so
  // it shows in the Active Sessions title (app_name + app_version) on every
  // device. The server re-records these initConnection params on each
  // connection init, so this also updates already-logged-in sessions once
  // `connectionInited` is reset (see setAgentName).
  private getAppVersion() {
    const base = App.version + (App.isMainDomain ? ' ' + App.suffix : '');
    return this.agentName ? `${base} · ${this.agentName}` : base;
  }

  public removeNetworker(networker: MTPNetworker) {
    indexOfAndSplice(this.networkers, networker);
  }

  public setUpdatesProcessor(callback: (obj: any) => void) {
    this.updatesProcessor = callback;
  }

  public getNetworker(options: Omit<
    ConstructorParameters<typeof MTPNetworker>[0],
    'networkerFactory' | 'timeManager' | 'getBaseDcId' | 'updatesProcessor' | 'getInitConnectionParams'
  >) {
    const networker = new MTPNetworker({
      ...options,
      timeManager: this.timeManager,
      getInitConnectionParams: () => ({
        id: App.id,
        deviceModel: getEnvironment().USER_AGENT || 'Unknown UserAgent',
        systemVersion: navigator.platform || 'Unknown Platform',
        version: this.getAppVersion(),
        systemLangCode: navigator.language || 'en',
        langPack: App.langPack,
        langCode: this.language
      }),
      getBaseDcId: () => this.apiManager.getBaseDcId(),
      createLogger: this.createLogger.bind(this),
      isForcedStopped: () => this.akStopped,
      updatesProcessor: (obj) => this.updatesProcessor?.(obj),
      onConnectionStatus: (status) => {
        this.rootScope.dispatchEvent('connection_status_change', status);
      },
      onServerSalt: (serverSalt) => {
        AccountController.update(this.getAccountNumber(), {
          [`dc${options.dcId}_server_salt`]: bytesToHex(serverSalt)
        });
      }
    });
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
    if(this.language === langCode) {
      return;
    }

    this.language = langCode;
    for(const networker of this.networkers) {
      if(!networker.isFileNetworker) {
        networker.connectionInited = false;
      }
    }
  }

  // Set the operator/agent label that gets folded into device_model. Resetting
  // connectionInited (like setLanguage) forces the next request to re-run
  // initConnection so the new label reaches the server for this session.
  public setAgentName(agentName: string) {
    agentName = agentName?.trim() || undefined;
    if(this.agentName === agentName) {
      return;
    }

    this.agentName = agentName;
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
