/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import callbackify from '../../helpers/callbackify';
import {ChatFull, StatsBroadcastStats} from '../../layer';
import {DcId, InvokeApiOptions} from '../../types';
import {AppManager} from './manager';

export default class AppStoriesManager extends AppManager {
  private async getInvokeOptions(chatId: ChatId, dcId?: DcId) {
    dcId ??= await callbackify(this.appProfileManager.getChatFull(chatId), async(chatFull) => {
      let dcId = (chatFull as ChatFull.channelFull).stats_dc;
      if(dcId === undefined) {
        dcId = await this.apiManager.getBaseDcId();
      }

      return dcId;
    });

    const options: InvokeApiOptions = {dcId};
    return options;
  }

  public async getBroadcastStats(chatId: ChatId, dark?: boolean, dcId?: DcId): Promise<{stats: StatsBroadcastStats, dcId: DcId}> {
    const options = await this.getInvokeOptions(chatId, dcId);
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.getBroadcastStats',
      params: {
        channel: this.appChatsManager.getChannelInput(chatId),
        dark
      },
      processResult: (stats) => {
        stats.recent_posts_interactions.forEach((postInteractionCounters) => {
          if(postInteractionCounters._ === 'postInteractionCountersMessage') {
            postInteractionCounters.msg_id = this.appMessagesIdsManager.generateMessageId(postInteractionCounters.msg_id, chatId);
          }
        });

        return {
          stats,
          dcId: options.dcId
        };
      },
      options
    });
  }

  public loadAsyncGraph(token: string, x?: Long, dcId?: DcId) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.loadAsyncGraph',
      params: {
        token,
        x
      },
      options: {dcId}
    });
  }

  public async getMegagroupStats(chatId: ChatId, dark?: boolean, dcId?: DcId) {
    const options = await this.getInvokeOptions(chatId, dcId);
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.getMegagroupStats',
      params: {
        channel: this.appChatsManager.getChannelInput(chatId),
        dark
      },
      processResult: (stats) => {
        this.appPeersManager.saveApiPeers(stats);

        return {
          stats,
          dcId: options.dcId
        };
      },
      options
    });
  }
}
