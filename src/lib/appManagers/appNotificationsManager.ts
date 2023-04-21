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

import tsNow from '../../helpers/tsNow';
import {InputNotifyPeer, InputPeerNotifySettings, NotifyPeer, Peer, PeerNotifySettings, Update} from '../../layer';
import {MUTE_UNTIL} from '../mtproto/mtproto_config';
import throttle from '../../helpers/schedulers/throttle';
import convertInputKeyToKey from '../../helpers/string/convertInputKeyToKey';
import {AppManager} from './manager';
import ctx from '../../environment/ctx';
import assumeType from '../../helpers/assumeType';

type ImSadAboutIt = Promise<PeerNotifySettings> | PeerNotifySettings;
type MyNotifyPeer = Exclude<NotifyPeer['_'], 'notifyPeer' | 'notifyForumTopic'>;
type MyInputNotifyPeer = Exclude<InputNotifyPeer['_'], 'inputNotifyPeer' | 'inputNotifyForumTopic'>;
export class AppNotificationsManager extends AppManager {
  private peerSettings = {
    notifyPeer: {} as {[peerId: string]: ImSadAboutIt},
    notifyUsers: null as ImSadAboutIt,
    notifyChats: null as ImSadAboutIt,
    notifyBroadcasts: null as ImSadAboutIt,
    notifyForumTopic: {} as {[peerId_threadId: string]: ImSadAboutIt}
  };
  // private exceptions: {[peerId: string]: PeerNotifySettings} = {};

  private getNotifyPeerTypePromise: Promise<any>;

  private checkMuteUntilTimeout: number;
  private checkMuteUntilThrottled: () => void;

  private notifyContactsSignUp: Promise<boolean>;

  protected after() {
    this.checkMuteUntilThrottled = throttle(this.checkMuteUntil, 1000, false);

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateNotifySettings: (update) => {
        const {peer} = update;
        const isTopic = peer._ === 'notifyForumTopic';
        const isPeerType = peer._ === 'notifyPeer' || isTopic;
        const peerId = isPeerType && this.appPeersManager.getPeerId(peer.peer);
        const key = !isPeerType ? peer._ : undefined;
        this.savePeerSettings({
          key,
          peerId,
          threadId: isTopic ? this.appMessagesIdsManager.generateMessageId(peer.top_msg_id, (peer.peer as Peer.peerChannel).channel_id) : undefined,
          settings: update.notify_settings
        });
        this.rootScope.dispatchEvent('notify_settings', update);
      }
    });

    return this.appStateManager.getState().then((state) => {
      if(state.notifySettings) {
        for(const key in state.notifySettings) {
          assumeType<MyNotifyPeer>(key);
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
    let obj: any = this.peerSettings[key as MyNotifyPeer];

    let peerId: PeerId;
    if(peer._ === 'inputNotifyPeer') {
      peerId = key = this.appPeersManager.getPeerId(peer.peer);
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

    const promises = (['inputNotifyBroadcasts', 'inputNotifyUsers', 'inputNotifyChats'] as MyInputNotifyPeer[])
    .map((inputKey) => {
      return this.getNotifySettings({_: inputKey});
    });

    return this.getNotifyPeerTypePromise = Promise.all(promises);
  }

  public updateNotifySettings(peer: InputNotifyPeer, settings: InputPeerNotifySettings) {
    // this.savePeerSettings(peerId, settings);

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
            _: 'peerNotifySettings'
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

    const p = (peerNotifySettings: ImSadAboutIt): peerNotifySettings is PeerNotifySettings => {
      if(peerNotifySettings instanceof Promise) {
        return false;
      }

      const muteUntil = peerNotifySettings.mute_until;
      if(!muteUntil) {
        return false;
      }

      if(muteUntil <= timestamp) {
        // ! do not delete it because peer's unique settings will be overwritten in getPeerLocalSettings with type's settings
        peerNotifySettings.mute_until = 0;
        return true;
      } else if(muteUntil < closestMuteUntil) {
        closestMuteUntil = muteUntil;
      }

      return false;
    };

    [
      'notifyPeer' as const,
      'notifyForumTopic' as const
    ].forEach((typeKey) => {
      for(const key in this.peerSettings[typeKey]) {
        const peerNotifySettings = this.peerSettings[typeKey][key];
        if(p(peerNotifySettings)) {
          const [peerId, topicId] = key.split('_');
          const peer = this.appPeersManager.getOutputPeer(peerId.toPeerId());
          this.apiUpdatesManager.saveUpdate({
            _: 'updateNotifySettings',
            peer: topicId ? {
              _: 'notifyForumTopic',
              peer,
              top_msg_id: +topicId
            } : {
              _: 'notifyPeer',
              peer
            },
            notify_settings: peerNotifySettings
          });
        }
      }
    });

    const timeout = Math.min(1800e3, (closestMuteUntil - timestamp) * 1000);
    this.checkMuteUntilTimeout = ctx.setTimeout(this.checkMuteUntil, timeout);
  };

  public getPeerKey(peerId: PeerId, threadId?: number) {
    return peerId + (threadId ? '_' + threadId : '');
  }

  public savePeerSettings({key, peerId, threadId, settings}: {
    key?: Exclude<NotifyPeer['_'], 'notifyPeer'>,
    peerId?: PeerId,
    threadId?: number,
    settings: PeerNotifySettings
  }) {
    let obj: any;
    if(peerId) {
      key = this.getPeerKey(peerId, threadId) as any;
      obj = this.peerSettings[threadId ? 'notifyForumTopic' : 'notifyPeer'];
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

    // rootScope.broadcast('notify_settings', {peerId: peerId});
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

  private getPeerLocalSettings({
    peerId,
    respectType = true,
    threadId
  }: {
    peerId: PeerId,
    respectType?: boolean,
    threadId?: number
  }): PeerNotifySettings {
    const n: PeerNotifySettings = {
      _: 'peerNotifySettings'
    };

    const peerKey = this.getPeerKey(peerId, threadId);
    const notifySettings = this.peerSettings[threadId ? 'notifyForumTopic' : 'notifyPeer'][peerKey];
    // if(!notifySettings || (notifySettings instanceof Promise)) return false;
    if(notifySettings && !(notifySettings instanceof Promise)) {
      Object.assign(n, notifySettings);
    }

    if(respectType) {
      const inputNotify = this.appPeersManager.getInputNotifyPeerById({peerId, ignorePeerId: true, threadId});
      const key = convertInputKeyToKey(inputNotify._);
      const typeNotifySettings = this.peerSettings[key as MyNotifyPeer];
      if(typeNotifySettings && !(typeNotifySettings instanceof Promise)) {
        for(const i in typeNotifySettings) {
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

  public validatePeerSettings<T extends Parameters<AppNotificationsManager['getPeerLocalSettings']>[0]>(options: T): T {
    if(options.peerId === this.appPeersManager.peerId) return;
    if(options.threadId && !this.appPeersManager.isForum(options.peerId)) options.threadId = undefined;
    return options;
  }

  public isPeerLocalMuted(options: Parameters<AppNotificationsManager['getPeerLocalSettings']>[0]): boolean {
    if(!(options = this.validatePeerSettings(options))) return false;

    if(options.threadId) {
      const notifySettings = this.getPeerLocalSettings({...options, respectType: false});
      if(notifySettings.silent !== undefined || notifySettings.mute_until !== undefined) {
        return this.isMuted(notifySettings);
      } else {
        return this.isPeerLocalMuted({...options, threadId: undefined});
      }
    }

    const notifySettings = this.getPeerLocalSettings(options);
    const isMuted = this.isMuted(notifySettings);
    return isMuted;
  }
}
