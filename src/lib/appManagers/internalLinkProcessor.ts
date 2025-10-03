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
import {toastNew, toast, hideToast} from '../../components/toast';
import {MOUNT_CLASS_TO} from '../../config/debug';
import IS_GROUP_CALL_SUPPORTED from '../../environment/groupCallSupport';
import addAnchorListener from '../../helpers/addAnchorListener';
import assumeType from '../../helpers/assumeType';
import findUpClassName from '../../helpers/dom/findUpClassName';
import {User, AttachMenuPeerType, MessagesBotApp, BotApp, ChatlistsChatlistInvite, Chat, InputInvoice} from '../../layer';
import {i18n, LangPackKey, _i18n} from '../langPack';
import {PHONE_NUMBER_REG_EXP} from '../richTextProcessor';
import {isWebAppNameValid} from '../richTextProcessor/validators';
import appImManager from './appImManager';
import {INTERNAL_LINK_TYPE, InternalLinkTypeMap, InternalLink} from './internalLink';
import {AppManagers} from './managers';
import {createStoriesViewerWithPeer} from '../../components/stories/viewer';
import {simulateClickEvent} from '../../helpers/dom/clickEvent';
import PopupPremium from '../../components/popups/premium';
import rootScope from '../rootScope';
import PopupBoost from '../../components/popups/boost';
import PopupGiftLink from '../../components/popups/giftLink';
import PopupStars from '../../components/popups/stars';
import type {RequestWebViewOptions} from './appAttachMenuBotsManager';
import {prefetchStars} from '../../stores/stars';
import {getMiddleware} from '../../helpers/middleware';
import anchorCallback from '../../helpers/dom/anchorCallback';
import PopupStarGiftInfo from '../../components/popups/starGiftInfo';
import noop from '../../helpers/noop';
import appSidebarRight from '../../components/sidebarRight';
import pause from '../../helpers/schedulers/pause';

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

        return this.managers.appMessagesManager.sendText({
          peerId: appImManager.chat.peerId,
          text: '/' + command + (bot ? '@' + bot : '')
        });
      }
    });

    addAnchorListener<{uriParams: {hashtag: string}}>({
      name: 'searchByHashtag',
      callback: ({uriParams}) => {
        const {hashtag} = uriParams;
        if(!hashtag) {
          return;
        }

        return appImManager.chat.initSearch({query: '#' + hashtag + ' '});
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
    type K2 = {thread?: string, comment?: string, start?: string, t?: string, text?: string};
    type K3 = {startattach?: string, attach?: string, choose?: TelegramChoosePeerType};
    type K4 = {startapp?: string, mode?: 'compact' | 'fullscreen'};
    type K5 = {story?: string};
    type K6 = {boost?: string};
    type K7 = {voicechat?: string, videochat?: string, livestream?: string};
    type K8 = {text?: string};

    addAnchorListener<{
    //   pathnameParams: ['c', string, string],
    //   uriParams: {thread?: number}
    // } | {
    //   pathnameParams: [string, string?],
    //   uriParams: {comment?: number}
      pathnameParams: ['c', string, string] | [string, string?],
      uriParams: K1 | K2 | K3 | K4 | K5 | K6 | K7 | K8
    }>({
      name: 'im',
      callback: async({pathnameParams, uriParams}, element, masked) => {
        let link: InternalLink;
        if('voicechat' in uriParams || 'videochat' in uriParams || 'livestream' in uriParams) {
          assumeType<K7>(uriParams);
          link = {
            _: INTERNAL_LINK_TYPE.VOICE_CHAT,
            domain: pathnameParams[0],
            ...uriParams
          };
        } else if('boost' in uriParams || pathnameParams?.[0] === 'boost') {
          const channel = pathnameParams?.[0] === 'c' ? pathnameParams[1] : (uriParams as any).c;
          link = {
            _: INTERNAL_LINK_TYPE.BOOST,
            domain: channel ? undefined : ('boost' in uriParams ? pathnameParams[0] : pathnameParams[1]),
            channel
          };
        } else if(pathnameParams?.[1] === 's') {
          link = {
            _: INTERNAL_LINK_TYPE.STORY,
            domain: pathnameParams[0],
            story: pathnameParams[2]
          };
        } else if(pathnameParams?.[1] === 'c') {
          link = {
            _: INTERNAL_LINK_TYPE.STAR_GIFT_COLLECTION,
            domain: pathnameParams[0],
            id: pathnameParams[2]
          };
        } else if(pathnameParams?.[1] === 'a') {
          link = {
            _: INTERNAL_LINK_TYPE.STORY_ALBUM,
            domain: pathnameParams[0],
            id: pathnameParams[2]
          };
        } else if(PHONE_NUMBER_REG_EXP.test(pathnameParams[0])) {
          link = {
            _: INTERNAL_LINK_TYPE.USER_PHONE_NUMBER,
            phone: pathnameParams[0],
            text: (uriParams as K8).text
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
        } else if(pathnameParams[1] ? isWebAppNameValid(pathnameParams[1]) : (uriParams as K4).startapp !== undefined) {
          assumeType<K4>(uriParams);
          link = {
            _: INTERNAL_LINK_TYPE.WEB_APP,
            domain: pathnameParams[0],
            appname: pathnameParams[1],
            startapp: uriParams.startapp,
            masked,
            mode: uriParams.mode
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
            t: uriParams.t,
            text: uriParams.text
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
        videochat?: string,
        livestream?: string,
        post?: string,
        thread?: string,
        comment?: string,
        phone?: string,
        t?: string,
        attach?: string,
        startattach?: string,
        choose?: TelegramChoosePeerType,
        appname?: string,
        startapp?: string,
        compact?: string,
        story?: string
      }
    }>({
      name: 'resolve',
      protocol: 'tg',
      callback: ({uriParams}, element, masked) => {
        let link: InternalLink;
        if(uriParams.voicechat !== undefined || uriParams.videochat !== undefined || uriParams.livestream !== undefined) {
          link = this.makeLink(INTERNAL_LINK_TYPE.VOICE_CHAT, uriParams as Required<typeof uriParams>);
        } else if(uriParams.story) {
          link = this.makeLink(INTERNAL_LINK_TYPE.STORY, uriParams as Required<typeof uriParams>);
        } else if(uriParams.phone) {
          link = this.makeLink(INTERNAL_LINK_TYPE.USER_PHONE_NUMBER, uriParams as Required<typeof uriParams>);
        } else if(uriParams.domain === 'telegrampassport') {

        } else if((uriParams.appname || uriParams.startapp) !== undefined) {
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

    // tg://boost?channel=123 tg://boost?domain=username
    addAnchorListener<{
      uriParams: {
        channel?: string,
        domain?: string
      }
    }>({
      name: 'boost',
      protocol: 'tg',
      callback: ({uriParams}) => {
        const link = this.makeLink(INTERNAL_LINK_TYPE.BOOST, uriParams);
        return this.processInternalLink(link);
      }
    });

    // t.me/boost/adasdasd
    addAnchorListener<{pathnameParams: ['boost', string]}>({
      name: 'boost',
      callback: ({pathnameParams}) => {
        const link: InternalLink = {
          _: INTERNAL_LINK_TYPE.BOOST,
          domain: pathnameParams[1]
        };

        return this.processInternalLink(link);
      }
    });

    // tg://premium_offer?ref=premium tg://premium_offer
    addAnchorListener<{
      uriParams: {
        ref?: string
      }
    }>({
      name: 'premium_offer',
      protocol: 'tg',
      callback: ({uriParams}) => {
        const link = this.makeLink(INTERNAL_LINK_TYPE.PREMIUM_FEATURES, uriParams);
        return this.processInternalLink(link);
      }
    });

    // t.me/giftcode/slug
    addAnchorListener<{pathnameParams: ['giftcode', string]}>({
      name: 'giftcode',
      callback: ({pathnameParams}, element) => {
        const link: InternalLink = {
          _: INTERNAL_LINK_TYPE.GIFT_CODE,
          slug: pathnameParams[1],
          stack: appImManager.getStackFromElement(element)
        };

        return this.processInternalLink(link);
      }
    });

    // tg://giftcode?slug=...
    addAnchorListener<{
      uriParams: {
        slug: string
      }
    }>({
      name: 'giftcode',
      protocol: 'tg',
      callback: ({uriParams}, element) => {
        const link = this.makeLink(INTERNAL_LINK_TYPE.GIFT_CODE, uriParams);
        link.stack = appImManager.getStackFromElement(element);
        return this.processInternalLink(link);
      }
    });

    // t.me/m/slug
    addAnchorListener<{pathnameParams: ['m', string]}>({
      name: 'm',
      callback: ({pathnameParams}) => {
        const link: InternalLink = {
          _: INTERNAL_LINK_TYPE.BUSINESS_CHAT,
          slug: pathnameParams[1]
        };

        return this.processInternalLink(link);
      }
    });

    // tg://message?slug=...
    addAnchorListener<{
      uriParams: {
        slug: string
      }
    }>({
      name: 'message',
      protocol: 'tg',
      callback: ({uriParams}) => {
        const link = this.makeLink(INTERNAL_LINK_TYPE.BUSINESS_CHAT, uriParams);
        return this.processInternalLink(link);
      }
    });

    // tg://stars_topup?amount=100
    addAnchorListener<{
      uriParams: {
        balance: string,
        purpose: string
      }
    }>({
      name: 'stars_topup',
      protocol: 'tg',
      callback: ({uriParams}) => {
        const link = this.makeLink(INTERNAL_LINK_TYPE.STARS_TOPUP, uriParams);
        return this.processInternalLink(link);
      }
    });

    // t.me/share/url?url=...&text=...
    addAnchorListener<{pathnameParams: ['share', 'url'], uriParams: {url?: string, text?: string}}>({
      name: 'share',
      callback: ({pathnameParams, uriParams}) => {
        const link: InternalLink = {
          _: INTERNAL_LINK_TYPE.SHARE,
          url: uriParams.url,
          text: uriParams.text
        };

        return this.processInternalLink(link);
      }
    });

    addAnchorListener<{
      uriParams: {
        url?: string,
        text?: string
      }
    }>({
      name: 'msg_url',
      protocol: 'tg',
      callback: ({uriParams}) => {
        const link: InternalLink = {
          _: INTERNAL_LINK_TYPE.SHARE,
          url: uriParams.url,
          text: uriParams.text
        };

        return this.processInternalLink(link);
      }
    });

    // t.me/nft/asdasd-1
    addAnchorListener<{pathnameParams: ['nft', string]}>({
      name: 'nft',
      callback: ({pathnameParams}) => {
        const link: InternalLink = {
          _: INTERNAL_LINK_TYPE.UNIQUE_STAR_GIFT,
          slug: pathnameParams.slice(1).join('/') // support unescaped slash
        };

        return this.processInternalLink(link);
      }
    });

    // tg://nft?slug=...
    addAnchorListener<{
      uriParams: {
        slug: string
      }
    }>({
      name: 'nft',
      protocol: 'tg',
      callback: ({uriParams}) => {
        const link = this.makeLink(INTERNAL_LINK_TYPE.UNIQUE_STAR_GIFT, uriParams);
        return this.processInternalLink(link);
      }
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
      mediaTimestamp: link.t && +link.t,
      text: link.text
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
    return this.managers.appChatInvitesManager.checkChatInvite(link.invite).then(async(chatInvite) => {
      if(chatInvite._ === 'chatInviteAlready' ||
        chatInvite._ === 'chatInvitePeek'/*  && chatInvite.expires > tsNow(true) */) {
        appImManager.setInnerPeer({
          peerId: chatInvite.chat.id.toPeerId(true)
        });
        return;
      }

      if(chatInvite.subscription_pricing && !chatInvite.pFlags.can_refulfill_subscription) {
        const inputInvoice: InputInvoice = {
          _: 'inputInvoiceChatInviteSubscription',
          hash: link.invite
        };

        const popup = await PopupPayment.create({
          inputInvoice,
          chatInvite,
          noPaymentForm: true
        });

        popup.addEventListener('finish', (result) => {
          if(result === 'paid') {
            this.processJoinChatLink(link);
          }
        });

        return popup;
      }

      return PopupElement.createPopup(PopupJoinChatInvite, link.invite, chatInvite);
    }, (err: ApiError) => {
      if(err.type === 'INVITE_HASH_EXPIRED') {
        toast(i18n('InviteExpired'));
      }
    });
  };

  public processVoiceChatLink = async(link: InternalLink.InternalLinkVoiceChat) => {
    const openPeerId = (peerId: PeerId) => {
      if(appImManager.chat.peerId !== peerId) {
        return appImManager.setInnerPeer({peerId});
      }
    };

    if(link.livestream !== undefined) {
      const peer = await this.managers.appUsersManager.resolveUsername(link.domain);
      const peerId = peer.id.toPeerId(true);
      await openPeerId(peerId);
      return appImManager.joinLiveStream(peerId);
    }

    if(!IS_GROUP_CALL_SUPPORTED) {
      return;
    }

    if(link.id) {
      const peerId = link.chat_id.toPeerId(true);
      await openPeerId(peerId);
      return appImManager.joinGroupCall(peerId, link.id);
    }
  };

  public processUserPhoneNumberLink = (link: InternalLink.InternalLinkUserPhoneNumber) => {
    return this.managers.appUsersManager.resolvePhone(link.phone).then((user) => {
      return appImManager.setInnerPeer({
        peerId: user.id.toPeerId(false),
        text: link.text
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
        return PopupPayment.create({inputInvoice, paymentForm});
      }, (err) => {
        if((err as ApiError).type === 'SLUG_INVALID') {
          toastNew({langPackKey: 'PaymentInvoiceLinkInvalid'});
        }

        throw err;
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
    const commonOptions: Partial<RequestWebViewOptions> = {
      compact: link.mode === 'compact',
      fullscreen: link.mode === 'fullscreen',
      startParam: link.startapp,
      botId
    };

    if(!link.appname) {
      if(!user.pFlags.bot_has_main_app) {
        toastNew({langPackKey: 'Alert.BotAppDoesntExist'});
        return;
      }

      if(link.masked) {
        await appImManager.confirmBotWebViewInner({
          botId
        });
      }

      appImManager.chat.openWebApp({
        ...commonOptions,
        main: true
      });

      return;
    }

    let messagesBotApp: MessagesBotApp;
    try {
      messagesBotApp = await this.managers.appAttachMenuBotsManager.getBotApp(botId, link.appname);
    } catch(err) {
      if((err as ApiError).type === 'BOT_APP_INVALID') {
        toastNew({langPackKey: 'Alert.BotAppDoesntExist'});
        return;
      } else {
        throw err;
      }
    }

    const attachMenuBot = user.pFlags.bot_attach_menu && await appImManager.toggleBotInAttachMenu(botId, true);

    let haveWriteAccess: boolean;
    if(attachMenuBot) {

    } else if(link.masked || messagesBotApp.pFlags.inactive) {
      haveWriteAccess = await appImManager.confirmBotWebViewInner({
        botId,
        requestWriteAccess: messagesBotApp.pFlags.request_write_access,
        showDisclaimer: user.pFlags.bot_attach_menu && messagesBotApp.pFlags.inactive
      });
    }

    appImManager.chat.openWebApp({
      ...commonOptions,
      attachMenuBot,
      writeAllowed: haveWriteAccess,
      app: messagesBotApp.app as BotApp.botApp,
      noConfirmation: !attachMenuBot,
      hasSettings: messagesBotApp.pFlags.has_settings
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

  public processStoryLink = async(link: InternalLink.InternalLinkStory) => {
    const event = window.event;
    const bubble = findUpClassName(event.target as HTMLElement, 'bubble');
    if(bubble && bubble.classList.contains('story')) {
      simulateClickEvent(bubble.querySelector('.media-container').querySelector('img, video'));
      return;
    }

    let peer: User.user | Chat;
    try {
      peer = await this.managers.appUsersManager.resolveUsername(link.domain);
    } catch(err) {
      if((err as ApiError).type === 'USERNAME_NOT_OCCUPIED') {
        toastNew({langPackKey: 'NoUsernameFound'});
      } else {
        console.error(err);
      }

      return;
    }

    const peerId = peer.id.toPeerId(peer._ !== 'user');
    const storyItem = await this.managers.appStoriesManager.getStoryById(peerId, +link.story);
    if(!storyItem) {
      toastNew({langPackKey: 'NoStoryFound'});
      return;
    }

    createStoriesViewerWithPeer({
      peerId,
      id: +link.story
    });
  };

  public processBoostLink = async(link: InternalLink.InternalLinkBoost) => {
    let peerId = link.channel ? link.channel.toPeerId(true) : undefined;
    if(peerId === undefined) {
      const chat = await this.managers.appUsersManager.resolveUsername(link.domain) as Chat;
      peerId = chat.id.toPeerId(true);
    }

    PopupElement.createPopup(PopupBoost, peerId);
  };

  public processPremiumFeaturesLink = async(link: InternalLink.InternalLinkPremiumFeatures) => {
    if(rootScope.premium) {
      toastNew({langPackKey: 'Premium.Offset.AlreadyHave'});
      return;
    }

    PopupPremium.show();
  };

  public processGiftCodeLink = (link: InternalLink.InternalLinkGiftCode) => {
    PopupElement.createPopup(PopupGiftLink, link.slug, link.stack);
  };

  public processBusinessChatLink = async(link: InternalLink.InternalLinkBusinessChat) => {
    const resolved = await this.managers.appBusinessManager.resolveBusinessChatLink(link.slug);
    appImManager.setInnerPeer({
      peerId: resolved.peerId,
      text: resolved.message,
      entities: resolved.entities
    });
  };

  public processStarsTopupLink = async(link: InternalLink.InternalLinkStarsTopup) => {
    const middlewareHelper = getMiddleware();
    const balance = +(await prefetchStars(middlewareHelper.get()));
    middlewareHelper.destroy();

    const purpose = link.purpose || 'topup';

    const itemPrice = +link.balance;
    if(balance >= itemPrice) {
      toastNew({
        langPackKey: 'Stars.TopUp.Enough',
        langPackArguments: [
          anchorCallback(() => {
            hideToast();
            const popup = PopupElement.createPopup(PopupStars, {
              onTopup: () => {
                popup.hide();
              },
              purpose
            });
          })
        ]
      });
      return;
    }

    const popup = PopupElement.createPopup(PopupStars, {
      itemPrice,
      onTopup: () => {
        popup.hide();
      },
      purpose
    });
  };

  public processShareLink = async(link: InternalLink.InternalLinkShare) => {
    const {peerId, threadId, monoforumThreadId} = await PopupPickUser.createSharingPicker2();
    appImManager.setInnerPeer({
      peerId,
      threadId,
      monoforumThreadId,
      text: [link.url, link.text].filter(Boolean).join('\n')
    });
  };

  public processUniqueStarGiftLink = async(link: InternalLink.InternalLinkUniqueStarGift) => {
    const gift = await this.managers.appGiftsManager.getGiftBySlug(link.slug).catch(noop);
    if(!gift) {
      toastNew({langPackKey: 'Error.AnError'});
      return;
    }

    PopupElement.createPopup(PopupStarGiftInfo, {gift});
  }

  public processStarGiftCollectionLink = async(link: InternalLink.InternalLinkStarGiftCollection) => {
    const peer = await this.managers.appUsersManager.resolveUsername(link.domain);
    const peerId = peer.id.toPeerId(peer._ !== 'user');
    if(appImManager.chat.peerId !== peerId) {
      await appImManager.setInnerPeer({peerId});
      await pause(500)
    }
    appSidebarRight.toggleSidebar(true, true);
    appSidebarRight.sharedMediaTab.setSearchTab('gifts');
    appSidebarRight.sharedMediaTab.searchSuper.stargiftsActions?.setFilters({chosenCollection: Number(link.id)})
  }

  public processStoryAlbumLink = async(link: InternalLink.InternalLinkStoryAlbum) => {
    const peer = await this.managers.appUsersManager.resolveUsername(link.domain);
    const peerId = peer.id.toPeerId(peer._ !== 'user');
    if(appImManager.chat.peerId !== peerId) {
      await appImManager.setInnerPeer({peerId});
      await pause(500)
    }
    appSidebarRight.toggleSidebar(true, true);
    appSidebarRight.sharedMediaTab.setSearchTab('stories');
  }

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
      [INTERNAL_LINK_TYPE.ADD_LIST]: this.processListLink,
      [INTERNAL_LINK_TYPE.STORY]: this.processStoryLink,
      [INTERNAL_LINK_TYPE.BOOST]: this.processBoostLink,
      [INTERNAL_LINK_TYPE.PREMIUM_FEATURES]: this.processPremiumFeaturesLink,
      [INTERNAL_LINK_TYPE.GIFT_CODE]: this.processGiftCodeLink,
      [INTERNAL_LINK_TYPE.BUSINESS_CHAT]: this.processBusinessChatLink,
      [INTERNAL_LINK_TYPE.STARS_TOPUP]: this.processStarsTopupLink,
      [INTERNAL_LINK_TYPE.SHARE]: this.processShareLink,
      [INTERNAL_LINK_TYPE.UNIQUE_STAR_GIFT]: this.processUniqueStarGiftLink,
      [INTERNAL_LINK_TYPE.STAR_GIFT_COLLECTION]: this.processStarGiftCollectionLink,
      [INTERNAL_LINK_TYPE.STORY_ALBUM]: this.processStoryAlbumLink
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
