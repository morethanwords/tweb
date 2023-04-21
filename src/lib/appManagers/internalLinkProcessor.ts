/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type AppMediaViewerBase from '../../components/appMediaViewerBase';
import PopupElement from '../../components/popups';
import PopupSharedFolderInvite from '../../components/popups/sharedFolderInvite';
import PopupJoinChatInvite from '../../components/popups/joinChatInvite';
import PopupPayment from '../../components/popups/payment';
import PopupPeer from '../../components/popups/peer';
import PopupPickUser from '../../components/popups/pickUser';
import PopupStickers from '../../components/popups/stickers';
import {toastNew, toast} from '../../components/toast';
import {MOUNT_CLASS_TO} from '../../config/debug';
import IS_GROUP_CALL_SUPPORTED from '../../environment/groupCallSupport';
import addAnchorListener from '../../helpers/addAnchorListener';
import assumeType from '../../helpers/assumeType';
import findUpClassName from '../../helpers/dom/findUpClassName';
import {ChatInvite, User, AttachMenuPeerType, MessagesBotApp, BotApp, ChatlistsChatlistInvite} from '../../layer';
import {i18n, LangPackKey, _i18n} from '../langPack';
import {PHONE_NUMBER_REG_EXP} from '../richTextProcessor';
import {isWebAppNameValid} from '../richTextProcessor/validators';
import appImManager from './appImManager';
import {INTERNAL_LINK_TYPE, InternalLinkTypeMap, InternalLink} from './internalLink';
import {AppManagers} from './managers';

export class InternalLinkProcessor {
  protected managers: AppManagers;

