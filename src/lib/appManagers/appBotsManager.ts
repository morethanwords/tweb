/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AppManager} from './manager';

export default class AppBotsManager extends AppManager {
  public canSendMessage(botId: BotId) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'bots.canSendMessage',
      params: {
        bot: this.appUsersManager.getUserInput(botId)
      }
    });
  }

  public allowSendMessage(botId: BotId) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'bots.allowSendMessage',
      params: {
        bot: this.appUsersManager.getUserInput(botId)
      },
      processResult: (updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      }
    });
  }
}
