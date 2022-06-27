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

import tsNow from "../../helpers/tsNow";
import { InputNotifyPeer, InputPeerNotifySettings, NotifyPeer, PeerNotifySettings, Update } from "../../layer";
import { MUTE_UNTIL } from "../mtproto/mtproto_config";
import throttle from "../../helpers/schedulers/throttle";
import convertInputKeyToKey from "../../helpers/string/convertInputKeyToKey";
import { AppManager } from "./manager";
import getPeerId from "./utils/peers/getPeerId";
import ctx from "../../environment/ctx";
import assumeType from "../../helpers/assumeType";

type ImSadAboutIt = Promise<PeerNotifySettings> | PeerNotifySettings;
export class AppNotificationsManager extends AppManager {
  private peerSettings = {
    notifyPeer: {} as {[peerId: PeerId]: ImSadAboutIt},
    notifyUsers: null as ImSadAboutIt,
    notifyChats: null as ImSadAboutIt,
    notifyBroadcasts: null as ImSadAboutIt
  };
  //private exceptions: {[peerId: string]: PeerNotifySettings} = {};
  
  private getNotifyPeerTypePromise: Promise<any>;

  private checkMuteUntilTimeout: number;
  private checkMuteUntilThrottled: () => void;

  private notifyContactsSignUp: Promise<boolean>;