  public construct(managers: AppManagers) {
    this.managers = managers;

    addAnchorListener<{}>({
      name: 'showMaskedAlert',
      callback: (params, element) => {
        const href = element.href;

        const a = element.cloneNode(true) as HTMLAnchorElement;
        a.className = 'anchor-url';
        a.innerText = href;
        a.removeAttribute('onclick');

        const popup = PopupElement.createPopup(PopupPeer, 'popup-masked-url', {
          titleLangKey: 'OpenUrlTitle',
          descriptionLangKey: 'OpenUrlAlert2',
          descriptionLangArgs: [a],
          buttons: [{
            langKey: 'Open',
            callback: () => {
              a.click();
            }
          }]
        })

        popup.show();
        return popup;
      }
    });

    addAnchorListener<{uriParams: {command: string, bot: string}}>({
      name: 'execBotCommand',
      callback: ({uriParams}) => {
        const {command, bot} = uriParams;

        /* const promise = bot ? this.openUsername(bot).then(() => this.chat.peerId) : Promise.resolve(this.chat.peerId);
        promise.then((peerId) => {
          this.managers.appMessagesManager.sendText(peerId, '/' + command);
        }); */

        return this.managers.appMessagesManager.sendText(appImManager.chat.peerId, '/' + command + (bot ? '@' + bot : ''));
      }
    });

    addAnchorListener<{uriParams: {hashtag: string}}>({
      name: 'searchByHashtag',
      callback: ({uriParams}) => {
        const {hashtag} = uriParams;
        if(!hashtag) {
          return;
        }

        return appImManager.chat.initSearch('#' + hashtag + ' ');
      }
    });

    addAnchorListener<{}>({
      name: 'setMediaTimestamp',
      callback: (_, element) => {
        const timestamp = +element.dataset.timestamp;
        const bubble = findUpClassName(element, 'bubble');
        if(bubble) {
          appImManager.chat.bubbles.playMediaWithTimestamp(element, timestamp);
          return;
        }

        if(findUpClassName(element, 'media-viewer-caption')) {
          const appMediaViewer = (window as any).appMediaViewer as AppMediaViewerBase<any, any, any>;
          return appMediaViewer.setMediaTimestamp(timestamp);
        }
      }
    });

    ([
      ['addstickers', INTERNAL_LINK_TYPE.STICKER_SET],
      ['addemoji', INTERNAL_LINK_TYPE.EMOJI_SET]
    ] as [
      'addstickers' | 'addemoji',
      INTERNAL_LINK_TYPE.STICKER_SET | INTERNAL_LINK_TYPE.EMOJI_SET
    ][]).forEach(([name, type]) => {
      addAnchorListener<{pathnameParams: [typeof name, string]}>({
        name,
        callback: ({pathnameParams}) => {
          if(!pathnameParams[1]) {
            return;
          }

          const link: InternalLink = {
            _: type,
            set: pathnameParams[1]
          };

          return this.processInternalLink(link);
        }
      });

      addAnchorListener<{
        uriParams: {
          set: string
        }
      }>({
        name,
        protocol: 'tg',
        callback: ({uriParams}) => {
          const link = this.makeLink(type, uriParams);
          return this.processInternalLink(link);
        }
      });
    });

    // * t.me/invoice/asdasdad
    // * t.me/$asdasdad
    addAnchorListener<{pathnameParams: ['invoice', string] | string}>({
      name: 'invoice',
      callback: ({pathnameParams}) => {
        const link: InternalLink = {
          _: INTERNAL_LINK_TYPE.INVOICE,
          slug: pathnameParams.length > 1 ? pathnameParams[1] : pathnameParams[0].slice(1)
        };

        return this.processInternalLink(link);
      }
    });

    // t.me/addlist/adasdasd
    addAnchorListener<{pathnameParams: ['folder', string]}>({
      name: 'addlist',
      callback: ({pathnameParams}) => {
        const link: InternalLink = {
          _: INTERNAL_LINK_TYPE.ADD_LIST,
          slug: pathnameParams[1]
        };

        return this.processInternalLink(link);
      }
    });

    // Support old t.me/joinchat/asd and new t.me/+asd
    addAnchorListener<{pathnameParams: ['joinchat', string]}>({
      name: 'joinchat',
      callback: ({pathnameParams}) => {
        const link: InternalLink = {
          _: INTERNAL_LINK_TYPE.JOIN_CHAT,
          invite: pathnameParams[1] || decodeURIComponent(pathnameParams[0]).slice(1)
        };

        return this.processInternalLink(link);
      }
    });

    if(IS_GROUP_CALL_SUPPORTED) {
      addAnchorListener<{
        uriParams: Omit<InternalLink.InternalLinkVoiceChat, '_'>
      }>({
        name: 'voicechat',
        protocol: 'tg',
        callback: ({uriParams}) => {
          const link = this.makeLink(INTERNAL_LINK_TYPE.VOICE_CHAT, uriParams);
          return this.processInternalLink(link);
        }
      });
    }

    type K1 = {thread?: string, comment?: string, t?: string};
    type K2 = {thread?: string, comment?: string, start?: string, t?: string};
    type K3 = {startattach?: string, attach?: string, choose?: TelegramChoosePeerType};
    type K4 = {startapp?: string};

    addAnchorListener<{
    //   pathnameParams: ['c', string, string],
    //   uriParams: {thread?: number}
    // } | {
    //   pathnameParams: [string, string?],
    //   uriParams: {comment?: number}
      pathnameParams: ['c', string, string] | [string, string?],
      uriParams: K1 | K2 | K3 | K4
    }>({
      name: 'im',
      callback: async({pathnameParams, uriParams}, element, masked) => {
        let link: InternalLink;
        if(PHONE_NUMBER_REG_EXP.test(pathnameParams[0])) {
          link = {
            _: INTERNAL_LINK_TYPE.USER_PHONE_NUMBER,
            phone: pathnameParams[0].slice(1)
          };
        } else if(pathnameParams[0] === 'c') {
          assumeType<K1>(uriParams);
          pathnameParams.shift();
          const thread = 'thread' in uriParams ? uriParams.thread : pathnameParams[2] && pathnameParams[1];
          link = {
            _: INTERNAL_LINK_TYPE.PRIVATE_POST,
            channel: pathnameParams[0],
            post: pathnameParams[2] || pathnameParams[1],
            thread,
            comment: uriParams.comment,
            stack: appImManager.getStackFromElement(element),
            t: uriParams.t
          };
        } else if(pathnameParams[1] && isWebAppNameValid(pathnameParams[1])) {
          assumeType<K4>(uriParams);
          link = {
            _: INTERNAL_LINK_TYPE.WEB_APP,
            domain: pathnameParams[0],
            appname: pathnameParams[1],
            startapp: uriParams.startapp,
            masked
          };
        } else {
          assumeType<K2>(uriParams);
          const thread = 'thread' in uriParams ? uriParams.thread : pathnameParams[2] && pathnameParams[1];
          link = {
            _: INTERNAL_LINK_TYPE.MESSAGE,
            domain: pathnameParams[0],
            post: pathnameParams[2] || pathnameParams[1],
            thread,
            comment: uriParams.comment,
            start: 'start' in uriParams ? uriParams.start : undefined,
            stack: appImManager.getStackFromElement(element),
            t: uriParams.t
          };
        }

        if('startattach' in uriParams || 'attach' in uriParams) {
          assumeType<K3>(uriParams);
          link = {
            _: INTERNAL_LINK_TYPE.ATTACH_MENU_BOT,
            nestedLink: link,
            ...uriParams
          };
        }

        return this.processInternalLink(link);
      }
    });

    addAnchorListener<{
      uriParams: {
        domain: string,

        // telegrampassport
        scope?: string,
        nonce?: string,
        payload?: string,
        bot_id?: string,
        public_key?: string,
        callback_url?: string,

        // regular
        start?: string,
        startgroup?: string,
        game?: string,
        voicechat?: string,
        post?: string,
        thread?: string,
        comment?: string,
        phone?: string,
        t?: string,
        attach?: string,
        startattach?: string,
        choose?: TelegramChoosePeerType,
        appname?: string,
        startapp?: string
      }
    }>({
      name: 'resolve',
      protocol: 'tg',
      callback: ({uriParams}, element, masked) => {
        let link: InternalLink;
        if(uriParams.phone) {
          link = this.makeLink(INTERNAL_LINK_TYPE.USER_PHONE_NUMBER, uriParams as Required<typeof uriParams>);
        } else if(uriParams.domain === 'telegrampassport') {

        } else if(uriParams.appname) {
          link = this.makeLink(INTERNAL_LINK_TYPE.WEB_APP, {
            masked,
            ...uriParams as Required<typeof uriParams>
          });
        } else {
          link = this.makeLink(INTERNAL_LINK_TYPE.MESSAGE, {
            ...uriParams,
            stack: appImManager.getStackFromElement(element)
          });
        }

        if(uriParams.attach !== undefined || uriParams.startattach !== undefined) {
          const nestedLink = link;
          link = this.makeLink(INTERNAL_LINK_TYPE.ATTACH_MENU_BOT, uriParams as Required<typeof uriParams>);
          link.nestedLink = nestedLink;
        }

        return this.processInternalLink(link);
      }
    });

    addAnchorListener<{
      uriParams: {
        channel: string,
        post: string,
        thread?: string,
        comment?: string
      }
    }>({
      name: 'privatepost',
      protocol: 'tg',
      callback: ({uriParams}) => {
        const link = this.makeLink(INTERNAL_LINK_TYPE.PRIVATE_POST, uriParams);
        return this.processInternalLink(link);
      }
    });

    // tg://invoice?slug=asdasd
    addAnchorListener<{
      uriParams: {
        slug: string
      }
    }>({
      name: 'invoice',
      protocol: 'tg',
      callback: ({uriParams}) => {
        const link = this.makeLink(INTERNAL_LINK_TYPE.INVOICE, uriParams);
        return this.processInternalLink(link);
      }
    });

    // tg://addlist?slug=asd
    addAnchorListener<{
      uriParams: {
        slug: string
      }
    }>({
      name: 'addlist',
      protocol: 'tg',
      callback: ({uriParams}) => {
        const link = this.makeLink(INTERNAL_LINK_TYPE.ADD_LIST, uriParams);
        return this.processInternalLink(link);
      }
    });

    ['joinchat' as const, 'join' as const].forEach((name) => {
      addAnchorListener<{
        uriParams: {
          invite: string
        }
      }>({
        name,
        protocol: 'tg',
        callback: ({uriParams}) => {
          const link = this.makeLink(INTERNAL_LINK_TYPE.JOIN_CHAT, uriParams);
          return this.processInternalLink(link);
        }
      });
    });
  }

