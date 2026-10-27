import {Boost, PremiumMyBoosts} from '@layer';
import {AppManager} from '@appManagers/manager';
import getPeerId from '@appManagers/utils/peers/getPeerId';

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

  // * the last known: where each slot stood before a boost moves it elsewhere
  private myBoosts: PremiumMyBoosts;

  public getMyBoosts() {
    return this.apiManager.invokeApiSingleProcess({
      method: 'premium.getMyBoosts',
      processResult: (myBoosts) => {
        this.appPeersManager.saveApiPeers(myBoosts);
        return this.myBoosts = myBoosts;
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
      },
      processResult: (myBoosts) => {
        this.appPeersManager.saveApiPeers(myBoosts);
        // * the boosts given to a group are on its full chat, and enough of them lift its restrictions: the
        // * group boosted, and every group the slots were taken from, are asked for it again
        const peerIds = new Set<PeerId>([peerId]);
        this.myBoosts?.my_boosts.forEach((myBoost) => {
          if(myBoost.peer && slots?.includes(myBoost.slot)) {
            peerIds.add(getPeerId(myBoost.peer));
          }
        });

        this.myBoosts = myBoosts;
        peerIds.forEach((peerId) => {
          if(this.appPeersManager.isMegagroup(peerId)) {
            this.appProfileManager.getChatFull(peerId.toChatId(), true);
          }
        });

        return myBoosts;
      }
    });
  }
}
