/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MessageSendingParams} from './appMessagesManager';
import {AppManager} from './manager';
import {AttachMenuBots, AttachMenuBot, Update, DataJSON} from '../../layer';
import assumeType from '../../helpers/assumeType';
import makeError from '../../helpers/makeError';
import getAttachMenuBotIcon from './utils/attachMenuBots/getAttachMenuBotIcon';
import getServerMessageId from './utils/messageId/getServerMessageId';

const BOTS_SUPPORTED = false;

export default class AppAttachMenuBotsManager extends AppManager {
  private attachMenuBots: Map<BotId, AttachMenuBot>;
  private attachMenuBotsArr: AttachMenuBot[];

  protected after() {
    this.clear(true);

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateAttachMenuBots: this.onUpdateAttachMenuBots
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

  public saveAttachMenuBot(attachMenuBot: AttachMenuBot) {
    this.attachMenuBots.set(attachMenuBot.bot_id, attachMenuBot);
    const icon = getAttachMenuBotIcon(attachMenuBot);
    icon.icon = this.appDocsManager.saveDoc(icon.icon, {type: 'attachMenuBotIcon', botId: attachMenuBot.bot_id});
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

  public requestWebView(options: MessageSendingParams & {
    botId: BotId,
    peerId: PeerId,
    // platform: string,
    startParam?: string,
    fromBotMenu?: boolean,
    url?: string,
    themeParams?: DataJSON
  }) {
    const {
      botId,
      peerId,
      url,
      fromBotMenu,
      themeParams,
      // platform,
      replyToMsgId,
      silent,
      sendAsPeerId,
      startParam,
      threadId
    } = options;

    const platform = 'web';

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
        console.log(result);
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
        console.log(result);
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
      processResult: () => {
        this.apiUpdatesManager.processLocalUpdate({_: 'updateAttachMenuBots'});
      }
    });
  }
}