  private makeLink<T extends INTERNAL_LINK_TYPE>(type: T, uriParams: Omit<InternalLinkTypeMap[T], '_'>) {
    return {
      _: type,
      ...uriParams
    } as any as InternalLinkTypeMap[T];
  }

  public processMessageLink = (link: InternalLink.InternalLinkMessage) => {
    const postId = link.post ? +link.post : undefined;
    const commentId = link.comment ? +link.comment : undefined;
    const threadId = link.thread ? +link.thread : undefined;

    return appImManager.openUsername({
      userName: link.domain,
      lastMsgId: postId,
      commentId,
      startParam: link.start,
      stack: link.stack,
      threadId,
      mediaTimestamp: link.t && +link.t
    });
  };

  public processPrivatePostLink = async(link: InternalLink.InternalLinkPrivatePost) => {
    const chatId = link.channel.toChatId();

    const chat = await this.managers.appChatsManager.getChat(chatId);
    if(!chat) {
      try {
        await this.managers.appChatsManager.resolveChannel(chatId);
      } catch(err) {
        toastNew({langPackKey: 'LinkNotFound'});
        throw err;
      }
    }

    const postId = +link.post;
    const threadId = link.thread ? +link.thread : undefined;

    return appImManager.op({
      peer: chat,
      lastMsgId: postId,
      threadId,
      stack: link.stack,
      mediaTimestamp: link.t && +link.t
    });
  };

