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
  public getBroadcastStats(chatId: ChatId, dcId?: DcId): Promise<{stats: StatsBroadcastStats, dcId: DcId}> {
    if(dcId === undefined) {
      return callbackify(this.appProfileManager.getChatFull(chatId), async(chatFull) => {
        let dcId = (chatFull as ChatFull.channelFull).stats_dc;
        if(dcId === undefined) {
          dcId = await this.apiManager.getBaseDcId();
        }

        return this.getBroadcastStats(chatId, dcId);
      });
    }

    const options: InvokeApiOptions = {dcId};
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.getBroadcastStats',
      params: {
        channel: this.appChatsManager.getChannelInput(chatId)
      },
      processResult: (stats) => {
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
}
