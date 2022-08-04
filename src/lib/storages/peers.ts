/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import applyMixins from '../../helpers/applyMixins';
import EventListenerBase from '../../helpers/eventListenerBase';
import {AppManager} from '../appManagers/manager';

export type StatePeerType = 'recentSearch' | 'topPeer' | 'dialog' | 'contact' | 'topMessage' | 'self';

type PeersStorageKey = `${StatePeerType}_${string | PeerId}` | StatePeerType;

class PeersStorage {
  private neededPeers: Map<PeerId, Set<PeersStorageKey>> = new Map();
  private singlePeerMap: Map<PeersStorageKey, Set<PeerId>> = new Map();

  constructor() {
    this._constructor(false);
  }

  protected after() {
    this.rootScope.addEventListener('user_auth', () => {
      this.requestPeer(this.appPeersManager.peerId, 'self');
    });
  }

  public requestPeer(peerId: PeerId, key: PeersStorageKey) {
    let set = this.neededPeers.get(peerId);
    if(set && set.has(key)) {
      return;
    }

    if(!set) {
      set = new Set();
      this.neededPeers.set(peerId, set);
    }

    set.add(key);

    this.dispatchEvent('peerNeeded', peerId);
  }

  public releasePeer(peerId: PeerId, key: PeersStorageKey) {
    const set = this.neededPeers.get(peerId);
    if(!set) {
      return;
    }

    set.delete(key);

    if(!set.size) {
      this.neededPeers.delete(peerId);
      this.dispatchEvent('peerUnneeded', peerId);
    }
  }

  public requestPeersForKey(peerIds: Set<PeerId> | number[], key: PeersStorageKey) {
    if(Array.isArray(peerIds)) {
      peerIds = new Set(peerIds);
    }

    let set = this.singlePeerMap.get(key);
    if(set) {
      for(const peerId of set) {
        if(peerIds.has(peerId)) {
          continue;
        }

        this.releasePeer(peerId, key);
        set.delete(peerId);
      }

      if(!set.size && !peerIds.size) {
        this.singlePeerMap.delete(key);
        return;
      }
    }

    if(peerIds.size) {
      if(!set) {
        set = new Set();
        this.singlePeerMap.set(key, set);
      }

      for(const peerId of peerIds) {
        if(set.has(peerId)) {
          continue;
        }

        this.requestPeer(peerId, key);
        set.add(peerId);
      }
    }
  }

  public isPeerNeeded(peerId: PeerId) {
    return this.neededPeers.has(peerId);
  }
}

interface PeersStorage extends EventListenerBase<{
  peerNeeded: (peerId: PeerId) => void,
  peerUnneeded: (peerId: PeerId) => void,
}>, AppManager {}
applyMixins(PeersStorage, [EventListenerBase, AppManager]);

export default PeersStorage;
