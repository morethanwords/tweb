/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import App from "../config/app";
import DEBUG from "../config/debug";
import replaceContent from "../helpers/dom/replaceContent";
import apiUpdatesManager from "../lib/appManagers/apiUpdatesManager";
import { LangPackKey, i18n } from "../lib/langPack";
import { logger } from "../lib/logger";
import rootScope from "../lib/rootScope";
import Button from "./button";
import ProgressivePreloader from "./preloader";
import SetTransition from "./singleTransition";
import sessionStorage from '../lib/sessionStorage';

export default class ConnectionStatusComponent {
  public static CHANGE_STATE_DELAY = 1000;

  private statusContainer: HTMLElement;
  private statusEl: HTMLElement;
  private statusPreloader: ProgressivePreloader;

  private currentLangPackKey = '';

  private connectingTimeout: number;
  private connecting = false;
  private updating = false;

  private log: ReturnType<typeof logger>;

  private setFirstConnectionTimeout: number;
  private setStateTimeout: number;

  constructor(chatsContainer: HTMLElement) {
    this.log = logger('CS');
  
    this.statusContainer = document.createElement('div');
    this.statusContainer.classList.add('connection-status');

    this.statusEl = Button('btn-primary bg-warning connection-status-button', {noRipple: true});
    this.statusPreloader = new ProgressivePreloader({cancelable: false});
    this.statusPreloader.constructContainer({color: 'transparent', bold: true});
    this.statusContainer.append(this.statusEl);

    chatsContainer.prepend(this.statusContainer);

    rootScope.addEventListener('connection_status_change', (e) => {
      const status = e;
      console.log(status);

      this.setConnectionStatus();
    });

    rootScope.addEventListener('state_synchronizing', (e) => {
      const channelId = e;
      if(!channelId) {
        this.updating = true;
        DEBUG && this.log('updating', this.updating);
        this.setState();
      }
    });

    rootScope.addEventListener('state_synchronized', (e) => {
      const channelId = e;
      DEBUG && this.log('state_synchronized', channelId);
      if(!channelId) {
        this.updating = false;
        DEBUG && this.log('updating', this.updating);
        this.setState();
      }
    });

    this.setFirstConnectionTimeout = window.setTimeout(this.setConnectionStatus, ConnectionStatusComponent.CHANGE_STATE_DELAY + 1e3);

    /* let bool = true;
    document.addEventListener('dblclick', () => {
      rootScope.broadcast('connection_status_change', {
        dcId: 2,
        isFileDownload: false,
        isFileNetworker: false,
        isFileUpload: false,
        name: "NET-2",
        online: bool = !bool,
        _: "networkerStatus"
      });
    }); */
  }

  private setConnectionStatus = () => {
    sessionStorage.get('dc').then(baseDcId => {
      if(!baseDcId) {
        baseDcId = App.baseDcId;
      }
      
      if(this.setFirstConnectionTimeout) {
        clearTimeout(this.setFirstConnectionTimeout);
        this.setFirstConnectionTimeout = 0;
      }

      const status = rootScope.connectionStatus['NET-' + baseDcId];
      const online = status && status.online;

      if(this.connecting && online) {
        apiUpdatesManager.forceGetDifference();
      }

      this.connecting = !online;
      this.connectingTimeout = status && status.timeout;
      DEBUG && this.log('connecting', this.connecting);
      this.setState();
    });
  };

  private setStatusText = (langPackKey: LangPackKey) => {
    if(this.currentLangPackKey === langPackKey) return;
    this.currentLangPackKey = langPackKey;
    replaceContent(this.statusEl, i18n(langPackKey));
    this.statusPreloader.attach(this.statusEl);
  };

  private setState = () => {
    const timeout = ConnectionStatusComponent.CHANGE_STATE_DELAY;
    if(this.connecting) {
      // if(this.connectingTimeout) {
      //   this.setStatusText('ConnectionStatus.Reconnect');
      // } else {
        this.setStatusText('ConnectionStatus.Waiting');
      // }
    } else if(this.updating) {
      this.setStatusText('Updating');
    }

    DEBUG && this.log('setState', this.connecting || this.updating);
    window.requestAnimationFrame(() => {
      if(this.setStateTimeout) clearTimeout(this.setStateTimeout);

      const cb = () => {
        SetTransition(this.statusContainer, 'is-shown', this.connecting || this.updating, 200);
        this.setStateTimeout = 0;
        DEBUG && this.log('setState: isShown:', this.connecting || this.updating);
      };

      this.setStateTimeout = window.setTimeout(cb, timeout);
      //cb();
      /* if(timeout) this.setStateTimeout = window.setTimeout(cb, timeout);
      else cb(); */
    });
  };
}
