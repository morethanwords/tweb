/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MessageSendingParams} from './appMessagesManager';
import {AppManager} from './manager';
import {AttachMenuBots, AttachMenuBot, Update, DataJSON, InputBotApp, BotApp} from '../../layer';
import assumeType from '../../helpers/assumeType';
import makeError from '../../helpers/makeError';
import getAttachMenuBotIcon from './utils/attachMenuBots/getAttachMenuBotIcon';
import getServerMessageId from './utils/messageId/getServerMessageId';
import {randomLong} from '../../helpers/random';

const BOTS_SUPPORTED = true;

export type RequestWebViewOptions = MessageSendingParams & {
  botId: BotId,
  peerId: PeerId,
  // platform: string,
  startParam?: string,
  fromBotMenu?: boolean,
  fromAttachMenu?: boolean,
  fromSwitchWebView?: boolean,
  attachMenuBot?: AttachMenuBot,
  url?: string,
  themeParams?: DataJSON,
  isSimpleWebView?: boolean,
  buttonText?: string,
  writeAllowed?: boolean,
  app?: BotApp.botApp
};

export default class AppAttachMenuBotsManager extends AppManager {
  private attachMenuBots: Map<BotId, AttachMenuBot>;
  private attachMenuBotsArr: AttachMenuBot[];

