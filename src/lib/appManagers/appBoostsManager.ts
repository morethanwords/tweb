/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Boost} from '../../layer';
import {AppManager} from './manager';

export default class AppBoostsManager extends AppManager {
  public saveBoost(peerId: PeerId, boost: Boost) {
    if(boost.giveaway_msg_id) {
      boost.giveaway_msg_id = this.appMessagesIdsManager.generateMessageId(
        boost.giveaway_msg_id,
        this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined
      );
    }

    return boost;
  }

  public saveBoosts(peerId: PeerId, boosts: Boost[]) {
    if(!boosts || (boosts as any).saved) return boosts;
    (boosts as any).saved = true;
    boosts.forEach((boost, idx, arr) => {
      arr[idx] = this.saveBoost(peerId, boost);
    });

    return boosts;
  }

  public getBoostsList({
    peerId,
    limit,
    offset,
    gifts
  }: {
    peerId: PeerId,
    limit: number,
    offset: string,
    gifts?: boolean
  }) {
    return this.apiManager.invokeApi('premium.getBoostsList', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      limit,
      offset,
      gifts
    }).then((boostsList) => {
      this.appPeersManager.saveApiPeers(boostsList);
      boostsList.boosts = this.saveBoosts(peerId, boostsList.boosts);
      return boostsList;
    });
  }

  public getMyBoosts() {
    return this.apiManager.invokeApiSingleProcess({
      method: 'premium.getMyBoosts',
      processResult: (myBoosts) => {
        this.appPeersManager.saveApiPeers(myBoosts);
        return myBoosts;
      }
    });
  }

  public getBoostsStatus(peerId: PeerId) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'premium.getBoostsStatus',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId)
      }
    });
  }

  // public canApplyBoost(peerId: PeerId) {
  //   return this.apiManager.invokeApiSingleProcess({
  //     method: 'stories.canApplyBoost',
  //     params: {
  //       peer: this.appPeersManager.getInputPeerById(peerId)
  //     },
  //     processResult: (storiesCanApplyBoostResult) => {
  //       this.appPeersManager.saveApiPeers(storiesCanApplyBoostResult as StoriesCanApplyBoostResult.storiesCanApplyBoostReplace);
  //       return storiesCanApplyBoostResult;
  //     },
  //     options: {
  //       floodMaxTimeout: 0
  //     }
  //   });
  // }

  public applyBoost(peerId: PeerId, slots?: number[]) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'premium.applyBoost',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        slots
      }
    });
  }
}
