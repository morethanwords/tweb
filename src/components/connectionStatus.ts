/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import App from '../config/app';
import DEBUG from '../config/debug';
import replaceContent from '../helpers/dom/replaceContent';
import {LangPackKey, i18n} from '../lib/langPack';
import {logger} from '../lib/logger';
import rootScope from '../lib/rootScope';
import Button from './button';
import ProgressivePreloader from './preloader';
import SetTransition from './singleTransition';
import sessionStorage from '../lib/sessionStorage';
import {ConnectionStatus} from '../lib/mtproto/connectionStatus';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import {AppManagers} from '../lib/appManagers/managers';
import singleInstance from '../lib/mtproto/singleInstance';

export default class ConnectionStatusComponent {
  public static CHANGE_STATE_DELAY = 1000;

  private statusContainer: HTMLElement;
  private statusEl: HTMLElement;
  private statusPreloader: ProgressivePreloader;

  private currentLangPackKey: LangPackKey;

  private hadConnect = false;
  private retryAt: number;
  private connecting = false;
  private timedOut = false;
  private updating = false;

  private log: ReturnType<typeof logger>;

  private setFirstConnectionTimeout: number;
  private setStateTimeout: number;

  constructor(private managers: AppManagers, chatsContainer: HTMLElement) {
    this.log = logger('CS', undefined, undefined);

    this.statusContainer = document.createElement('div');
    this.statusContainer.classList.add('connection-status'/* , 'hide' */);

    this.statusEl = Button('btn-primary bg-warning connection-status-button', {noRipple: true});
    this.statusPreloader = new ProgressivePreloader({cancelable: false});
    this.statusPreloader.constructContainer({color: 'transparent', bold: true});
    this.statusContainer.append(this.statusEl);

    chatsContainer.prepend(this.statusContainer);

    rootScope.addEventListener('connection_status_change', (status) => {
      // console.log(status);

      this.setConnectionStatus();
    });

    rootScope.addEventListener('state_synchronizing', (channelId) => {
      if(!channelId) {
        this.updating = true;
        DEBUG && this.log('updating', this.updating);
        this.setState();
      }
    });

    rootScope.addEventListener('state_synchronized', (channelId) => {
      DEBUG && this.log('state_synchronized', channelId);
      if(!channelId) {
        this.updating = false;
        DEBUG && this.log('updating', this.updating);
        this.setState();
      }
    });

    this.setFirstConnectionTimeout = window.setTimeout(this.setConnectionStatus, ConnectionStatusComponent.CHANGE_STATE_DELAY + 1e3);

    // let bool = true;
    // document.addEventListener('dblclick', () => {
    //   this.setConnectionStatus(bool ? (bool = false, ConnectionStatus.Closed) : (bool = true, ConnectionStatus.Connected));
    // });
  }

  private setConnectionStatus = (overrideStatus?: ConnectionStatus) => {
    Promise.all([
      sessionStorage.get('dc'),
      rootScope.managers.rootScope.getConnectionStatus()
    ]).then(([baseDcId, connectionStatus]) => {
      if(!baseDcId) {
        baseDcId = App.baseDcId;
      }

      if(this.setFirstConnectionTimeout) {
        clearTimeout(this.setFirstConnectionTimeout);
        this.setFirstConnectionTimeout = 0;
      }

      const status = connectionStatus['NET-' + baseDcId];
      const online = status && (overrideStatus || status.status) === ConnectionStatus.Connected;

      if(this.connecting && online) {
        this.managers.apiUpdatesManager.forceGetDifference();
      }

      if(online && !this.hadConnect) {
        this.hadConnect = true;
      }

      this.timedOut = status && (overrideStatus || status.status) === ConnectionStatus.TimedOut;
      this.connecting = !online;
      this.retryAt = status && status.retryAt;
      DEBUG && this.log('connecting', this.connecting);
      this.setState();
    });
  };

  private setStatusText = (langPackKey: LangPackKey, args?: any[]) => {
    if(this.currentLangPackKey === langPackKey) return;
    this.currentLangPackKey = langPackKey;
    replaceContent(this.statusEl, i18n(langPackKey, args));
    this.statusPreloader.attach(this.statusEl);
  };

  private getA(langPackKey: LangPackKey, callback: () => void) {
    const a = document.createElement('a');
    a.classList.add('force-reconnect');
    a.append(i18n(langPackKey));
    attachClickEvent(a, (e) => {
      cancelEvent(e);
      callback();
    });

    return a;
  }

  private setState = () => {
    if(singleInstance.deactivatedReason) {
      return;
    }

    const timeout = ConnectionStatusComponent.CHANGE_STATE_DELAY;
    if(this.connecting) {
      if(this.timedOut) {
        const a = this.getA('ConnectionStatus.ForceReconnect', () => this.managers.networkerFactory.forceReconnect());
        this.setStatusText('ConnectionStatus.TimedOut', [a]);
      } else if(this.hadConnect) {
        if(this.retryAt !== undefined) {
          const timerSpan = document.createElement('span');
          const retryAt = this.retryAt;
          const setTime = () => {
            const now = Date.now();
            timerSpan.innerText = '' + Math.max(0, Math.round((retryAt - now) / 1000));
            if(now > retryAt) {
              clearInterval(interval);
            }
          };
          const interval = setInterval(setTime, 1e3);
          setTime();

          const a = this.getA('ConnectionStatus.Reconnect', () => this.managers.networkerFactory.forceReconnectTimeout());
          this.setStatusText('ConnectionStatus.ReconnectIn', [timerSpan, a]);
        } else {
          this.setStatusText('ConnectionStatus.Reconnecting');
        }
      } else {
        this.setStatusText('ConnectionStatus.Waiting');
      }
    } else if(this.updating) {
      this.setStatusText('Updating');
    }

    DEBUG && this.log('setState', this.connecting || this.updating);
    window.requestAnimationFrame(() => {
      if(this.setStateTimeout) clearTimeout(this.setStateTimeout);

      const cb = () => {
        SetTransition({
          element: this.statusContainer,
          className: 'is-shown',
          forwards: this.connecting || this.updating,
          duration: 200
        });
        this.setStateTimeout = 0;
        DEBUG && this.log('setState: isShown:', this.connecting || this.updating);
      };

      this.setStateTimeout = window.setTimeout(cb, timeout);
      // cb();
      /* if(timeout) this.setStateTimeout = window.setTimeout(cb, timeout);
      else cb(); */
    });
  };
}
