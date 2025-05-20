/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MessageSendingParams} from './appMessagesManager';
import {AppManager} from './manager';
import {AttachMenuBots, AttachMenuBot, Update, DataJSON, BotApp} from '../../layer';
import assumeType from '../../helpers/assumeType';
import makeError from '../../helpers/makeError';
import getAttachMenuBotIcon from './utils/attachMenuBots/getAttachMenuBotIcon';
import {randomLong} from '../../helpers/random';
import {ReferenceContext} from '../mtproto/referenceDatabase';

const BOTS_SUPPORTED = true;

export type RequestWebViewOptions = MessageSendingParams & {
  botId: BotId,
  peerId: PeerId,
  // platform: string,
  startParam?: string,
  fromBotMenu?: boolean,
  fromAttachMenu?: boolean,
  fromSwitchWebView?: boolean,
  fromSideMenu?: boolean,
  attachMenuBot?: AttachMenuBot,
  url?: string,
  themeParams?: DataJSON,
  isSimpleWebView?: boolean,
  buttonText?: string,
  writeAllowed?: boolean,
  app?: BotApp.botApp,
  noConfirmation?: boolean,
  hasSettings?: boolean,
  main?: boolean,
  compact?: boolean,
  fullscreen?: boolean,
  masked?: boolean
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

    this.rootScope.addEventListener('user_auth', () => {
      this.appAttachMenuBotsManager.getAttachMenuBots();

      setInterval(() => {
        this.onUpdateAttachMenuBots({_: 'updateAttachMenuBots'});
      }, 30 * 60e3);
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

  public onLanguageChange() {
    if(!this.attachMenuBots?.size) {
      return;
    }

    this.onUpdateAttachMenuBots({_: 'updateAttachMenuBots'});
  }

  public saveAttachMenuBot(attachMenuBot: AttachMenuBot) {
    this.attachMenuBots.set(attachMenuBot.bot_id, attachMenuBot);
    const menuBotIcon = getAttachMenuBotIcon(attachMenuBot);
    if(menuBotIcon) {
      menuBotIcon.icon = this.appDocsManager.saveDoc(menuBotIcon.icon, {type: 'attachMenuBotIcon', botId: attachMenuBot.bot_id});
      this.apiFileManager.downloadMedia({media: menuBotIcon.icon});
    }
    this.rootScope.dispatchEvent('attach_menu_bot', attachMenuBot);
    return attachMenuBot;
  }

  public saveAttachMenuBots(attachMenuBots: AttachMenuBot[]) {
    if((attachMenuBots as any).saved) return;
    (attachMenuBots as any).saved = true;
    attachMenuBots.forEach((user) => this.saveAttachMenuBot(user));
  }

  public saveBotApp(botId: BotId, botApp: BotApp) {
    if(!botApp) {
      return;
    }

    assumeType<BotApp.botApp>(botApp);

    const referenceContext: ReferenceContext = {
      type: 'botApp',
      botId,
      appName: botApp.short_name
    };

    botApp.photo = this.appPhotosManager.savePhoto(botApp.photo, referenceContext);
    botApp.document = this.appDocsManager.saveDoc(botApp.document, referenceContext);

    return botApp;
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
      fromSideMenu,
      themeParams = this.apiManager.getThemeParams(),
      // platform,
      silent,
      sendAsPeerId,
      startParam,
      isSimpleWebView,
      app,
      writeAllowed,
      main,
      compact,
      fullscreen
    } = options;

    const platform = 'web';

    const commonOptions = {
      start_param: startParam,
      theme_params: themeParams,
      compact,
      fullscreen,
      platform
    };

    if(app) {
      return this.apiManager.invokeApiSingleProcess({
        method: 'messages.requestAppWebView',
        params: {
          ...commonOptions,
          peer: this.appPeersManager.getInputPeerById(peerId),
          write_allowed: writeAllowed,
          app: {
            _: 'inputBotAppID',
            access_hash: app.access_hash,
            id: app.id
          }
        }
      });
    }

    if(isSimpleWebView) {
      return this.apiManager.invokeApiSingleProcess({
        method: 'messages.requestSimpleWebView',
        params: {
          ...commonOptions,
          bot: this.appUsersManager.getUserInput(botId),
          url,
          from_switch_webview: fromSwitchWebView,
          from_side_menu: fromSideMenu
        }
      });
    }

    if(main) {
      return this.apiManager.invokeApiSingleProcess({
        method: 'messages.requestMainWebView',
        params: {
          ...commonOptions,
          peer: this.appPeersManager.getInputPeerById(peerId),
          bot: this.appUsersManager.getUserInput(botId)
        }
      });
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.requestWebView',
      params: {
        ...commonOptions,
        peer: this.appPeersManager.getInputPeerById(peerId),
        bot: this.appUsersManager.getUserInput(botId),
        silent,
        url,
        reply_to: this.appMessagesManager.getInputReplyTo(options),
        from_bot_menu: fromBotMenu,
        send_as: sendAsPeerId ? this.appPeersManager.getInputPeerById(sendAsPeerId) : undefined
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
        reply_to: this.appMessagesManager.getInputReplyTo(options),
        send_as: options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined
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
      }/* ,
      processResult: (result) => {
        return result;
        // this.apiUpdatesManager.processLocalUpdate({_: 'updateAttachMenuBots'});
      } */
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
      processResult: (messagesBotApp) => {
        messagesBotApp.app = this.saveBotApp(botId, messagesBotApp.app);
        return messagesBotApp;
      }
    });
  }

  public getPopularAppBots(offset: string = '', limit: number = 50) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'bots.getPopularAppBots',
      params: {
        limit,
        offset
      },
      processResult: (popularAppBots) => {
        this.appPeersManager.saveApiPeers(popularAppBots);
        return {
          nextOffset: popularAppBots.next_offset,
          userIds: popularAppBots.users.map((user) => user.id)
        };
      }
    });
  }

  public invokeWebViewCustomMethod(botId: BotId, customMethod: string, params: string) {
    return this.apiManager.invokeApi('bots.invokeWebViewCustomMethod', {
      bot: this.appUsersManager.getUserInput(botId),
      custom_method: customMethod,
      params: {
        _: 'dataJSON',
        data: JSON.stringify(params)
      }
    });
  }
}