  public processStickerSetLink = (link: InternalLink.InternalLinkStickerSet | InternalLink.InternalLinkEmojiSet) => {
    const popup = PopupElement.createPopup(PopupStickers, {id: link.set}, link._ === INTERNAL_LINK_TYPE.EMOJI_SET);
    popup.show();
    return popup;
  };

  public processJoinChatLink = (link: InternalLink.InternalLinkJoinChat) => {
    return this.managers.appChatsManager.checkChatInvite(link.invite).then((chatInvite) => {
      if((chatInvite as ChatInvite.chatInvitePeek).chat) {
        this.managers.appChatsManager.saveApiChat((chatInvite as ChatInvite.chatInvitePeek).chat, true);
      }

      // console.log(chatInvite);

      if(chatInvite._ === 'chatInviteAlready' ||
        chatInvite._ === 'chatInvitePeek'/*  && chatInvite.expires > tsNow(true) */) {
        appImManager.setInnerPeer({
          peerId: chatInvite.chat.id.toPeerId(true)
        });
        return;
      }

      return PopupElement.createPopup(PopupJoinChatInvite, link.invite, chatInvite);
    }, (err: ApiError) => {
      if(err.type === 'INVITE_HASH_EXPIRED') {
        toast(i18n('InviteExpired'));
      }
    });
  };

  public processVoiceChatLink = (link: InternalLink.InternalLinkVoiceChat) => {
    if(IS_GROUP_CALL_SUPPORTED) {
      return appImManager.joinGroupCall(link.chat_id.toPeerId(true), link.id);
    }
  };

  public processUserPhoneNumberLink = (link: InternalLink.InternalLinkUserPhoneNumber) => {
    return this.managers.appUsersManager.resolvePhone(link.phone).then((user) => {
      return appImManager.setInnerPeer({
        peerId: user.id.toPeerId(false)
      });
    }).catch((err: ApiError) => {
      if(err.type === 'PHONE_NOT_OCCUPIED') {
        toastNew({langPackKey: 'Alert.UserDoesntExists'});
      }
    });
  };

  public processInvoiceLink = (link: InternalLink.InternalLinkInvoice) => {
    return this.managers.appPaymentsManager.getInputInvoiceBySlug(link.slug).then((inputInvoice) => {
      return this.managers.appPaymentsManager.getPaymentForm(inputInvoice).then((paymentForm) => {
        // const message: Message.message = {
        //   _: 'message',
        //   date: 0,
        //   id: 0,
        //   peerId: 0,
        //   peer_id: undefined,
        //   message: '',
        //   media: {
        //     _: 'messageMediaInvoice',
        //     currency: paymentForm.invoice.currency,
        //     description: paymentForm.description,

        //   }
        // };
        return PopupElement.createPopup(PopupPayment, undefined, inputInvoice, paymentForm);
      });
    });
  };