  protected after() {
    this.clear(true);

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateAttachMenuBots: this.onUpdateAttachMenuBots,

      updateWebViewResultSent: this.onUpdateWebViewResultSent
    });
  }

  public clear = (init = false) => {
    if(!init) {
      this.attachMenuBots.clear();
      this.attachMenuBotsArr = undefined;
    } else {
      this.attachMenuBots = new Map();
    }
  };

  private onUpdateAttachMenuBots = (update: Update.updateAttachMenuBots) => {
    this.clear();
    this.getAttachMenuBots();
  };

  private onUpdateWebViewResultSent = (update: Update.updateWebViewResultSent) => {
    this.rootScope.dispatchEvent('web_view_result_sent', update.query_id);
  };

  public saveAttachMenuBot(attachMenuBot: AttachMenuBot) {
    this.attachMenuBots.set(attachMenuBot.bot_id, attachMenuBot);
    const icon = getAttachMenuBotIcon(attachMenuBot);
    icon.icon = this.appDocsManager.saveDoc(icon.icon, {type: 'attachMenuBotIcon', botId: attachMenuBot.bot_id});
    this.rootScope.dispatchEvent('attach_menu_bot', attachMenuBot);
    return attachMenuBot;
  }

  public saveAttachMenuBots(attachMenuBots: AttachMenuBot[]) {
    if((attachMenuBots as any).saved) return;
    (attachMenuBots as any).saved = true;
    attachMenuBots.forEach((user) => this.saveAttachMenuBot(user));
  }

  public getAttachMenuBots() {
    return this.attachMenuBotsArr ?? this.apiManager.invokeApiSingleProcess({
      method: 'messages.getAttachMenuBots',
      processResult: (attachMenuBots) => {
        assumeType<AttachMenuBots.attachMenuBots>(attachMenuBots);
        this.appUsersManager.saveApiUsers(attachMenuBots.users);
        this.saveAttachMenuBots(attachMenuBots.bots);
        return this.attachMenuBotsArr = attachMenuBots.bots.slice(0, BOTS_SUPPORTED ? undefined : 0);
      }
    });
  }

  public getAttachMenuBotCached(botId: BotId) {
    return this.attachMenuBots.get(botId);
  }

  public getAttachMenuBot(botId: BotId, overwrite?: boolean) {
    if(!this.appUsersManager.isAttachMenuBot(botId) || !BOTS_SUPPORTED) {
      throw makeError('BOT_INVALID');
    }

    return (!overwrite && this.getAttachMenuBotCached(botId)) ?? this.apiManager.invokeApiSingleProcess({
      method: 'messages.getAttachMenuBot',
      params: {
        bot: this.appUsersManager.getUserInput(botId)
      },
      processResult: (attachMenuBotsBot) => {
        this.appUsersManager.saveApiUsers(attachMenuBotsBot.users);
        const attachMenuBot = this.saveAttachMenuBot(attachMenuBotsBot.bot);
        return attachMenuBot;
      }
    });
  }

  public requestWebView(options: RequestWebViewOptions) {
    const {
      botId,
      peerId,
      url,
      fromBotMenu,
      fromSwitchWebView,
      themeParams,
      // platform,
      replyToMsgId,
      silent,
      sendAsPeerId,
      startParam,
      threadId,
      isSimpleWebView,
      app,
      writeAllowed
    } = options;

    const platform = 'web';

    if(app) {
      return this.apiManager.invokeApiSingleProcess({
        method: 'messages.requestAppWebView',
        params: {
          peer: this.appPeersManager.getInputPeerById(peerId),
          start_param: startParam,
          theme_params: themeParams,
          platform,
          write_allowed: writeAllowed,
          app: {
            _: 'inputBotAppID',
            access_hash: app.access_hash,
            id: app.id
          }
        },
        processResult: (result) => {
          return result;
        }
      });
    }

    if(isSimpleWebView) {
      return this.apiManager.invokeApiSingleProcess({
        method: 'messages.requestSimpleWebView',
        params: {
          bot: this.appUsersManager.getUserInput(botId),
          url,
          platform,
          from_switch_webview: fromSwitchWebView,
          theme_params: themeParams
        },
        processResult: (result) => {
          return result;
        }
      });
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.requestWebView',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        bot: this.appUsersManager.getUserInput(botId),
        silent,
        platform,
        url,
        reply_to_msg_id: replyToMsgId ? getServerMessageId(replyToMsgId) : undefined,
        from_bot_menu: fromBotMenu,
        theme_params: themeParams,
        send_as: sendAsPeerId ? this.appPeersManager.getInputPeerById(sendAsPeerId) : undefined,
        start_param: startParam,
        top_msg_id: threadId ? getServerMessageId(threadId) : undefined
      },
      processResult: (result) => {
        return result;
      }
    });
  }

  public prolongWebView(options: MessageSendingParams & {
    peerId: PeerId,
    botId: BotId,
    queryId: string | number
  }) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.prolongWebView',
      params: {
        peer: this.appPeersManager.getInputPeerById(options.peerId),
        bot: this.appUsersManager.getUserInput(options.botId),
        query_id: options.queryId,
        silent: options.silent,
        reply_to_msg_id: options.replyToMsgId ? getServerMessageId(options.replyToMsgId) : undefined,
        send_as: options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined,
        top_msg_id: options.threadId ? getServerMessageId(options.threadId) : undefined
      },
      processResult: (result) => {
        return result;
      }
    });
  }

  public toggleBotInAttachMenu(botId: BotId, enabled: boolean, writeAllowed?: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.toggleBotInAttachMenu',
      params: {
        bot: this.appUsersManager.getUserInput(botId),
        enabled,
        write_allowed: writeAllowed
      },
      processResult: (result) => {
        return result;
        // this.apiUpdatesManager.processLocalUpdate({_: 'updateAttachMenuBots'});
      }
    });
  }

  public sendWebViewData(botId: BotId, buttonText: string, data: string) {
    return this.apiManager.invokeApi('messages.sendWebViewData', {
      bot: this.appUsersManager.getUserInput(botId),
      button_text: buttonText,
      data,
      random_id: randomLong()
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public getBotApp(botId: BotId, shortName: string) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.getBotApp',
      params: {
        app: {
          _: 'inputBotAppShortName',
          bot_id: this.appUsersManager.getUserInput(botId),
          short_name: shortName
        },
        hash: 0
      },
      processResult: (result) => {
        return result;
      }
    });
  }
}
