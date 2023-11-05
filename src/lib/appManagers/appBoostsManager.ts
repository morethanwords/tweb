/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AppManager} from './manager';

export default class AppBoostsManager extends AppManager {
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

  public applyBoost(peerId: PeerId) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'premium.applyBoost',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId)
      }
    });
  }
}