  protected after() {
    this.checkMuteUntilThrottled = throttle(this.checkMuteUntil, 1000, false);

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateNotifySettings: (update) => {
        const peerId = update.peer._ === 'notifyPeer' && getPeerId(update.peer.peer);
        const key = update.peer._ !== 'notifyPeer' ? update.peer._ : undefined;
        this.savePeerSettings({
          key,
          peerId, 
          settings: update.notify_settings
        });
        this.rootScope.dispatchEvent('notify_settings', update);
      }
    });

    return this.appStateManager.getState().then((state) => {
      if(state.notifySettings) {
        for(const key in state.notifySettings) {
          assumeType<Exclude<NotifyPeer['_'], 'notifyPeer'>>(key);
          this.savePeerSettings({
            key,
            settings: state.notifySettings[key]
          });
        }
      }
    });
  }

  public getNotifySettings(peer: InputNotifyPeer): ImSadAboutIt {
    let key: any = convertInputKeyToKey(peer._);
    let obj: any = this.peerSettings[key as NotifyPeer['_']];

    let peerId: PeerId;
    if(peer._ === 'inputNotifyPeer') {
      peerId = key = getPeerId(peer.peer);
      obj = obj[key];
    }

    if(obj) {
      return obj;
    }

    return (obj || this.peerSettings)[key] = this.apiManager.invokeApi('account.getNotifySettings', {peer})
    .then((settings) => {
      this.savePeerSettings({
        key,
        peerId, 
        settings
      });
      
      return settings;
    });
  }

  public getNotifyPeerTypeSettings() {
    if(this.getNotifyPeerTypePromise) return this.getNotifyPeerTypePromise;

    const promises = (['inputNotifyBroadcasts', 'inputNotifyUsers', 'inputNotifyChats'] as Exclude<InputNotifyPeer['_'], 'inputNotifyPeer'>[])
    .map((inputKey) => {
      return this.getNotifySettings({_: inputKey});
    });

    return this.getNotifyPeerTypePromise = Promise.all(promises);
  }

  public updateNotifySettings(peer: InputNotifyPeer, settings: InputPeerNotifySettings) {
    //this.savePeerSettings(peerId, settings);

    /* const inputSettings: InputPeerNotifySettings = copy(settings) as any;
    inputSettings._ = 'inputPeerNotifySettings'; */

    return this.apiManager.invokeApi('account.updateNotifySettings', {
      peer,
      settings
    }).then((value) => {
      if(value) {
        this.apiUpdatesManager.processLocalUpdate({
          _: 'updateNotifySettings', 
          peer: {
            ...peer as any,
            _: convertInputKeyToKey(peer._)
          }, 
          notify_settings: { // ! WOW, IT WORKS !
            ...settings,
            _: 'peerNotifySettings',
          }
        });
      }
    });
  }

  // public getNotifyExceptions() {
  //   apiManager.invokeApi('account.getNotifyExceptions', {compare_sound: true})
  //   .then((updates) => {
  //     apiUpdatesManager.processUpdateMessage(updates);
  //   });
  // }

  public getContactSignUpNotification() {
    if(this.notifyContactsSignUp) return this.notifyContactsSignUp;
    return this.notifyContactsSignUp = this.apiManager.invokeApi('account.getContactSignUpNotification');
  }

  public setContactSignUpNotification(silent: boolean) {
    this.apiManager.invokeApi('account.setContactSignUpNotification', {silent})
    .then((value) => {
      this.notifyContactsSignUp = Promise.resolve(!silent);
    });
  }

  private checkMuteUntil = () => {
    if(this.checkMuteUntilTimeout !== undefined) {
      clearTimeout(this.checkMuteUntilTimeout);
      this.checkMuteUntilTimeout = undefined;
    }

    const timestamp = tsNow(true);
    let closestMuteUntil = MUTE_UNTIL;
    for(const peerId in this.peerSettings.notifyPeer) {
      const peerNotifySettings = this.peerSettings.notifyPeer[peerId];
      if(peerNotifySettings instanceof Promise) {
        continue;
      }

      const muteUntil = peerNotifySettings.mute_until;
      if(!muteUntil) {
        continue;
      }

      if(muteUntil <= timestamp) {
        // ! do not delete it because peer's unique settings will be overwritten in getPeerLocalSettings with type's settings
        peerNotifySettings.mute_until = 0;

        this.apiUpdatesManager.saveUpdate({
          _: 'updateNotifySettings',
          peer: {
            _: 'notifyPeer',
            peer: this.appPeersManager.getOutputPeer(peerId.toPeerId())
          },
          notify_settings: peerNotifySettings
        });
      } else if(muteUntil < closestMuteUntil) {
        closestMuteUntil = muteUntil;
      }
    }

    const timeout = Math.min(1800e3, (closestMuteUntil - timestamp) * 1000);
    this.checkMuteUntilTimeout = ctx.setTimeout(this.checkMuteUntil, timeout);
  };

  public savePeerSettings({key, peerId, settings}: {
    key?: Exclude<NotifyPeer['_'], 'notifyPeer'>,
    peerId?: PeerId, 
    settings: PeerNotifySettings
  }) {
    let obj: any;
    if(peerId) {
      key = peerId as any;
      obj = this.peerSettings['notifyPeer'];
    }
    
    (obj || this.peerSettings)[key] = settings;

    if(!peerId) {
      this.rootScope.dispatchEvent('notify_peer_type_settings', {key, settings});
      this.appStateManager.getState().then((state) => {
        const notifySettings = state.notifySettings;
        notifySettings[key] = settings;
        this.appStateManager.pushToState('notifySettings', notifySettings);
      });
    } else {
      this.checkMuteUntilThrottled();
    }

    //rootScope.broadcast('notify_settings', {peerId: peerId});
  }

  public isMuted(peerNotifySettings: PeerNotifySettings) {
    return peerNotifySettings._ === 'peerNotifySettings' &&
      (peerNotifySettings.silent || (peerNotifySettings.mute_until !== undefined && (peerNotifySettings.mute_until * 1000) > tsNow()));
  }

  private getPeerMuted(peerId: PeerId) {
    const ret = this.getNotifySettings({_: 'inputNotifyPeer', peer: this.appPeersManager.getInputPeerById(peerId)});
    return (ret instanceof Promise ? ret : Promise.resolve(ret))
    .then((peerNotifySettings) => this.isMuted(peerNotifySettings));
  }

  private getPeerLocalSettings(peerId: PeerId, respectType = true): PeerNotifySettings {
    const n: PeerNotifySettings = {
      _: 'peerNotifySettings'
    };

    const notifySettings = this.peerSettings['notifyPeer'][peerId];
    //if(!notifySettings || (notifySettings instanceof Promise)) return false;
    if(notifySettings && !(notifySettings instanceof Promise)) {
      Object.assign(n, notifySettings);
    }

    if(respectType) {
      const inputNotify = this.appPeersManager.getInputNotifyPeerById(peerId, true);
      const key = convertInputKeyToKey(inputNotify._);
      const typeNotifySettings = this.peerSettings[key as NotifyPeer['_']];
      if(typeNotifySettings && !(typeNotifySettings instanceof Promise)) {
        for(let i in typeNotifySettings) {
          // @ts-ignore
          if(n[i] === undefined) {
            // @ts-ignore
            n[i] = typeNotifySettings[i];
          }
        }
      }
    }

    return n;
  }

  public isPeerLocalMuted(peerId: PeerId, respectType = true) {
    if(peerId === this.appPeersManager.peerId) return false;

    const notifySettings = this.getPeerLocalSettings(peerId, respectType);
    return this.isMuted(notifySettings);
  }
}
