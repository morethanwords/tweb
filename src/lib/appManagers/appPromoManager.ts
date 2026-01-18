/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ctx from '@environment/ctx';
import tsNow from '@helpers/tsNow';
import {HelpPromoData} from '@layer';
import {AppManager} from '@appManagers/manager';

export interface MyPromoData {
  pendingSuggestions: string[];
}

export default class AppPromoManager extends AppManager {
  private promoData: HelpPromoData;
  private myPromoData: MyPromoData;

  private refetchTimeout: number;
  private pendingDismissed = new Set<string>();

  public async getPromoData(force = false): Promise<MyPromoData> {
    if(!force && this.promoData && this.promoData.expires > tsNow(true)) {
      return this.myPromoData;
    };

    if(this.refetchTimeout) {
      ctx.clearTimeout(this.refetchTimeout);
      this.refetchTimeout = undefined;
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'help.getPromoData',
      processResult: (promoData) => {
        if(promoData._ === 'help.promoData') {
          this.appPeersManager.saveApiPeers(promoData);
        }

        this.setPromoData(promoData);

        this.refetchTimeout = ctx.setTimeout(() => {
          this.getPromoData(true);
        }, promoData.expires * 1000 - tsNow());

        return this.myPromoData;
      }
    });
  }

  private setPromoData(promoData: HelpPromoData) {
    this.promoData = promoData;

    const pendingSuggestions = [];
    if(promoData._ === 'help.promoData') {
      for(const suggestion of promoData.pending_suggestions) {
        if(this.pendingDismissed.has(suggestion)) continue;
        pendingSuggestions.push(suggestion);
      }
    }

    this.myPromoData = {pendingSuggestions};

    this.rootScope.dispatchEvent('promo_data_update', this.myPromoData);
  }

  public dismissSuggestion(suggestion: string) {
    if(this.pendingDismissed.has(suggestion)) return;

    this.pendingDismissed.add(suggestion);

    this.apiManager.invokeApiSingleProcess({
      method: 'help.dismissSuggestion',
      params: {suggestion, peer: {_: 'inputPeerEmpty'}}
    }).then((result) => {
      if(!result) return;

      if(this.promoData?._ === 'help.promoData') {
        this.setPromoData({
          ...this.promoData,
          pending_suggestions: this.promoData.pending_suggestions.filter((s) => s !== suggestion)
        })
      }
    }).catch(() => {
      this.pendingDismissed.delete(suggestion);
    });
  }
}