  public processAttachMenuBotLink = async(link: InternalLink.InternalLinkAttachMenuBot) => {
    const botUsername = link.attach || link.domain || (link.nestedLink as InternalLink.InternalLinkMessage).domain;
    const user = await this.managers.appUsersManager.resolveUserByUsername(botUsername).catch(() => undefined as User.user);

    let processInternalLinkResult: any;
    if(link.attach !== undefined) {
      processInternalLinkResult = this.processInternalLink(link.nestedLink);
    }

    let errorLangPackKey: LangPackKey;
    if(!user) {
      errorLangPackKey = 'Alert.UserDoesntExists';
    } else if(!user.pFlags.bot_attach_menu) {
      errorLangPackKey = 'BotCantAddToAttachMenu';
    }/*  else if(user.pFlags.attach_menu_enabled) {
      errorLangPackKey = 'BotAlreadyAddedToAttachMenu';
    } */

    if(errorLangPackKey) {
      toastNew({langPackKey: errorLangPackKey});
      return;
    }

    processInternalLinkResult && await processInternalLinkResult;
    const attachMenuBot = await appImManager.toggleBotInAttachMenu(user.id, true);

    if(link.choose) {
      type ChooseType = typeof link['choose'];
      const choose = link.choose.split('+') as ChooseType[];
      const verifyMap: {
        [type in ChooseType]: AttachMenuPeerType['_']
      } = {
        bots: 'attachMenuPeerTypeBotPM',
        users: 'attachMenuPeerTypePM',
        groups: 'attachMenuPeerTypeChat',
        channels: 'attachMenuPeerTypeBroadcast'
      };

      const filteredTypes = choose.filter((type) => {
        const peerTypePredicate = verifyMap[type];
        return attachMenuBot.peer_types.some((peerType) => peerType._ === peerTypePredicate);
      });

      const chosenPeerId = await PopupPickUser.createPicker(filteredTypes);
      await appImManager.setInnerPeer({peerId: chosenPeerId});
    }

    appImManager.chat.openWebApp({attachMenuBot, startParam: link.startattach});
  };

  public processWebAppLink = async(link: InternalLink.InternalLinkWebApp) => {
    const user = await this.managers.appUsersManager.resolveUserByUsername(link.domain).catch(() => undefined as User.user);
    if(!user) {
      toastNew({langPackKey: 'Alert.UserDoesntExists'});
      return;
    }

    const botId = user.id;

    let botApp: MessagesBotApp;
    try {
      botApp = await this.managers.appAttachMenuBotsManager.getBotApp(botId, link.appname);
    } catch(err) {
      if((err as ApiError).type === 'BOT_APP_INVALID') {
        toastNew({langPackKey: 'Alert.BotAppDoesntExist'});
        return;
      } else {
        throw err;
      }
    }

    let haveWriteAccess: boolean;
    if(botApp.pFlags.inactive || link.masked) {
      haveWriteAccess = await appImManager.confirmBotWebViewInner(botId, botApp.pFlags.request_write_access);
    }

    appImManager.chat.openWebApp({
      startParam: link.startapp,
      writeAllowed: haveWriteAccess,
      botId,
      app: botApp.app as BotApp.botApp
    });
  };

  public processListLink = async(link: InternalLink.InternalLinkAddList) => {
    let chatlistInvite: ChatlistsChatlistInvite;
    try {
      chatlistInvite = await this.managers.filtersStorage.checkChatlistInvite(link.slug);
    } catch(err) {
      if((err as ApiError).type === 'INVITE_SLUG_EXPIRED') {
        toastNew({langPackKey: 'SharedFolder.Link.Expired'});
        return;
      }

      throw err;
    }

    PopupElement.createPopup(PopupSharedFolderInvite, {
      chatlistInvite,
      slug: link.slug
    });
  };

  public processInternalLink(link: InternalLink) {
    const map: {
      [key in InternalLink['_']]?: (link: any) => any
    } = {
      [INTERNAL_LINK_TYPE.MESSAGE]: this.processMessageLink,
      [INTERNAL_LINK_TYPE.PRIVATE_POST]: this.processPrivatePostLink,
      [INTERNAL_LINK_TYPE.EMOJI_SET]: this.processStickerSetLink,
      [INTERNAL_LINK_TYPE.STICKER_SET]: this.processStickerSetLink,
      [INTERNAL_LINK_TYPE.JOIN_CHAT]: this.processJoinChatLink,
      [INTERNAL_LINK_TYPE.VOICE_CHAT]: this.processVoiceChatLink,
      [INTERNAL_LINK_TYPE.USER_PHONE_NUMBER]: this.processUserPhoneNumberLink,
      [INTERNAL_LINK_TYPE.INVOICE]: this.processInvoiceLink,
      [INTERNAL_LINK_TYPE.ATTACH_MENU_BOT]: this.processAttachMenuBotLink,
      [INTERNAL_LINK_TYPE.WEB_APP]: this.processWebAppLink,
      [INTERNAL_LINK_TYPE.ADD_LIST]: this.processListLink
    };

    const processor = map[link._];
    if(!processor) {
      console.warn('Not supported internal link:', link);
      return;
    }

    return processor(link);
  }
}

const internalLinkProcessor = new InternalLinkProcessor();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.internalLinkProcessor = internalLinkProcessor);
export default internalLinkProcessor;
