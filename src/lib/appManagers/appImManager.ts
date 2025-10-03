/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {GroupCallId, MyGroupCall} from './appGroupCallsManager';
import type GroupCallInstance from '../calls/groupCallInstance';
import type CallInstance from '../calls/callInstance';
import animationIntersector from '../../components/animationIntersector';
import appSidebarLeft, {LEFT_COLUMN_ACTIVE_CLASSNAME} from '../../components/sidebarLeft';
import appSidebarRight, {RIGHT_COLUMN_ACTIVE_CLASSNAME} from '../../components/sidebarRight';
import mediaSizes, {ScreenSize} from '../../helpers/mediaSizes';
import {logger, LogTypes} from '../logger';
import rootScope from '../rootScope';
import Chat, {ChatSearchKeys, ChatType} from '../../components/chat/chat';
import PopupNewMedia, {getCurrentNewMediaPopup} from '../../components/popups/newMedia';
import MarkupTooltip from '../../components/chat/markupTooltip';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import SetTransition from '../../components/singleTransition';
import ChatDragAndDrop from '../../components/chat/dragAndDrop';
import {doubleRaf} from '../../helpers/schedulers';
import useHeavyAnimationCheck, {dispatchHeavyAnimationEvent} from '../../hooks/useHeavyAnimationCheck';
import {MOUNT_CLASS_TO} from '../../config/debug';
import appNavigationController from '../../components/appNavigationController';
import AppPrivateSearchTab from '../../components/sidebarRight/tabs/search';
import I18n, {i18n, join, LangPackKey} from '../langPack';
import {ChatFull, ChatParticipants, Message, MessageAction, MessageMedia, SendMessageAction, User, Chat as MTChat, UrlAuthResult, WallPaper, Config, AttachMenuBot, Peer, InputChannel, HelpPeerColors, Reaction, Document, MessageEntity, PeerColor, SponsoredMessage, InputGroupCall} from '../../layer';
import PeerTitle from '../../components/peerTitle';
import {PopupPeerCheckboxOptions} from '../../components/popups/peer';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import cancelEvent from '../../helpers/dom/cancelEvent';
import disableTransition from '../../helpers/dom/disableTransition';
import replaceContent from '../../helpers/dom/replaceContent';
import whichChild from '../../helpers/dom/whichChild';
import PopupElement from '../../components/popups';
import singleInstance from '../mtproto/singleInstance';
import {toastNew} from '../../components/toast';
import debounce from '../../helpers/schedulers/debounce';
import pause from '../../helpers/schedulers/pause';
import MEDIA_MIME_TYPES_SUPPORTED from '../../environment/mediaMimeTypesSupport';
import IMAGE_MIME_TYPES_SUPPORTED from '../../environment/imageMimeTypesSupport';
import {NULL_PEER_ID, STARS_CURRENCY} from '../mtproto/mtproto_config';
import telegramMeWebManager from '../mtproto/telegramMeWebManager';
import {ONE_DAY} from '../../helpers/date';
import TopbarCall from '../../components/topbarCall';
import confirmationPopup from '../../components/confirmationPopup';
import IS_GROUP_CALL_SUPPORTED from '../../environment/groupCallSupport';
import IS_CALL_SUPPORTED from '../../environment/callSupport';
import {CallType} from '../calls/types';
import {Modify, SendMessageEmojiInteractionData} from '../../types';
import htmlToSpan from '../../helpers/dom/htmlToSpan';
import getVisibleRect from '../../helpers/dom/getVisibleRect';
import {simulateClickEvent} from '../../helpers/dom/clickEvent';
import PopupCall from '../../components/call';
import copy from '../../helpers/object/copy';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import ChatBackgroundPatternRenderer from '../../components/chat/patternRenderer';
import {IS_CHROMIUM, IS_FIREFOX} from '../../environment/userAgent';
import compareVersion from '../../helpers/compareVersion';
import {AppManagers} from './managers';
import {UiNotificationsManager} from './uiNotificationsManager';
import appMediaPlaybackController from '../../components/appMediaPlaybackController';
import wrapEmojiText from '../richTextProcessor/wrapEmojiText';
import wrapRichText from '../richTextProcessor/wrapRichText';
import wrapUrl from '../richTextProcessor/wrapUrl';
import getUserStatusString from '../../components/wrappers/getUserStatusString';
import getChatMembersString from '../../components/wrappers/getChatMembersString';
import {STATE_INIT, SETTINGS_INIT} from '../../config/state';
import CacheStorageController from '../files/cacheStorage';
import themeController from '../../helpers/themeController';
import overlayCounter from '../../helpers/overlayCounter';
import appDialogsManager from './appDialogsManager';
import idleController from '../../helpers/idleController';
import EventListenerBase from '../../helpers/eventListenerBase';
import {AckedResult} from '../mtproto/superMessagePort';
import groupCallsController from '../calls/groupCallsController';
import callsController from '../calls/callsController';
import getFilesFromEvent from '../../helpers/files/getFilesFromEvent';
import apiManagerProxy from '../mtproto/mtprotoworker';
import appRuntimeManager from './appRuntimeManager';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import findUpClassName from '../../helpers/dom/findUpClassName';
import {CLICK_EVENT_NAME} from '../../helpers/dom/clickEvent';
import wrapPeerTitle from '../../components/wrappers/peerTitle';
import NBSP from '../../helpers/string/nbsp';
import {makeMediaSize, MediaSize} from '../../helpers/mediaSize';
import {MiddleEllipsisElement} from '../../components/middleEllipsis';
import parseUriParams from '../../helpers/string/parseUriParams';
import getMessageThreadId from './utils/messages/getMessageThreadId';
import findUpTag from '../../helpers/dom/findUpTag';
import {MTAppConfig} from '../mtproto/appConfig';
import PopupForward from '../../components/popups/forward';
import AppBackgroundTab from '../../components/sidebarLeft/tabs/background';
import partition from '../../helpers/array/partition';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import liteMode, {LiteModeKey} from '../../helpers/liteMode';
import RLottiePlayer from '../rlottie/rlottiePlayer';
import PopupGiftPremium from '../../components/popups/giftPremium';
import internalLinkProcessor from './internalLinkProcessor';
import {createStoriesViewerWithPeer} from '../../components/stories/viewer';
import type {CustomEmojiRendererElement} from '../customEmoji/renderer';
import {Middleware} from '../../helpers/middleware';
import lottieLoader from '../rlottie/lottieLoader';
import wrapStickerAnimation, {emojiAnimationContainer} from '../../components/wrappers/stickerAnimation';
import onMediaLoad from '../../helpers/onMediaLoad';
import throttle from '../../helpers/schedulers/throttle';
import appDownloadManager from './appDownloadManager';
import getServerMessageId from './utils/messageId/getServerMessageId';
import {findUpAvatar} from '../../components/avatarNew';
import safePlay from '../../helpers/dom/safePlay';
import {RequestWebViewOptions} from './appAttachMenuBotsManager';
import PopupWebApp from '../../components/popups/webApp';
import {getPeerColorIndexByPeer, getPeerColorsByPeer, setPeerColors} from './utils/peers/getPeerColorById';
import {savedReactionTags} from '../../components/chat/reactions';
import {setAppState} from '../../stores/appState';
import rtmpCallsController, {RtmpCallInstance} from '../calls/rtmpCallsController';
import {AppMediaViewerRtmp} from '../../components/appMediaViewerRtmp';
import useProfileColors from '../../hooks/useProfileColors';
import {DEFAULT_BACKGROUND_SLUG} from '../../config/app';
import blur from '../../helpers/blur';
import {wrapSlowModeLeftDuration} from '../../components/wrappers/wrapDuration';
import {splitFullMid} from '../../components/chat/bubbles';
import getSelectedNodes from '../../helpers/dom/getSelectedNodes';
import {setQuizHint} from '../../components/poll';
import anchorCallback from '../../helpers/dom/anchorCallback';
import PopupPremium from '../../components/popups/premium';
import safeWindowOpen from '../../helpers/dom/safeWindowOpen';
import {openWebAppInAppBrowser} from '../../components/browser';
import PopupBoostsViaGifts from '../../components/popups/boostsViaGifts';
import {createProxiedManagersForAccount} from './getProxiedManagers';
import ChatBackgroundStore from '../chatBackgroundStore';
import useLockScreenShortcut from './utils/useLockScreenShortcut';
import PaidMessagesInterceptor, {PAYMENT_REJECTED} from '../../components/chat/paidMessagesInterceptor';
import IS_WEB_APP_BROWSER_SUPPORTED from '../../environment/webAppBrowserSupport';
import ChatAudio from '../../components/chat/audio';
import PopupAboutAd from '../../components/popups/aboutAd';

export type ChatSavedPosition = {
  mids: number[],
  top: number
};

export type ChatSetPeerOptions = {
  peerId: PeerId,
  lastMsgId?: number,
  lastMsgPeerId?: PeerId,
  threadId?: number,
  monoforumThreadId?: PeerId,
  startParam?: string,
  stack?: {peerId: PeerId, mid: number, message?: Message.message, isOut?: boolean},
  commentId?: number,
  type?: ChatType,
  mediaTimestamp?: number,
  text?: string,
  entities?: MessageEntity[],
  call?: string | number,
  isDeleting?: boolean
} & Partial<ChatSearchKeys>;

export type ChatSetInnerPeerOptions = Modify<ChatSetPeerOptions, {
  peerId: PeerId,
  type?: ChatType
}>;

export enum APP_TABS {
  CHATLIST,
  CHAT,
  PROFILE
}

export class AppImManager extends EventListenerBase<{
  chat_changing: (details: {from: Chat, to: Chat}) => void,
  peer_changed: (chat: Chat) => void,
  peer_changing: (chat: Chat) => void,
  tab_changing: (tabId: number) => void,
  premium_toggle: (premium: boolean) => void
}> {
  public columnEl = document.getElementById('column-center') as HTMLDivElement;
  public chatsContainer: HTMLElement;

  public offline = false;
  public updateStatusInterval = 0;

  public log: ReturnType<typeof logger>;

  public setPeerPromise: Promise<void> = null;

  private tabId: APP_TABS;

  public chats: Chat[] = [];
  private prevTab: HTMLElement;
  private chatsSelectTabDebounced: () => void;

  private backgroundPromises: {[url: string]: MaybePromise<string>};

  private topbarCall: TopbarCall;
  private chatAudio: ChatAudio;

  public lastBackgroundUrl: string;

  public managers: AppManagers;

  public cacheStorage = new CacheStorageController('cachedFiles');
  public customEmojiSize: MediaSize;

  public isShiftLockShortcut = false;

  private chatPositions: {
    [peerId_threadId: string]: ChatSavedPosition;
  };

  get myId() {
    return rootScope.myId;
  }

  get chat(): Chat {
    return this.chats[this.chats.length - 1];
  }

  public construct(managers: AppManagers) {
    this.managers = managers;
    internalLinkProcessor.construct(managers);

    UiNotificationsManager.constructAndStartAll();

    appMediaPlaybackController.construct(managers);

    this.log = logger('IM', LogTypes.Log | LogTypes.Warn | LogTypes.Debug | LogTypes.Error);

    this.backgroundPromises = {};
    SETTINGS_INIT.themes.forEach((theme) => {
      const themeSettings = theme.settings;
      if(!themeSettings) {
        return;
      }

      const {wallpaper} = themeSettings;
      const slug = (wallpaper as WallPaper.wallPaper).slug;
      if(!slug) {
        return;
      }

      const url = 'assets/img/' + slug + '.svg' + (IS_FIREFOX ? '?1' : '');
      ChatBackgroundStore.setBackgroundUrlToCache({slug, url})
    });

    this.selectTab(APP_TABS.CHATLIST);

    idleController.addEventListener('change', (idle) => {
      this.offline = idle;
      this.updateStatus();
      if(idle) {
        clearInterval(this.updateStatusInterval);
      } else {
        this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);
      }
    });

    this.chatsContainer = document.createElement('div');
    this.chatsContainer.classList.add('chats-container', 'tabs-container');
    this.chatsContainer.dataset.animation = 'navigation';

    this.appendEmojiAnimationContainer(mediaSizes.activeScreen);

    this.columnEl.append(this.chatsContainer);

    this.createNewChat();
    this.chatsSelectTab(this.chat.container);

    appNavigationController.onHashChange = this.onHashChange;
    // window.addEventListener('hashchange', this.onHashChange);

    this.setSettings();
    rootScope.addEventListener('settings_updated', this.setSettings);

    const onPremiumToggle = (isPremium: boolean) => {
      if(document.body.classList.contains('is-premium') === isPremium) {
        return;
      }

      document.body.classList.toggle('is-premium', isPremium);
      this.dispatchEvent('premium_toggle', isPremium);
    };
    rootScope.addEventListener('premium_toggle', onPremiumToggle);

    rootScope.addEventListener('background_change', () => {
      this.applyCurrentTheme({noSetTheme: true});
    });

    onPremiumToggle(rootScope.premium);
    this.managers.rootScope.getPremium().then(onPremiumToggle);

    useHeavyAnimationCheck(() => {
      animationIntersector.setOnlyOnePlayableGroup('lock');
      animationIntersector.checkAnimations2(true);
    }, () => {
      animationIntersector.setOnlyOnePlayableGroup();
      animationIntersector.checkAnimations2(false);
    });

    themeController.AppBackgroundTab = AppBackgroundTab;

    if(IS_FIREFOX && apiManagerProxy.oldVersion && compareVersion(apiManagerProxy.oldVersion, '1.4.3') === -1) {
      this.deleteFilesIterative((response) => {
        return response.headers.get('Content-Type') === 'image/svg+xml';
      }).then(() => {
        this.applyCurrentTheme({noSetTheme: true});
      });
    } else {
      this.applyCurrentTheme({noSetTheme: true});
    }

    // * fix simultaneous opened both sidebars, can happen when floating sidebar is opened with left sidebar
    mediaSizes.addEventListener('changeScreen', (from, to) => {
      if(document.body.classList.contains(LEFT_COLUMN_ACTIVE_CLASSNAME) &&
        document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME)) {
        appSidebarRight.toggleSidebar(false);
      }

      this.appendEmojiAnimationContainer(to);
    });

    mediaSizes.addEventListener('resize', () => {
      // const perf = performance.now();
      this.adjustChatPatternBackground();
      // this.log.warn('resize bg time:', performance.now() - perf);
      // for(const chat of this.chats) {
      //   if(chat.renderDarkPattern) {
      //     chat.renderDarkPattern();
      //   }
      // }
    });

    const onPeerChanging = (chat: Chat) => {
      this.saveChatPosition(chat);
    };

    const onPeerChanged = () => {
      this.addEventListener('peer_changing', onPeerChanging, {once: true});
    };

    this.addEventListener('peer_changed', onPeerChanged);

    // * prefetch some data
    this.addEventListener('peer_changed', () => {
      this.managers.appReactionsManager.getPaidReactionPrivacy();
    }, {once: true});

    rootScope.addEventListener('theme_changed', () => {
      this.applyCurrentTheme({
        broadcastEvent: true,
        noSetTheme: true,
        skipAnimation: true
      });
    });

    rootScope.addEventListener('choosing_sticker', (choosing) => {
      this.setChoosingStickerTyping(!choosing);
    });

    rootScope.addEventListener('peer_title_edit', ({peerId, threadId}) => {
      if(this.chat?.peerId === peerId && !threadId && this.tabId !== undefined) {
        this.overrideHash(peerId);
      }
    });

    rootScope.addEventListener('peer_typings', ({peerId, typings}) => {
      const chat = this.chat;
      if(
        !chat ||
        chat.peerId !== peerId ||
        overlayCounter.isOverlayActive || (
          mediaSizes.activeScreen === ScreenSize.mobile &&
          this.tabId !== APP_TABS.CHAT
        )
      ) {
        return;
      }

      const typing = typings.find((typing) => typing.action._ === 'sendMessageEmojiInteraction');
      if(typing?.action?._ === 'sendMessageEmojiInteraction') {
        const action = typing.action;
        const bubble = chat.bubbles.getBubble(peerId, typing.action.msg_id);
        if(bubble && bubble.classList.contains('emoji-big') && getVisibleRect(bubble, chat.bubbles.scrollable.container)) {
          const stickerWrapper: HTMLElement = bubble.querySelector('.media-sticker-wrapper:not(.bubble-hover-reaction-sticker):not(.reaction-sticker)');

          const data: SendMessageEmojiInteractionData = JSON.parse(action.interaction.data);
          data.a.forEach((a) => {
            setTimeout(() => {
              simulateClickEvent(stickerWrapper);
            }, a.t * 1000);
          });

          this.managers.appMessagesManager.setTyping(peerId, {
            _: 'sendMessageEmojiInteractionSeen',
            emoticon: action.emoticon
          });
        }
      }
    });

    rootScope.addEventListener('message_error', ({peerId, error}) => {
      if(error.type.includes('SLOWMODE_WAIT')) {
        const time = +error.type.split('_').pop();
        confirmationPopup({
          titleLangKey: 'Slowmode',
          peerId,
          descriptionLangKey: 'SlowModeHint',
          descriptionLangArgs: [wrapSlowModeLeftDuration(time)],
          button: {
            langKey: 'OK',
            isCancel: true
          }
        });
      }
    });

    rootScope.addEventListener('file_speed_limited', ({increaseTimes, isUpload}) => {
      const {hide} = setQuizHint({
        icon: 'premium_speed',
        title: i18n(isUpload ? 'UploadSpeedLimited' : 'DownloadSpeedLimited'),
        textElement: i18n(isUpload ? 'Chat.UploadLimit.Text' : 'Chat.DownloadLimit.Text', [
          anchorCallback(() => {
            hide();
            PopupPremium.show({feature: 'faster_download'});
          }),
          increaseTimes
        ]),
        appendTo: this.chat.bubbles.container,
        from: 'top',
        duration: 10000
      });
    });

    // remove scroll listener when setting chat to tray
    this.addEventListener('chat_changing', ({to}) => {
      this.toggleChatGradientAnimation(to);
    });

    rootScope.addEventListener('service_notification', (update) => {
      confirmationPopup({
        button: {langKey: 'OK', isCancel: true},
        description: wrapRichText(update.message)
      });
    });

    rootScope.addEventListener('payment_sent', async({peerId, mid, receiptMessage}) => {
      const message = await this.managers.appMessagesManager.getMessageByPeer(peerId, mid);
      if(!message) {
        return;
      }

      const action = receiptMessage.action as MessageAction.messageActionPaymentSent;
      toastNew({
        langPackKey: 'PaymentInfoHint',
        langPackArguments: [
          paymentsWrapCurrencyAmount(action.total_amount, action.currency),
          wrapEmojiText(((message as Message.message).media as MessageMedia.messageMediaInvoice).title)
        ]
      });
    });

    rootScope.addEventListener('toggle_locked', (isLocked) => {
      if(isLocked) appRuntimeManager.reload(false);
    //   (() => {
    //     if(isLocked) {
    //       [
    //         () => this.setPeer({}, false),
    //         () => appNavigationController.overrideHash(),
    //         () => appNavigationController.replaceState(),
    //         () => PopupElement.destroyAll(),
    //         () => appNavigationController.spliceItems(0, Infinity),
    //         () => appSidebarLeft.closeEverythingInside(),
    //         () => this.topbarCall?.hangUp(),
    //         () => AppMediaViewerBase.closeAll()
    //       ].forEach(callback => {
    //         try {
    //           callback();
    //         } catch(e) {
    //           console.error(e);
    //         }
    //       });
    //     } else {
    //       appSidebarLeft.initNavigation();
    //     }
    //   })()
    });

    useLockScreenShortcut();

    (window as any).onSpoilerClick = (e: MouseEvent) => {
      const spoiler = findUpClassName(e.target, 'spoiler');
      const parentElement = findUpClassName(spoiler, 'spoilers-container') || spoiler.parentElement;

      if(parentElement.querySelector('.message-spoiler-overlay')) return;

      const className = 'is-spoiler-visible';
      const isVisible = parentElement.classList.contains(className);
      if(!isVisible) {
        cancelEvent(e);

        if(CLICK_EVENT_NAME !== 'click') {
          window.addEventListener('click', cancelEvent, {capture: true, once: true});
        }
      }

      const duration = 400 / 2;
      const showDuration = 5000;
      const useRafs = !isVisible ? 2 : 0;
      if(useRafs) {
        parentElement.classList.add('will-change');
      }

      const spoilerTimeout = parentElement.dataset.spoilerTimeout;
      if(spoilerTimeout !== null) {
        clearTimeout(+spoilerTimeout);
        delete parentElement.dataset.spoilerTimeout;
      }

      SetTransition({
        element: parentElement,
        className,
        forwards: true,
        duration,
        onTransitionEnd: () => {
          parentElement.dataset.spoilerTimeout = '' + window.setTimeout(() => {
            SetTransition({
              element: parentElement,
              className,
              forwards: false,
              duration,
              onTransitionEnd: () => {
                parentElement.classList.remove('will-change');
                delete parentElement.dataset.spoilerTimeout;
              }
            });
          }, showDuration);
        },
        useRafs
      });
    };

    document.addEventListener('mousemove', (e) => {
      const mediaStickerWrapper = findUpClassName(e.target, 'media-sticker-wrapper');
      if(!mediaStickerWrapper ||
        mediaStickerWrapper.classList.contains('custom-emoji') ||
        findUpClassName(e.target, 'emoji-big')) {
        return;
      }

      const animations = animationIntersector.getAnimations(mediaStickerWrapper);
      animations?.forEach((animationItem) => {
        const {liteModeKey, animation} = animationItem;
        if(!liteModeKey || !animation?.paused || liteMode.isAvailable(liteModeKey)) {
          return;
        }

        if(animation instanceof RLottiePlayer) {
          animation.playOrRestart();
        } else {
          animation.play();
        }
      });
    });

    rootScope.addEventListener('sticker_updated', ({type, faved}) => {
      if(type === 'faved') {
        toastNew({
          langPackKey: faved ? 'AddedToFavorites' : 'RemovedFromFavorites'
        });
      } else if(!faved) {
        toastNew({
          langPackKey: 'RemovedFromRecent'
        });
      }
    });

    rootScope.addEventListener('gif_updated', ({saved}) => {
      toastNew({langPackKey: saved ? 'GifSavedHint' : 'RemovedGIFFromFavorites'});
    });

    apiManagerProxy.addEventListener('notificationBuild', async(options) => {
      const {accountNumber} = options;
      const managers = createProxiedManagersForAccount(accountNumber);
      const isForum = await managers.appPeersManager.isForum(options.message.peerId);
      const threadId = getMessageThreadId(options.message, isForum);

      // TODO: don't forget about notifications
      if(this.chat.peerId === options.message.peerId && this.chat.threadId === threadId && !idleController.isIdle) {
        return;
      }

      UiNotificationsManager.byAccount[accountNumber]?.buildNotificationQueue(options);
    });

    this.addEventListener('peer_changed', async({peerId}) => {
      document.body.classList.toggle('has-chat', !!peerId);

      emojiAnimationContainer.textContent = '';

      this.overrideHash(peerId);

      apiManagerProxy.updateTabState('chatPeerIds', this.chats.map((chat) => chat.peerId).filter(Boolean));
    });

    // stateStorage.get('chatPositions').then((c) => {
    this.chatPositions = {};
    // });

    if(IS_CALL_SUPPORTED || IS_GROUP_CALL_SUPPORTED) {
      this.topbarCall = new TopbarCall(managers);
    }

    this.chatAudio = new ChatAudio(this, managers);
    this.columnEl.append(this.chatAudio.container);

    if(IS_CALL_SUPPORTED) {
      callsController.addEventListener('instance', ({instance/* , hasCurrent */}) => {
        // if(hasCurrent) {
        // return;
        // }

        const popup = PopupElement.createPopup(PopupCall, instance);

        instance.addEventListener('acceptCallOverride', () => {
          return this.discardCurrentCall(instance.interlocutorUserId.toPeerId(), 'Call', undefined, instance)
          .then(() => {
            callsController.dispatchEvent('accepting', instance);
            return true;
          })
          .catch(() => false);
        });

        popup.addEventListener('close', () => {
          const currentCall = callsController.currentCall;
          if(currentCall && currentCall !== instance && !instance.wasTryingToJoin) {
            instance.hangUp('phoneCallDiscardReasonBusy');
          }
        }, {once: true});

        popup.show();
      });

      callsController.addEventListener('incompatible', async(userId) => {
        toastNew({
          langPackKey: 'VoipPeerIncompatible',
          langPackArguments: [
            await wrapPeerTitle({peerId: userId.toPeerId()})
          ]
        });
      });
    }

    // ! do not remove this line
    // ! instance can be deactivated before the UI starts, because it waits in background for RAF that is delayed
    singleInstance.activateInstance();

    const setAuthorized = () => {
      telegramMeWebManager.setAuthorized(true);
    };

    // ! THANKS TO CHROMIUM DEVELOPERS FOR THIS BUG
    // ! https://issues.chromium.org/issues/328755781
    if(IS_CHROMIUM) document.addEventListener('visibilitychange', () => {
      if(document.hidden) {
        return;
      }

      const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
      canvases.forEach((canvas) => {
        const context = canvas.getContext('2d');
        if(!context) {
          return;
        }

        const oldFillStyle = context.fillStyle;
        context.fillStyle = 'transparent';
        context.fillRect(0, 0, 1, 1);
        context.fillStyle = oldFillStyle;
      });
    });

    setInterval(setAuthorized, ONE_DAY);
    setAuthorized();

    this.managers.appReactionsManager.getSavedReactionTags().then((tags) => {
      savedReactionTags.splice(0, savedReactionTags.length, ...tags);
    });

    // * preload sensitive content settings
    this.managers.appPrivacyManager.getSensitiveContentSettings();

    // new PasscodeLockScreenControler().lock();

    this.onHashChange(true);
    this.attachKeydownListener();
    this.attachCopyListener();
    this.handleAutologinDomains();
    this.handlePeerColors();
    this.checkForShare();
    this.init();

    // PopupElement.createPopup(PopupAboutAd);

    // PopupElement.createPopup(PopupBoostsViaGifts, -5000866300);
  }

  public adjustChatPatternBackground() {
    ChatBackgroundPatternRenderer.resizeInstancesOf(this.chatsContainer);
  }

  private checkForShare() {
    const share = apiManagerProxy.share;
    if(share) {
      apiManagerProxy.share = undefined;
      PopupElement.createPopup(PopupForward, undefined, async(peerId, threadId) => {
        await this.setPeer({peerId, threadId});
        if(share.files?.length) {
          const foundMedia = share.files.some((file) => MEDIA_MIME_TYPES_SUPPORTED.has(file.type));
          PopupElement.createPopup(PopupNewMedia, this.chat, share.files, foundMedia ? 'media' : 'document');
        } else {
          const preparedPaymentResult = await PaidMessagesInterceptor.prepareStarsForPayment({messageCount: 1, peerId});
          if(preparedPaymentResult === PAYMENT_REJECTED) throw new Error();

          this.managers.appMessagesManager.sendText({peerId, text: share.text, confirmedPaymentResult: preparedPaymentResult});
        }
      });
    }
  }

  public async confirmBotWebViewInner({
    botId,
    requestWriteAccess,
    showDisclaimer
  }: Parameters<AppImManager['confirmBotWebView']>[0]) {
    const peerId = botId.toPeerId();
    if(showDisclaimer) {
      const checkbox: Parameters<typeof confirmationPopup>[0]['checkbox'] = {
        text: 'WebApp.Disclaimer.Check',
        textArgs: [wrapRichText(I18n.format('WebAppDisclaimerUrl', true))]
      };

      return confirmationPopup({
        titleLangKey: 'TermsOfUse',
        descriptionLangKey: 'BotWebAppDisclaimerSubtitle',
        checkbox,
        button: {
          langKey: 'Continue',
          onlyWithCheckbox: checkbox
        }
      });
    }

    return confirmationPopup({
      title: await wrapPeerTitle({peerId}),
      descriptionLangKey: 'BotWebViewStartPermission',
      checkbox: requestWriteAccess ? {
        text: 'OpenUrlOption2',
        textArgs: [await wrapPeerTitle({peerId})],
        checked: true
      } : undefined,
      button: {
        langKey: 'BotWebAppInstantViewOpen'
      },
      peerId
    });
  }

  public async pushBotIdAsConfirmed(botId: BotId) {
    const state = await apiManagerProxy.getState();
    state.confirmedWebViews.push(botId);
    await this.managers.appStateManager.pushToState('confirmedWebViews', state.confirmedWebViews);
  }

  public async confirmBotWebView(options: {
    botId: BotId,
    requestWriteAccess?: boolean,
    ignoreConfirmedState?: boolean,
    showDisclaimer?: boolean
  }): Promise<boolean> {
    const state = await apiManagerProxy.getState();
    if(options.ignoreConfirmedState || options.showDisclaimer || !state.confirmedWebViews.includes(options.botId)) {
      const haveWriteAccess = await this.confirmBotWebViewInner(options);
      await this.pushBotIdAsConfirmed(options.botId);
      return haveWriteAccess;
    }
  }

  // public async requestBotAttachPermission(botId: BotId, requestWriteAccess?: boolean) {
  //   const peerId = botId.toPeerId();
  //   return confirmationPopup({
  //     button: {
  //       langKey: 'Add'
  //     },
  //     descriptionLangKey: 'BotRequestAttachPermission',
  //     descriptionLangArgs: [await wrapPeerTitle({peerId})],
  //     checkbox: requestWriteAccess ? {
  //       text: 'OpenUrlOption2',
  //       textArgs: [await wrapPeerTitle({peerId})],
  //       checked: true
  //     } : undefined,
  //     peerId,
  //     titleLangKey: 'AddBot'
  //   });
  // }

  public async toggleBotInAttachMenu(
    botId: BotId,
    enable: boolean,
    attachMenuBot?: AttachMenuBot
  ) {
    attachMenuBot ??= await this.managers.appAttachMenuBotsManager.getAttachMenuBot(botId);

    if(!!attachMenuBot.pFlags.inactive === !enable) {
      return attachMenuBot;
    }

    if(attachMenuBot.pFlags.inactive) {
      // const haveWriteAccess = await this.requestBotAttachPermission(botId, attachMenuBot.pFlags.request_write_access);
      await this.confirmBotWebViewInner({botId, showDisclaimer: true});
      await this.pushBotIdAsConfirmed(botId);
      const haveWriteAccess = true;

      await this.managers.appAttachMenuBotsManager.toggleBotInAttachMenu(botId, true, haveWriteAccess);
      // installed
      delete attachMenuBot.pFlags.inactive;

      toastNew({
        langPackKey: attachMenuBot.pFlags.show_in_attach_menu && attachMenuBot.pFlags.show_in_side_menu ?
          'BotAttachMenuShortcatAddedAttachAndSide' : (
            attachMenuBot.pFlags.show_in_attach_menu ?
              'BotAttachMenuShortcatAddedAttach' :
              'BotAttachMenuShortcatAddedSide'
          ),
        langPackArguments: [wrapEmojiText(attachMenuBot.short_name)]
      });
    } else {
      await this.managers.appAttachMenuBotsManager.toggleBotInAttachMenu(botId, false);
      attachMenuBot.pFlags.inactive = true;

      toastNew({
        langPackKey: attachMenuBot.pFlags.show_in_attach_menu && attachMenuBot.pFlags.show_in_side_menu ?
          'WebApp.AttachRemove.SuccessAll' : (
            attachMenuBot.pFlags.show_in_attach_menu ?
              'WebApp.AttachRemove.Success' :
              'WebApp.AttachRemove.SuccessSide'
          ),
        langPackArguments: [wrapEmojiText(attachMenuBot.short_name)]
      });
    }

    return attachMenuBot;
  }

  public async openWebApp(options: Partial<RequestWebViewOptions> & {
    onClose?: () => void
  }) {
    options.botId ??= options.attachMenuBot?.bot_id;
    options.themeParams ??= {
      _: 'dataJSON',
      data: JSON.stringify(themeController.getThemeParamsForWebView())
    };

    const onClose = options.onClose;
    delete options.onClose; // to avoid passing it to the worker

    if(
      !options.attachMenuBot/*  &&
      (options.fromAttachMenu || options.fromSideMenu) */
    ) {
      try {
        options.attachMenuBot = await this.managers.appAttachMenuBotsManager.getAttachMenuBot(options.botId);
      } catch(err) {}
    }

    if(!options.noConfirmation) {
      const attachMenuBot = options.attachMenuBot;
      let needDisclaimer: boolean;
      if(options.fromSideMenu) {
        if(attachMenuBot?.pFlags?.side_menu_disclaimer_needed) {
          needDisclaimer = true;
        } else {
          await this.pushBotIdAsConfirmed(options.botId);
        }
      } else {
        const user = apiManagerProxy.getUser(options.botId);
        needDisclaimer = user.pFlags.bot_attach_menu && attachMenuBot?.pFlags?.inactive;
      }

      if(needDisclaimer) {
        await this.toggleBotInAttachMenu(options.botId, true, attachMenuBot);
      } else {
        await this.confirmBotWebView({
          botId: options.botId
        });
      }
    }

    try {
      const cacheKeyArr = [options.botId, options.startParam];
      if(options.fromBotMenu || options.fromSideMenu || options.main) {
        cacheKeyArr.push('main');
      }

      const cacheKey = cacheKeyArr.join('-');

      const webViewResultUrl = await this.managers.appAttachMenuBotsManager.requestWebView(options as RequestWebViewOptions);
      const webAppOptions: Parameters<typeof openWebAppInAppBrowser>[0] = {
        webViewResultUrl,
        webViewOptions: options as RequestWebViewOptions,
        attachMenuBot: options.attachMenuBot,
        cacheKey,
        onClose
      };
      if(!IS_WEB_APP_BROWSER_SUPPORTED || options.forcePopup) {
        PopupElement.createPopup(PopupWebApp, webAppOptions);
      } else {
        openWebAppInAppBrowser(webAppOptions);
      }
    } catch(err) {
      if((err as ApiError).type === 'PEER_ID_INVALID' && options.attachMenuBot) {
        toastNew({
          langPackKey: 'BotAlreadyAddedToAttachMenu'
        });
      }
    }
  }

  public handleUrlAuth(options: {
    peerId?: PeerId,
    mid?: number,
    buttonId?: number,
    url: string
  }) {
    const {peerId, mid, buttonId, url} = options;

    const openWindow = (url: string) => {
      window.open(url, '_blank');
    };

    const onUrlAuthResultAccepted = (urlAuthResult: UrlAuthResult.urlAuthResultAccepted) => {
      openWindow(urlAuthResult.url);
    };

    const onUrlAuthResult = async(urlAuthResult: UrlAuthResult): Promise<void> => {
      if(urlAuthResult._ === 'urlAuthResultRequest') {
        const b = document.createElement('b');
        b.append(urlAuthResult.domain);
        const peerTitle = await wrapPeerTitle({peerId: rootScope.myId});
        const botPeerTitle = await wrapPeerTitle({peerId: urlAuthResult.bot.id.toPeerId()});

        const logInCheckbox: PopupPeerCheckboxOptions = {
          text: 'OpenUrlOption1',
          textArgs: [b.cloneNode(true), peerTitle],
          checked: true
        };

        const allowMessagesCheckbox: PopupPeerCheckboxOptions = urlAuthResult.pFlags.request_write_access ? {
          text: 'OpenUrlOption2',
          textArgs: [botPeerTitle],
          checked: true
        } : undefined;

        const checkboxes: PopupPeerCheckboxOptions[] = [
          logInCheckbox,
          allowMessagesCheckbox
        ];

        const confirmationPromise = confirmationPopup({
          titleLangKey: 'OpenUrlTitle',
          button: {
            langKey: 'Open'
          },
          descriptionLangKey: 'OpenUrlAlert2',
          descriptionLangArgs: [b],
          checkboxes: checkboxes.filter(Boolean)
        });

        if(allowMessagesCheckbox) {
          logInCheckbox.checkboxField.input.addEventListener('change', () => {
            const disabled = !logInCheckbox.checkboxField.checked;
            allowMessagesCheckbox.checkboxField.toggleDisability(disabled);

            if(disabled) {
              allowMessagesCheckbox.checkboxField.checked = false;
            }
          });
        }

        const [logInChecked, allowMessagesChecked] = await confirmationPromise;

        if(!logInChecked) {
          openWindow(url);
          return;
        }

        const result = await this.managers.appSeamlessLoginManager.acceptUrlAuth(
          url,
          peerId,
          mid,
          buttonId,
          allowMessagesChecked
        );

        return onUrlAuthResult(result);
      } else if(urlAuthResult._ === 'urlAuthResultAccepted') {
        onUrlAuthResultAccepted(urlAuthResult);
      } else {
        openWindow(url);
      }
    };

    return this.managers.appSeamlessLoginManager.requestUrlAuth(
      url,
      peerId,
      mid,
      buttonId
    ).then((urlAuthResult) => {
      onUrlAuthResult(urlAuthResult);
    });
  }

  private handleAutologinDomains() {
    let appConfig: MTAppConfig, config: Config.config;
    rootScope.addEventListener('app_config', (_appConfig) => appConfig = _appConfig);
    rootScope.addEventListener('config', (_config) => config = _config);
    this.managers.apiManager.getAppConfig().then((_appConfig) => appConfig = _appConfig);
    this.managers.apiManager.getConfig().then((_config) => config = _config);

    const onAuthAnchorClick = (element: HTMLAnchorElement) => {
      if(!appConfig) {
        return;
      }

      const url = new URL(element.href);
      if(appConfig.url_auth_domains?.includes(url.hostname)) {
        this.handleUrlAuth({url: element.href});
        cancelEvent();
        return;
      }

      const autologinToken = config.autologin_token;
      if(!autologinToken || !appConfig.autologin_domains) {
        return;
      }

      const originalUrl = element.dataset.originalUrl ??= element.href;
      if(appConfig.autologin_domains.includes(url.hostname)) {
        url.searchParams.set('autologin_token', autologinToken);
        element.href = url.toString();

        setTimeout(() => {
          element.href = originalUrl;
          delete element.dataset.originalUrl;
        }, 0);
      }
    };

    const onSponsoredAnchorClick = (element: HTMLAnchorElement) => {
      const bubble = findUpClassName(element, 'bubble');
      if(!bubble) {
        return;
      }

      const message = (bubble as any).message as Message.message;
      this.clickIfSponsoredMessage(message);
    };

    document.addEventListener('click', async(e) => {
      const anchor = findUpTag(e.target as HTMLElement, 'A') as HTMLAnchorElement;
      if(anchor?.href) {
        onAuthAnchorClick(anchor);
      }

      if(anchor) {
        onSponsoredAnchorClick(anchor);
      }

      const avatar = findUpAvatar(e.target);
      if(avatar && avatar.classList.contains('has-stories') && !findUpClassName(e.target, 'stories-list')) {
        this.openStoriesFromAvatar(avatar);
      }
    });

    // addAnchorListener({
    //   name: 'handleUrlClick',
    //   callback: (_, element) => {
    //     onAnchorClick(element);
    //   },
    //   noCancelEvent: true,
    //   noPathnameParams: true,
    //   noUriParams: true
    // });
  }

  private handlePeerColors() {
    let lastHelpPeerColors: HelpPeerColors.helpPeerColors;
    const onHelpPeerColors = (helpPeerColors: HelpPeerColors.helpPeerColors = lastHelpPeerColors) => {
      const user = apiManagerProxy.getUser(rootScope.myId.toUserId());
      setPeerColors(helpPeerColors.colors, user);
      lastHelpPeerColors = helpPeerColors;
    };
    rootScope.addEventListener('theme_changed', () => onHelpPeerColors());
    this.managers.apiManager.getPeerColors().then(onHelpPeerColors);

    const [_, setProfileColors] = useProfileColors();
    this.managers.apiManager.getPeerProfileColors().then((helpPeerColors) => {
      setProfileColors(helpPeerColors.colors);
    });
  }

  public clickIfSponsoredMessage(message: Message.message) {
    const sponsoredMessage = message?.sponsoredMessage;
    if(!sponsoredMessage) {
      return;
    }

    this.managers.appMessagesManager.clickSponsoredMessage(sponsoredMessage.random_id);
  }

  public async openStoriesFromAvatar(avatar: HTMLElement) {
    const storyId = +avatar.dataset.storyId;
    createStoriesViewerWithPeer({
      target: () => avatar,
      peerId: avatar.dataset.peerId.toPeerId(),
      id: storyId || undefined
    });
  }

  public getStackFromElement(element: HTMLElement): ChatSetPeerOptions['stack'] {
    let possibleBubble = findUpClassName(element, 'bubble');
    if(!possibleBubble) {
      const group = findUpClassName(element, 'bubbles-group');
      if(group) {
        possibleBubble = group.querySelector('.bubble');
      }
    }

    if(!possibleBubble) {
      return;
    }

    const chatContainer = findUpClassName(possibleBubble, 'chat');
    const chat = chatContainer && this.chats.find((chat) => chat.container === chatContainer);
    const peerId = chat?.peerId;
    const mid = +possibleBubble.dataset.mid;
    const message = possibleBubble.message || (peerId && apiManagerProxy.getMessageByPeer(peerId, mid));
    return {
      peerId,
      mid,
      message: message as Message.message,
      isOut: message ? !!(message as Message.message).pFlags.out : undefined
    };
  }

  private deleteFilesIterative(callback: (response: Response) => boolean) {
    return this.cacheStorage.timeoutOperation((cache) => {
      const perf = performance.now();
      return cache.keys().then((requests) => {
        const promises = requests.map((request) => {
          return cache.match(request).then((response) => {
            return callback(response);
          });
        });

        return Promise.all(promises).then((values) => {
          values.map((isBad, idx) => {
            if(!isBad) {
              return;
            }

            const request = requests[idx];
            return cache.delete(request);
          });

          return Promise.all(values.filter(Boolean));
        });
      }).then(() => {
        this.log('deleted files', performance.now() - perf);
      });
    });
  }

  private toggleChatGradientAnimation(activatingChat: Chat) {
    // this.chats.forEach((chat) => {
    //   if(chat.gradientRenderer) {
    //     chat.gradientRenderer.scrollAnimate(liteMode.isAvailable('animations') && chat === activatingChat);
    //   }
    // });
  }

  private appendEmojiAnimationContainer(screen: ScreenSize) {
    const appendTo = screen === ScreenSize.mobile ? this.columnEl : document.body;
    if(emojiAnimationContainer.parentElement !== appendTo) {
      appendTo.append(emojiAnimationContainer)
    }
  }

  private attachKeydownListener() {
    const IGNORE_KEYS = new Set(['PageUp', 'PageDown', 'Meta', 'Control']);
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const isSelectionCollapsed = document.getSelection().isCollapsed;
      if(overlayCounter.isOverlayActive || IGNORE_KEYS.has(key)) return;

      const target = e.target as HTMLElement;

      const isTargetAnInput = (target.tagName === 'INPUT' && !['checkbox', 'radio'].includes((target as HTMLInputElement).type)) || target.isContentEditable;

      // if(target.tagName === 'INPUT') return;

      // this.log('onkeydown', e, document.activeElement);

      const chat = this.chat;

      if(this.isShiftLockShortcut && e.shiftKey) return;

      if((key.startsWith('Arrow') || (e.shiftKey && key === 'Shift')) && !isSelectionCollapsed) {
        return;
      } else if(e.code === 'KeyC' && (e.ctrlKey || e.metaKey) && !isTargetAnInput) {
        return;
      } else if(e.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
        cancelEvent(e);
        this.managers.dialogsStorage.getNextDialog(this.chat.peerId, key === 'ArrowDown', appDialogsManager.filterId).then((dialog) => {
          if(dialog) {
            this.setPeer({peerId: dialog.peerId});
          }
        });
      } else if(key === 'ArrowUp' && this.chat?.type !== ChatType.Scheduled) {
        if(!appDialogsManager.contextMenu?.hasAddToFolderOpen() && !chat?.input?.editMsgId && chat?.input?.isInputEmpty()) {
          this.managers.appMessagesManager.getFirstMessageToEdit(chat.peerId, chat.threadId).then((message) => {
            if(message) {
              chat.input.initMessageEditing(message.mid);
              cancelEvent(e); // * prevent from scrolling
            }
          });
        } else {
          return;
        }
      } else if(key === 'ArrowDown') {
        return;
      }

      if(
        chat?.input?.messageInput &&
        target !== chat.input.messageInput &&
        !isTargetAnInput &&
        !IS_TOUCH_SUPPORTED &&
        (!mediaSizes.isMobile || this.tabId === APP_TABS.CHAT) &&
        !chat.selection.isSelecting &&
        !chat.input.recording &&
        chat.input.messageInput.isContentEditable
      ) {
        chat.input.passEventToInput(e);
      }
    };

    document.body.addEventListener('keydown', onKeyDown);
  }

  // * restrict copying no forwards content
  private attachCopyListener() {
    document.addEventListener('copy', (e) => {
      const nodes = getSelectedNodes();
      nodes.some((node) => {
        let element: HTMLElement = node as HTMLElement;
        if(node.nodeType !== node.ELEMENT_NODE) {
          element = node.parentElement;
        }

        if(!findUpClassName(element, 'no-forwards')) {
          return false;
        }

        const bubble = findUpClassName(element, 'bubble');
        if(!bubble) {
          return false;
        }

        e.preventDefault();
        const peerId = bubble.dataset.peerId.toPeerId();
        const chat = apiManagerProxy.getChat(peerId.toChatId());
        toastNew({
          langPackKey: (chat as MTChat.channel).pFlags.broadcast ? 'CopyRestricted.Channel' : 'CopyRestricted.Group'
        });

        return true;
      });
    });
  }

  public openUrl(url: string, newWindowIfNoClick?: boolean) {
    const {url: wrappedUrl, onclick} = wrapUrl(url);
    if(!onclick) {
      if(newWindowIfNoClick) {
        safeWindowOpen(wrappedUrl);
      }

      return;
    }

    const a = document.createElement('a');
    a.href = wrappedUrl;
    return (window as any)[onclick](a);
  }

  private onHashChange = (saveState?: boolean) => {
    try {
      this.onHashChangeUnsafe(saveState);
    } catch(err) {
      this.log.error('hash change error', err);
    }
  };

  private onHashChangeUnsafe = (saveState?: boolean) => {
    const hash = location.hash;
    if(!saveState) {
      appNavigationController.replaceState();
    }

    const splitted = hash.split('?');
    const params = parseUriParams(hash, splitted);
    this.log('hashchange', hash, splitted[0], params);
    if(!hash) {
      return;
    }

    if(params.tgaddr) {
      appNavigationController.replaceState();
      this.openUrl(params.tgaddr);
      return;
    }

    switch(splitted[0]) {
      default: {
        params.p = splitted[0].slice(1);
      }

      case '#/im': {
        if(!Object.keys(params).length) {
          break;
        }

        const p: string = params.p;
        const postId = params.post !== undefined ? +params.post : undefined;
        const messageId = postId || (params.message !== undefined ? +params.message : undefined);
        const threadId = params.thread !== undefined ? +params.thread : undefined;

        switch(p[0]) {
          case '@': {
            this.openUsername({
              userName: p,
              lastMsgId: messageId,
              threadId
            });
            break;
          }

          default: { // peerId
            const peerId = postId ? p.toPeerId(true) : p.toPeerId();
            this.managers.appPeersManager.getPeer(peerId).then((peer) => {
              this.op({
                peer,
                lastMsgId: messageId,
                threadId,
                call: params.call
              });
            });
            break;
          }
        }
      }
    }

    // appNavigationController.replaceState();
    // location.hash = '';
  };

  public onSponsoredBoxClick = (message: Message.message) => {
    const sponsoredMessage = message.sponsoredMessage;
    if(!sponsoredMessage) return;
    this.onSponsoredMessageClick(sponsoredMessage);
  };

  public onSponsoredMessageClick = (message: SponsoredMessage) => {
    this.managers.appMessagesManager.clickSponsoredMessage(message.random_id);
    const wrapped = wrapUrl(message.url);

    if(wrapped.onclick) {
      this.chat.appImManager.openUrl(message.url);
    } else {
      safeWindowOpen(wrapped.url);
    }
  }

  public async open(options: Omit<Parameters<AppImManager['op']>[0], 'peer'> & {peerId: PeerId}) {
    return this.op({
      ...options,
      peer: await this.managers.appPeersManager.getPeer(options.peerId)
    });
  }

  public async op(options: {
    peer: User.user | MTChat
  } & Omit<ChatSetPeerOptions, 'peerId'>) {
    if(!options.peer) {
      return;
    }

    const isUser = options.peer._ === 'user';
    const isChannel = options.peer._ === 'channel';
    let peerId = options.peer.id.toPeerId(!isUser);

    const keys: Extract<keyof typeof options, 'commentId' | 'lastMsgId' | 'threadId'>[] = [
      'commentId',
      'lastMsgId',
      'threadId'
    ];

    const channelId = isChannel ? (options.peer as MTChat.channel).id : undefined;
    const isForum = !!(options.peer as MTChat.channel).pFlags.forum;

    await Promise.all(keys.map(async(key) => {
      options[key] &&= await this.managers.appMessagesIdsManager.generateMessageId(options[key], channelId);
    }));

    const migratedTo = (options.peer as MTChat.chat).migrated_to;
    if(migratedTo) {
      const channelId = (migratedTo as InputChannel.inputChannel).channel_id;
      options.peer = await this.managers.appChatsManager.getChat(channelId);
      peerId = channelId.toPeerId(true);
    }

    let {commentId, threadId, lastMsgId} = options;

    // open forum tab
    if(!commentId && !threadId && !lastMsgId && isForum) {
      appDialogsManager.toggleForumTabByPeerId(peerId, true, true);
      return;
    }

    // handle t.me/username/thread or t.me/username/messageId
    if(isForum && lastMsgId && !threadId) {
      const message = await this.managers.appMessagesManager.reloadMessages(peerId, lastMsgId);
      if(message) {
        threadId = options.threadId = getMessageThreadId(message, isForum);
      } else {
        threadId = options.threadId = lastMsgId;
        lastMsgId = options.lastMsgId = undefined;
      }
    }

    if(options.call) {
      const call = await rootScope.managers.appCallsManager.getCall(options.call);
      rootScope.dispatchEvent('call_update', call);
    }

    if(threadId) {
      return this.openThread({
        ...(options as any as Parameters<AppImManager['openThread']>[0]),
        peerId
      });
    } else if(commentId) {
      return this.openComment({
        peerId,
        msgId: lastMsgId,
        commentId
      });
    }

    return this.setInnerPeer({
      ...options,
      peerId
    });
  }

  public openPremiumBot() {
    return this.managers.apiManager.getAppConfig().then((appConfig) => {
      return this.openUsername({userName: appConfig.premium_bot_username});
    });
  }

  public openUsername(options: {
    userName: string
  } & Omit<ChatSetPeerOptions, 'peerId'>) {
    const {userName} = options;
    return this.managers.appUsersManager.resolveUsername(userName).then((peer) => {
      return this.op({
        peer,
        ...options
      });
    }, (err: ApiError) => {
      if(err.type === 'USERNAME_NOT_OCCUPIED') {
        toastNew({langPackKey: 'NoUsernameFound'});
      } else if(err.type === 'USERNAME_INVALID') {
        toastNew({langPackKey: 'Alert.UserDoesntExists'});
      }
    });
  }

  /**
   * Opens thread when peerId of discussion group is known
   */
  public async openThread(options: {
    peerId: PeerId,
    lastMsgId: number,
    threadId: number,
    stack?: ChatSetPeerOptions['stack']
  }) {
    if(await this.managers.appChatsManager.isForum(options.peerId.toChatId())) {
      await this.managers.dialogsStorage.getForumTopicOrReload(options.peerId, options.threadId);
      return this.setInnerPeer(options);
    }

    return this.managers.appMessagesManager.reloadMessages(options.peerId, options.threadId).then(async(message) => {
      if(!message) {
        options.lastMsgId = undefined;
      }

      return this.setInnerPeer({
        ...options,
        type: ChatType.Discussion
      });
    });
  }

  /**
   * Opens comment directly from original channel
   */
  public openComment(options: {
    peerId: PeerId,
    msgId: number,
    commentId: number
  }) {
    return this.managers.appMessagesManager.getDiscussionMessage(options.peerId, options.msgId).then((message) => {
      return this.openThread({
        peerId: message.peerId,
        lastMsgId: options.commentId,
        threadId: message.mid
      });
    });
  }

  public async callUser(userId: UserId, type: CallType) {
    const call = callsController.getCallByUserId(userId);
    if(call) {
      return;
    }

    const userFull = await this.managers.appProfileManager.getProfile(userId);
    if(userFull.pFlags.phone_calls_private) {
      wrapPeerTitle({peerId: userId.toPeerId()}).then((element) => {
        return confirmationPopup({
          descriptionLangKey: 'Call.PrivacyErrorMessage',
          descriptionLangArgs: [element],
          button: {
            langKey: 'OK',
            isCancel: true
          }
        });
      });

      return;
    }

    await this.discardCurrentCall(userId.toPeerId(), 'Call');

    callsController.startCallInternal(userId, type === 'video');
  }

  private discardCurrentCall(toPeerId: PeerId, toType: 'Live' | 'Voice' | 'Call', ignoreGroupCall?: GroupCallInstance, ignoreCall?: CallInstance, ignoreLive?: RtmpCallInstance): Promise<void> {
    if(groupCallsController.groupCall && groupCallsController.groupCall !== ignoreGroupCall) return this.discardGroupCallConfirmation(toPeerId, toType);
    else if(callsController.currentCall && callsController.currentCall !== ignoreCall) return this.discardCallConfirmation(toPeerId, toType);
    else if(rtmpCallsController.currentCall && rtmpCallsController.currentCall !== ignoreLive) return this.discardLiveConfirmation(toPeerId, toType);
    else return Promise.resolve();
  }

  private async discardAnyCallConfirmation(fromPeerId: PeerId, toPeerId: PeerId, fromType: Parameters<AppImManager['discardCurrentCall']>[1], toType: Parameters<AppImManager['discardCurrentCall']>[1]) {
    await Promise.all([
      wrapPeerTitle({peerId: fromPeerId}),
      wrapPeerTitle({peerId: toPeerId})
    ]).then(([title1, title2]) => {
      return confirmationPopup({
        titleLangKey: `Call.Confirm.Discard.${fromType}.Header`,
        descriptionLangKey: `Call.Confirm.Discard.${fromType}.To${toType}.Text`,
        descriptionLangArgs: [title1, title2],
        button: {
          langKey: 'OK'
        }
      });
    });
  }

  private async discardGroupCallConfirmation(toPeerId: PeerId, toType: Parameters<AppImManager['discardCurrentCall']>[1]) {
    const currentCall = groupCallsController.groupCall;
    if(currentCall) {
      await this.discardAnyCallConfirmation(currentCall.chatId.toPeerId(true), toPeerId, 'Voice', toType);

      if(groupCallsController.groupCall === currentCall) {
        await currentCall.hangUp();
      }
    }
  }

  private async discardCallConfirmation(toPeerId: PeerId, toType: Parameters<AppImManager['discardCurrentCall']>[1]) {
    const currentCall = callsController.currentCall;
    if(currentCall) {
      await this.discardAnyCallConfirmation(currentCall.interlocutorUserId.toPeerId(false), toPeerId, 'Call', toType);

      if(!currentCall.isClosing) {
        await currentCall.hangUp('phoneCallDiscardReasonDisconnect');
      }
    }
  }

  private async discardLiveConfirmation(toPeerId: PeerId, toType: Parameters<AppImManager['discardCurrentCall']>[1]) {
    const currentCall = rtmpCallsController.currentCall;
    if(currentCall) {
      await this.discardAnyCallConfirmation(currentCall.chatId.toPeerId(true), toPeerId, 'Live', toType);

      if(rtmpCallsController.currentCall === currentCall) {
        await rtmpCallsController.leaveCall();
      }
    }
  }

  public async joinGroupCall(peerId: PeerId, groupCallId?: GroupCallId) {
    const chatId = peerId.toChatId();
    const hasRights = this.managers.appChatsManager.hasRights(chatId, 'manage_call');
    const next = async() => {
      const chatFull = await this.managers.appProfileManager.getChatFull(chatId);
      let call: MyGroupCall;
      if(!chatFull.call) {
        if(!hasRights) {
          return;
        }

        call = await this.managers.appGroupCallsManager.createGroupCall(chatId);
      } else {
        call = chatFull.call as InputGroupCall.inputGroupCall;
      }

      groupCallsController.joinGroupCall(chatId, call.id, true, false);
    };

    if(groupCallId) {
      const groupCall = await this.managers.appGroupCallsManager.getGroupCallFull(groupCallId);
      if(groupCall._ === 'groupCallDiscarded') {
        if(!hasRights) {
          toastNew({
            langPackKey: 'VoiceChat.Chat.Ended'
          });

          return;
        }

        await confirmationPopup({
          descriptionLangKey: 'VoiceChat.Chat.StartNew',
          button: {
            langKey: 'VoiceChat.Chat.StartNew.OK'
          }
        });
      }
    }

    await this.discardCurrentCall(peerId, 'Voice');

    next();
  }

  public async joinLiveStream(peerId: PeerId) {
    await this.discardCurrentCall(peerId, 'Live');

    await rtmpCallsController.joinCall(peerId.toChatId()).catch((err) => {
      console.error(err);
      toastNew({
        langPackKey: 'Error.AnError'
      });
    });

    this.openLiveStreamPlayer(peerId);
  }

  private async openLiveStreamPlayer(peerId: PeerId) {
    if(AppMediaViewerRtmp.activeInstance) return;

    const shareUrl = await AppMediaViewerRtmp.getShareUrl(peerId.toChatId());
    new AppMediaViewerRtmp(shareUrl).openMedia({
      peerId,
      isAdmin: rtmpCallsController.currentCall.admin
    });
  }

  public setCurrentBackground(broadcastEvent = false, skipAnimation?: boolean): ReturnType<AppImManager['setBackground']> {
    const theme = themeController.getTheme();

    const slug = (theme.settings?.wallpaper as WallPaper.wallPaper)?.slug;
    if(slug) {
      const defaultTheme = SETTINGS_INIT.themes.find((t) => t.name === theme.name);
      // const isDefaultBackground = theme.background.blur === defaultTheme.background.blur &&
      // slug === defaultslug;

      // if(!isDefaultBackground) {
      return Promise.resolve(ChatBackgroundStore.getBackground({
        slug,
        managers: this.managers,
        appDownloadManager
      })).then((url) => {
        return this.setBackground(url, broadcastEvent, skipAnimation);
      }, () => { // * if NO_ENTRY_FOUND
        theme.settings = copy(defaultTheme.settings); // * reset background
        return this.setCurrentBackground(true);
      });
      // }
    }

    return this.setBackground('', broadcastEvent, skipAnimation);
  }

  public setBackground(url: string, broadcastEvent = true, skipAnimation?: boolean): Promise<void> {
    this.lastBackgroundUrl = url;
    const promises = this.chats.map((chat) => chat.setBackgroundIfNotSet({url, skipAnimation}));
    return Promise.resolve(promises[promises.length - 1]).then(() => {
      if(broadcastEvent) {
        rootScope.dispatchEvent('background_change');
      }
    });
  }

  public saveChatPosition(chat: Chat) {
    if(!([ChatType.Chat, ChatType.Discussion, ChatType.Saved] as ChatType[]).includes(chat.type) || !chat.peerId) {
      return;
    }

    // const bubble = chat.bubbles.getBubbleByPoint('top');
    // if(bubble) {
    // const top = bubble.getBoundingClientRect().top;
    const chatBubbles = chat.bubbles;
    const key = chat.peerId + (chat.threadId ? '_' + chat.threadId : '');

    const chatPositions = this.chatPositions;
    if(
      !(chatBubbles.scrollable.getDistanceToEnd() <= 16 && chatBubbles.scrollable.loadedAll.bottom) &&
      chatBubbles.getRenderedLength() &&
      !chat.savedReaction &&
      chatBubbles.getViewportSlice().invisibleBottom.length // * don't save if we're close to the end (or sponsored is below)
    ) {
      chatBubbles.sliceViewport(true);
      const top = chatBubbles.scrollable.scrollPosition;

      const position = {
        mids: chatBubbles.getRenderedHistory('desc', true).map((fullMid) => splitFullMid(fullMid).mid),
        top
      };

      chatPositions[key] = position;

      this.log('saved chat position:', position);
    } else {
      delete chatPositions[key];

      this.log('deleted chat position');
    }

    this.chatPositions = chatPositions;
    // }
  }

  public getChatSavedPosition(chat: Chat): ChatSavedPosition {
    if(!([ChatType.Chat, ChatType.Discussion, ChatType.Saved] as ChatType[]).includes(chat.type) || !chat.peerId) {
      return;
    }

    const threadId = chat.threadId || chat.monoforumThreadId;
    const key = chat.peerId + (threadId ? '_' + threadId : '');
    return this.chatPositions[key];
  }

  public applyCurrentTheme({
    slug,
    backgroundUrl,
    broadcastEvent,
    noSetTheme,
    skipAnimation
  }: {
    slug?: string,
    backgroundUrl?: string,
    broadcastEvent?: boolean,
    noSetTheme?: boolean,
    skipAnimation?: boolean
  } = {}) {
    if(backgroundUrl) {
      ChatBackgroundStore.setBackgroundUrlToCache({slug, url: backgroundUrl});
    }

    !noSetTheme && themeController.setTheme();

    return this.setCurrentBackground(
      broadcastEvent === undefined ? !!slug : broadcastEvent,
      skipAnimation
    );
  }

  private setSettings = () => {
    const {messagesTextSize} = rootScope.settings;

    this.customEmojiSize = makeMediaSize(messagesTextSize + 4, messagesTextSize + 4);
    document.documentElement.style.setProperty('--messages-text-size', messagesTextSize + 'px');

    const firstTime = !this.customEmojiSize;
    if(!firstTime) {
      const ellipsisElements = document.querySelectorAll<MiddleEllipsisElement>('middle-ellipsis-element');
      ellipsisElements.forEach((element) => {
        element.disconnectedCallback();
        element.dataset.fontSize = '' + messagesTextSize;
        if(element.title) element.textContent = element.title;
        element.connectedCallback();
      });

      const renderers = document.querySelectorAll<CustomEmojiRendererElement>('.chat custom-emoji-renderer-element');
      renderers.forEach((renderer) => {
        renderer.forceRenderAfterSize = true;
      });
    }

    document.body.classList.toggle('animation-level-0', !liteMode.isAvailable('animations'));
    document.body.classList.toggle('animation-level-1', false);
    document.body.classList.toggle('animation-level-2', liteMode.isAvailable('animations'));

    this.chatsSelectTabDebounced = debounce(() => {
      const topbar = this.chat.topbar;
      topbar.pinnedMessage?.setCorrectIndex(0); // * буду молиться богам, чтобы это ничего не сломало, но это исправляет получение пиннеда после анимации

      this.managers.apiFileManager.setQueueId(this.chat.bubbles.lazyLoadQueue.queueId);
    }, liteMode.isAvailable('animations') ? 250 : 0, false, true);

    const c: LiteModeKey[] = ['stickers_chat', 'stickers_panel'];
    const changedLoop = animationIntersector.setLoop(rootScope.settings.stickers.loop);
    const changedAutoplay = !!c.filter((key) => animationIntersector.setAutoplay(liteMode.isAvailable(key), key)).length;
    if(changedLoop || changedAutoplay) {
      animationIntersector.checkAnimations2(false);
    }

    for(const chat of this.chats) {
      chat.setAutoDownloadMedia();
    }

    I18n.setTimeFormat(rootScope.settings.timeFormat);

    this.toggleChatGradientAnimation(this.chat);
  };

  // * не могу использовать тут TransitionSlider, так как мне нужен отрисованный блок рядом
  // * (или под текущим чатом) чтобы правильно отрендерить чат (напр. scrollTop)
  private chatsSelectTab(tab: HTMLElement, animate?: boolean) {
    if(this.prevTab === tab) {
      return;
    }

    if(animate === false && this.prevTab) { // * will be used for Safari iOS history swipe
      disableTransition([tab, this.prevTab].filter(Boolean));
    }

    if(this.prevTab) {
      this.prevTab.classList.remove('active');
      this.chatsSelectTabDebounced();

      // ! нужно переделать на animation, так как при лаге анимация будет длиться не 250мс
      if(liteMode.isAvailable('animations') && animate !== false) {
        dispatchHeavyAnimationEvent(pause(250 + 150), 250 + 150);
      }

      const prevIdx = whichChild(this.prevTab);
      const idx = whichChild(tab);
      if(idx > prevIdx) {
        appNavigationController.pushItem({
          type: 'chat',
          onPop: (canAnimate) => {
            this.setPeer({}, canAnimate);
            blurActiveElement();
          }
        });
      }
    }

    tab.classList.add('active');
    this.prevTab = tab;
  }

  private init() {
    document.addEventListener('paste', this.onDocumentPaste, true);

    if(!IS_TOUCH_SUPPORTED) {
      this.attachDragAndDropListeners();
    }

    // if(!isTouchSupported) {
    MarkupTooltip.getInstance().handleSelection();
    // }

    // PopupElement.createPopup(PopupStars);
  }

  private attachDragAndDropListeners() {
    const drops: ChatDragAndDrop[] = [];
    const mediaDrops: ChatDragAndDrop[] = [];
    let mounted = false;
    const toggle = async(e: DragEvent, mount: boolean) => {
      if(mount === mounted/*  || !mount */) return;

      const _types = e.dataTransfer.types;
      // @ts-ignore
      const isFiles = _types.contains ? _types.contains('Files') : _types.indexOf('Files') >= 0;

      const newMediaPopup = getCurrentNewMediaPopup();
      const types: string[] = await getFilesFromEvent(e, true);
      if(!isFiles || (!(await this.canDrag()) && !newMediaPopup)) { // * skip dragging text case
        counter = 0;
        return;
      }

      const rights = await PopupNewMedia.canSend({...this.chat.getMessageSendingParams(), onlyVisible: true});

      const _dropsContainer = newMediaPopup ? mediaDropsContainer : dropsContainer;
      const _drops = newMediaPopup ? mediaDrops : drops;

      if(mount && !_drops.length) {
        const force = isFiles && !types.length; // * can't get file items not from 'drop' on Safari

        const [foundMedia, foundDocuments] = partition(types, (t) => MEDIA_MIME_TYPES_SUPPORTED.has(t));
        const [foundPhotos, foundVideos] = partition(foundMedia, (t) => IMAGE_MIME_TYPES_SUPPORTED.has(t));

        if(!rights.send_docs) {
          foundDocuments.length = 0;
        } else {
          foundDocuments.push(...foundMedia);
        }

        if(!rights.send_photos) {
          foundPhotos.forEach((mimeType) => indexOfAndSplice(foundMedia, mimeType));
          foundPhotos.length = 0;
        }

        if(!rights.send_videos) {
          foundVideos.forEach((mimeType) => indexOfAndSplice(foundMedia, mimeType));
          foundVideos.length = 0;
        }

        this.log('drag files', types, foundMedia, foundDocuments, foundPhotos, foundVideos);

        if(newMediaPopup) {
          newMediaPopup.appendDrops(_dropsContainer);

          const length = (rights.send_docs ? [foundDocuments] : [foundPhotos, foundVideos]).reduce((acc, v) => acc + v.length, 0);
          if(length || force) {
            _drops.push(new ChatDragAndDrop(_dropsContainer, {
              header: 'Preview.Dragging.AddItems',
              headerArgs: [length],
              onDrop: (e: DragEvent) => {
                toggle(e, false);
                this.log('drop', e);
                this.onDocumentPaste(e, 'document');
              }
            }));
          }
        } else {
          if(foundDocuments.length || force) {
            _drops.push(new ChatDragAndDrop(_dropsContainer, {
              icon: 'dragfiles',
              header: 'Chat.DropTitle',
              subtitle: 'Chat.DropAsFilesDesc',
              onDrop: (e: DragEvent) => {
                toggle(e, false);
                this.log('drop', e);
                this.onDocumentPaste(e, 'document');
              }
            }));
          }

          if(foundMedia.length || force) {
            _drops.push(new ChatDragAndDrop(_dropsContainer, {
              icon: 'dragmedia',
              header: 'Chat.DropTitle',
              subtitle: 'Chat.DropQuickDesc',
              onDrop: (e: DragEvent) => {
                toggle(e, false);
                this.log('drop', e);
                this.onDocumentPaste(e, 'media');
              }
            }));
          }

          this.chat.container.append(_dropsContainer);
        }
      }

      // if(!mount) return;

      SetTransition({
        element: _dropsContainer,
        className: 'is-visible',
        forwards: mount,
        duration: 200,
        onTransitionEnd: () => {
          if(!mount) {
            _drops.forEach((drop) => {
              drop.destroy();
            });

            _drops.length = 0;
          }
        }
      });

      if(mount) {
        _drops.forEach((drop) => {
          drop.setPath();
        });
      } else {
        counter = 0;
      }

      document.body.classList.toggle('is-dragging', mount);
      mounted = mount;
    };

    /* document.body.addEventListener('dragover', (e) => {
      cancelEvent(e);
    }); */

    let counter = 0;
    document.body.addEventListener('dragenter', (e) => {
      ++counter;
    });

    document.body.addEventListener('dragover', (e) => {
      // this.log('dragover', e/* , e.dataTransfer.types[0] */);
      toggle(e, true);
      cancelEvent(e);
    });

    document.body.addEventListener('dragleave', (e) => {
      // this.log('dragleave', e, counter);
      // if((e.pageX <= 0 || e.pageX >= this.managers.appPhotosManager.windowW) || (e.pageY <= 0 || e.pageY >= this.managers.appPhotosManager.windowH)) {
      if(--counter === 0) {
      // if(!findUpClassName(e.target, 'drops-container')) {
        toggle(e, false);
      }
    });

    const dropsContainer = document.createElement('div');
    dropsContainer.classList.add('drops-container');

    const mediaDropsContainer = dropsContainer.cloneNode(true) as HTMLElement;
  }

  private async canDrag() {
    const chat = this.chat;
    const peerId = chat?.peerId;
    const good = !(!peerId || overlayCounter.isOverlayActive || !(await chat.canSend('send_media')));
    if(good) {
      if(await this.chat.input.showSlowModeTooltipIfNeeded({
        element: this.chat.input.attachMenu
      })) {
        return false;
      }
    }

    return good;
  }

  private onDocumentPaste = async(e: ClipboardEvent | DragEvent, attachType?: 'media' | 'document') => {
    const newMediaPopup = getCurrentNewMediaPopup();

    // console.log('document paste');
    // console.log('item', event.clipboardData.getData());

    if(e instanceof DragEvent) {
      const _types = e.dataTransfer.types;
      // @ts-ignore
      const isFiles = _types.contains ? _types.contains('Files') : _types.indexOf('Files') >= 0;
      if(isFiles) {
        cancelEvent(e);
      }
    }

    const files = await getFilesFromEvent(e);
    if(!(await this.canDrag()) && !newMediaPopup) return;
    if(files.length) {
      if(newMediaPopup) {
        newMediaPopup.addFiles(files);
        return;
      }

      const chatInput = this.chat.input;
      if(!chatInput.canPaste()) return;

      chatInput.willAttachType = attachType || (MEDIA_MIME_TYPES_SUPPORTED.has(files[0].type) ? 'media' : 'document');
      PopupElement.createPopup(PopupNewMedia, this.chat, files, chatInput.willAttachType);
    }
  };

  private async overrideHash(peerId?: PeerId) {
    let str: string;
    if(peerId) {
      const username = await this.managers.appPeersManager.getPeerUsername(peerId);
      str = username ? '@' + username : '' + peerId;
    }

    appNavigationController.overrideHash(str);
  }

  public selectTab(id: APP_TABS, animate?: boolean) {
    if(animate === false) { // * will be used for Safari iOS history swipe
      disableTransition([appSidebarLeft.sidebarEl, this.columnEl, appSidebarRight.sidebarEl]);
    }

    document.body.classList.toggle(LEFT_COLUMN_ACTIVE_CLASSNAME, id === APP_TABS.CHATLIST);

    const prevTabId = this.tabId;
    if(prevTabId !== undefined) {
      this.overrideHash(id > APP_TABS.CHATLIST ? this.chat?.peerId : undefined);
      this.dispatchEvent('tab_changing', id);
    }

    this.log('selectTab', id, prevTabId);

    let animationPromise: Promise<any> = liteMode.isAvailable('animations') ? doubleRaf() : Promise.resolve();
    if(
      prevTabId !== undefined &&
      prevTabId !== id &&
      liteMode.isAvailable('animations') &&
      animate !== false &&
      mediaSizes.activeScreen !== ScreenSize.large
    ) {
      const transitionTime = (mediaSizes.isMobile ? 250 : 200) + 100; // * cause transition time could be > 250ms
      animationPromise = pause(transitionTime);
      dispatchHeavyAnimationEvent(animationPromise, transitionTime);

      // ! it's very heavy operation. will blink in firefox
      /* this.columnEl.classList.add('disable-hover');
      animationPromise.finally(() => {
        this.columnEl.classList.remove('disable-hover');
      }); */
    }

    this.tabId = id;
    blurActiveElement();
    if(mediaSizes.isMobile && prevTabId === APP_TABS.PROFILE && id < APP_TABS.PROFILE) {
      appSidebarRight.hide();
    }

    if(prevTabId !== undefined && id > prevTabId) {
      if(id < APP_TABS.PROFILE || !appNavigationController.findItemByType('im')) {
        appNavigationController.pushItem({
          type: 'im',
          onPop: (canAnimate) => {
            // this.selectTab(prevTabId, !isSafari);
            this.setPeer({}, canAnimate);
          }
        });
      }
    }

    const onImTabChange = (window as any).onImTabChange;
    onImTabChange?.(id);

    // this._selectTab(id, mediaSizes.isMobile);
    // document.body.classList.toggle(RIGHT_COLUMN_ACTIVE_CLASSNAME, id === 2);

    return animationPromise;
  }

  public updateStatus() {
    return this.managers.appUsersManager.updateMyOnlineStatus(this.offline);
  }

  public goOffline() {
    this.offline = true;
    this.updateStatus();
  }

  private createNewChat() {
    const chat = new Chat(
      this,
      this.managers,
      true
    );

    this.chatsContainer.append(chat.container);

    // if(this.chats.length) {
    //   chat.setBackground({url: this.lastBackgroundUrl, skipAnimation: true});
    // }

    this.chats.push(chat);

    return chat;
  }

  private spliceChats(fromIndex: number, justReturn = true, animate?: boolean, spliced?: Chat[]) {
    if(fromIndex >= this.chats.length) return;

    const chatFrom = this.chat;
    if(this.chats.length > 1 && justReturn) {
      this.dispatchEvent('peer_changing', this.chat);
    }

    if(!spliced) {
      spliced = this.chats.splice(fromIndex, this.chats.length - fromIndex);
    }

    const chatTo = this.chat;
    this.dispatchEvent('chat_changing', {from: chatFrom, to: chatTo});

    // * -1 because one item is being sliced when closing the chat by calling .removeByType
    for(let i = 0; i < spliced.length - 1; ++i) {
      appNavigationController.removeByType('chat', true);
    }

    // * fix middle chat z-index on animation
    if(spliced.length > 1) {
      spliced.slice(0, -1).forEach((chat) => {
        chat.container.remove();
      });
    }

    this.chatsSelectTab(chatTo.container, animate);

    if(justReturn) {
      this.dispatchEvent('peer_changed', chatTo);

      const searchTab = appSidebarRight.getTab(AppPrivateSearchTab);
      searchTab?.close();

      appSidebarRight.replaceSharedMediaTab(chatTo.sharedMediaTab);
    }

    spliced.forEach((chat) => {
      chat.beforeDestroy();
    });

    setTimeout(() => {
      // chat.setPeer(0);
      spliced.forEach((chat) => {
        chat.destroy();
      });
    }, 250 + 100);
  }

  public async setPeer(options: Partial<ChatSetInnerPeerOptions> = {}, animate?: boolean): Promise<boolean> {
    options.peerId ??= NULL_PEER_ID;
    options.peerId = await this.managers.appPeersManager.getPeerMigratedTo(options.peerId) || options.peerId;

    const {peerId, lastMsgId, threadId} = options;

    // * replenish `min` peer
    if(peerId && options.stack) {
      const peer = apiManagerProxy.getPeer(peerId);
      const isMin = peer && (peer as User.user).pFlags.min;
      if(isMin && peerId.isUser()) {
        await this.managers.appUsersManager.getApiUsers([{
          _: 'inputUserFromMessage',
          msg_id: getServerMessageId(options.stack.mid),
          peer: await this.managers.appPeersManager.getInputPeerById(options.stack.peerId),
          user_id: peerId.toUserId()
        }]);
      } else if(isMin) {
        await this.managers.appChatsManager.resolveChannel({
          _: 'inputChannelFromMessage',
          msg_id: getServerMessageId(options.stack.mid),
          peer: await this.managers.appPeersManager.getInputPeerById(options.stack.peerId),
          channel_id: peerId.toChatId()
        });
      }
    }

    const chat = this.chat;
    const chatIndex = this.chats.indexOf(chat);
    const isSamePeer = this.isSamePeer(chat, options as any);
    if(!peerId) {
      if(options.isDeleting) {
        await this.selectTab(APP_TABS.CHATLIST, animate);
        await chat.setPeer(options as any as Parameters<Chat['setPeer']>[0]);
        return;
      }

      if(chatIndex > 0) {
        this.spliceChats(chatIndex, undefined, animate);
        return;
      } else if(mediaSizes.isFloatingLeftSidebar) {
        this.selectTab(+!this.tabId, animate);
        return;
      }
    } else if(chatIndex > 0 && chat.peerId && !isSamePeer) {
      // const firstChat = this.chats[0];
      // if(firstChat.peerId !== chat.peerId) {
      /* // * slice idx > 0, set background and slice first, so new one will be the first
        const spliced = this.chats.splice(1, this.chats.length - 1);
        this.createNewChat();
        this.chats.splice(0, 1); */
      const spliced = this.chats.splice(1, this.chats.length - 1);
      if(this.chat.peerId === peerId) {
        this.spliceChats(0, true, true, spliced);
        return;
      } else {
        const ret = this.setPeer(options);
        this.spliceChats(0, false, false, spliced);
        return ret;
      }
      // } else {
      //   this.spliceChats(1, false, animate);
      // }

      // return ret;
    }

    // * don't reset peer if returning
    if(isSamePeer && mediaSizes.activeScreen <= ScreenSize.medium && document.body.classList.contains(LEFT_COLUMN_ACTIVE_CLASSNAME)) {
      this.selectTab(APP_TABS.CHAT, animate);
      return false;
    }

    if(peerId || mediaSizes.activeScreen !== ScreenSize.mobile) {
      const result = await chat.setPeer(options as any as Parameters<Chat['setPeer']>[0]);

      // * wait for cached render
      const promise = result?.cached ? result.promise : Promise.resolve();
      if(peerId) {
        Promise.all([
          promise,
          chat.setBackgroundPromise
        ]).then(() => {
          // window.requestAnimationFrame(() => {
          setTimeout(() => { // * setTimeout is better here
            setTimeout(() => {
              this.chatsSelectTab(this.chat.container);
            }, 0);
            this.selectTab(APP_TABS.CHAT, animate);
          }, 0);
        });
      }
    }

    if(!peerId) {
      this.selectTab(APP_TABS.CHATLIST, animate);
      return false;
    }
  }

  public async setInnerPeer(options: ChatSetInnerPeerOptions) {
    let {peerId} = options;
    if(peerId === NULL_PEER_ID || !peerId) {
      return;
    }

    peerId = options.peerId = await this.managers.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    if(!options.type) {
      if(options.threadId) {
        if(options.peerId === rootScope.myId) {
          options.type = ChatType.Saved;
        } else if(!apiManagerProxy.isForum(options.peerId)) {
          options.type = ChatType.Discussion;
        }
      }

      options.type ??= ChatType.Chat;
    }

    // * reuse current chat
    const existingIndex = this.chats.findIndex((chat) => this.isSamePeer(chat, options) || (mediaSizes.activeScreen === ScreenSize.mobile && this.tabId === 0));
    if(existingIndex !== -1) {
      this.spliceChats(existingIndex + 1);
      return this.setPeer(options);
    }

    const oldChat = this.chat;
    let chat = oldChat;
    if(oldChat.inited) { // * use first not inited chat
      chat = this.createNewChat();
    }

    this.dispatchEvent('chat_changing', {from: oldChat, to: chat});

    // this.chatsSelectTab(chat.container);

    return this.setPeer(options);
  }

  public openScheduled(peerId: PeerId) {
    this.setInnerPeer({
      peerId,
      type: ChatType.Scheduled
    });
  }

  public async toggleViewAsMessages(peerId: PeerId, enabled: boolean) {
    if(peerId === rootScope.myId) {
      setAppState('settings', 'savedAsForum', !enabled);
    } else {
      await this.managers.appChatsManager.toggleViewForumAsMessages(peerId.toChatId(), enabled);
    }

    this.selectTab(APP_TABS.CHATLIST);
    appDialogsManager.toggleForumTabByPeerId(peerId, !enabled, false);
  }

  private getTypingElement(action: SendMessageAction) {
    const el = document.createElement('span');
    let c = 'peer-typing';
    el.classList.add(c);
    el.dataset.action = action._;
    switch(action._) {
      case 'sendMessageTypingAction': {
      // default: {
        c += '-text';
        for(let i = 0; i < 3; ++i) {
          const cc = c + '-dot';
          const dot = document.createElement('span');
          dot.className = cc + (i === 0 ? ' ' + cc + '-first' : (i === 2 ? ' ' + cc + '-last' : ''));
          el.append(dot);
        }
        break;
      }

      case 'sendMessageUploadAudioAction':
      case 'sendMessageUploadDocumentAction':
      case 'sendMessageUploadRoundAction':
      case 'sendMessageUploadVideoAction':
      case 'sendMessageUploadPhotoAction': {
        c += '-upload';
        /* const trail = document.createElement('span');
        trail.className = c + '-trail';
        el.append(trail); */
        break;
      }

      case 'sendMessageRecordAudioAction':
      case 'sendMessageRecordRoundAction':
      case 'sendMessageRecordVideoAction': {
        c += '-record';
        break;
      }

      case 'sendMessageEmojiInteractionSeen':
      case 'sendMessageChooseStickerAction': {
        c += '-choosing-sticker';
        for(let i = 0; i < 2; ++i) {
          const eye = document.createElement('div');
          eye.className = c + '-eye';
          el.append(eye);
        }
        break;
      }
    }

    el.classList.add(c);

    return el;
  }

  public async getPeerTyping(peerId: PeerId, container?: HTMLElement, threadId?: number) {
    // const log = this.log.bindPrefix('getPeerTyping-' + peerId);
    // log('getting peer typing');

    const isUser = peerId.isUser();
    if(isUser && await this.managers.appUsersManager.isBot(peerId)) {
      // log('a bot');
      return;
    }

    const typings = await this.managers.appProfileManager.getPeerTypings(peerId, threadId);
    if(!typings?.length) {
      // log('have no typing');
      return;
    }

    const typing = typings[0];

    const langPackKeys: {
      [peerType in 'private' | 'chat' | 'multi']?: Partial<{[action in SendMessageAction['_']]: LangPackKey}>
    } = {
      private: {
        'sendMessageTypingAction': 'Peer.Activity.User.TypingText',
        'sendMessageUploadAudioAction': 'Peer.Activity.User.SendingFile',
        'sendMessageUploadDocumentAction': 'Peer.Activity.User.SendingFile',
        'sendMessageUploadPhotoAction': 'Peer.Activity.User.SendingPhoto',
        'sendMessageUploadVideoAction': 'Peer.Activity.User.SendingVideo',
        'sendMessageUploadRoundAction': 'Peer.Activity.User.SendingVideo',
        'sendMessageRecordVideoAction': 'Peer.Activity.User.RecordingVideo',
        'sendMessageRecordAudioAction': 'Peer.Activity.User.RecordingAudio',
        'sendMessageRecordRoundAction': 'Peer.Activity.User.RecordingVideo',
        'sendMessageGamePlayAction': 'Peer.Activity.User.PlayingGame',
        'sendMessageChooseStickerAction': 'Peer.Activity.User.ChoosingSticker',
        'sendMessageEmojiInteractionSeen': 'Peer.Activity.User.EnjoyingAnimations'
      },
      chat: {
        'sendMessageTypingAction': 'Peer.Activity.Chat.TypingText',
        'sendMessageUploadAudioAction': 'Peer.Activity.Chat.SendingFile',
        'sendMessageUploadDocumentAction': 'Peer.Activity.Chat.SendingFile',
        'sendMessageUploadPhotoAction': 'Peer.Activity.Chat.SendingPhoto',
        'sendMessageUploadVideoAction': 'Peer.Activity.Chat.SendingVideo',
        'sendMessageUploadRoundAction': 'Peer.Activity.Chat.SendingVideo',
        'sendMessageRecordVideoAction': 'Peer.Activity.Chat.RecordingVideo',
        'sendMessageRecordAudioAction': 'Peer.Activity.Chat.RecordingAudio',
        'sendMessageRecordRoundAction': 'Peer.Activity.Chat.RecordingVideo',
        'sendMessageGamePlayAction': 'Peer.Activity.Chat.PlayingGame',
        'sendMessageChooseStickerAction': 'Peer.Activity.Chat.ChoosingSticker',
        'sendMessageEmojiInteractionSeen': 'Peer.Activity.Chat.EnjoyingAnimations'
      },
      multi: {
        'sendMessageTypingAction': 'Peer.Activity.Chat.Multi.TypingText1',
        'sendMessageUploadAudioAction': 'Peer.Activity.Chat.Multi.SendingFile1',
        'sendMessageUploadDocumentAction': 'Peer.Activity.Chat.Multi.SendingFile1',
        'sendMessageUploadPhotoAction': 'Peer.Activity.Chat.Multi.SendingPhoto1',
        'sendMessageUploadVideoAction': 'Peer.Activity.Chat.Multi.SendingVideo1',
        'sendMessageUploadRoundAction': 'Peer.Activity.Chat.Multi.SendingVideo1',
        'sendMessageRecordVideoAction': 'Peer.Activity.Chat.Multi.RecordingVideo1',
        'sendMessageRecordAudioAction': 'Peer.Activity.Chat.Multi.RecordingAudio1',
        'sendMessageRecordRoundAction': 'Peer.Activity.Chat.Multi.RecordingVideo1',
        'sendMessageGamePlayAction': 'Peer.Activity.Chat.Multi.PlayingGame1',
        'sendMessageChooseStickerAction': 'Peer.Activity.Chat.Multi.ChoosingSticker1'
      }
    };

    const mapa = isUser ? langPackKeys.private : (typings.length > 1 ? langPackKeys.multi : langPackKeys.chat);
    let action = typing.action;

    if(typings.length > 1) {
      const s: any = {};
      typings.forEach((typing) => {
        const type = typing.action._;
        if(s[type] === undefined) s[type] = 0;
        ++s[type];
      });

      if(Object.keys(s).length > 1) {
        action = {
          _: 'sendMessageTypingAction'
        };
      }
    }

    const langPackKey = mapa[action._];
    if(!langPackKey) {
      // log('no langPackKey');
      return;
    }

    let peerTitlePromise: Promise<any>;
    let args: any[];
    if(peerId.isAnyChat()) {
      const peerTitle = new PeerTitle();
      peerTitlePromise = peerTitle.update({peerId: typing.userId.toPeerId(false), onlyFirstName: true});
      args = [
        peerTitle.element,
        typings.length - 1
      ];

      await peerTitlePromise;
    }

    if(!container) {
      container = document.createElement('span');
      container.classList.add('online', 'peer-typing-container');
    }

    container.classList.toggle('peer-typing-flex', action._ === 'sendMessageChooseStickerAction' || action._ === 'sendMessageEmojiInteractionSeen');

    let typingElement = container.firstElementChild as HTMLElement;
    if(!typingElement) {
      typingElement = this.getTypingElement(action);
      container.prepend(typingElement);
    } else {
      if(typingElement.dataset.action !== action._) {
        typingElement.replaceWith(this.getTypingElement(action));
      }
    }

    if(action._ === 'sendMessageEmojiInteractionSeen') {
      if(args) {
        args.pop();
      } else {
        args = [];
      }

      const span = htmlToSpan(wrapEmojiText(action.emoticon));
      args.push(span);
    }

    const descriptionElement = i18n(langPackKey, args);
    descriptionElement.classList.add('peer-typing-description');

    if(container.childElementCount > 1) container.lastElementChild.replaceWith(descriptionElement);
    else container.append(descriptionElement);

    // log('returning typing');
    return container;
  }

  private async getChatStatus(chatId: ChatId, noTyping?: boolean): Promise<AckedResult<HTMLElement>> {
    const typingEl = noTyping ? undefined : await this.getPeerTyping(chatId.toPeerId(true));
    if(typingEl) {
      return {cached: true, result: Promise.resolve(typingEl)};
    }

    const chatFullResult = await this.managers.acknowledged.appProfileManager.getChatFull(chatId);
    const dooo = async(chatFull: ChatFull) => {
      let [subtitle, onlinesResult] = await Promise.all([
        getChatMembersString(chatId, undefined, undefined, undefined, chatFull),
        this.managers.acknowledged.appProfileManager.getOnlines(chatId)
      ]);

      return {
        cached: onlinesResult.cached,
        result: onlinesResult.result.then((onlines) => {
          if(onlines > 1) {
            const span = document.createElement('span');

            span.append(...join([subtitle, i18n('OnlineCount', [numberThousandSplitter(onlines)])], false));
            subtitle = span;
          }

          return subtitle;
        })
      };
    };

    const result = chatFullResult.result.then(dooo);
    return {
      cached: chatFullResult.cached ? (await result).cached : chatFullResult.cached,
      result: result.then((r) => r.result)
    };
  }

  private async getUserStatus(userId: UserId, ignoreSelf?: boolean) {
    const result: AckedResult<HTMLElement> = {
      cached: true,
      result: Promise.resolve(undefined as HTMLElement)
    };

    const user = await this.managers.appUsersManager.getUser(userId);
    if(!user || (user.pFlags.self && !ignoreSelf)) {
      return result;
    }

    const subtitle = getUserStatusString(user);

    if(!user.pFlags.bot && !user.pFlags.support) {
      let typingEl = await this.getPeerTyping(userId.toPeerId());
      if(!typingEl && user.status?._ === 'userStatusOnline') {
        typingEl = document.createElement('span');
        typingEl.classList.add('online');
        typingEl.append(subtitle);
      }

      if(typingEl) {
        result.result = Promise.resolve(typingEl);
        return result;
      }
    }

    result.result = Promise.resolve(subtitle);
    return result;
  }

  private async getPeerStatus(peerId: PeerId, ignoreSelf?: boolean, noTyping?: boolean) {
    if(!peerId) return;
    let promise: Promise<AckedResult<HTMLElement>>;
    if(peerId.isAnyChat()) {
      promise = this.getChatStatus(peerId.toChatId(), noTyping);
    } else {
      promise = this.getUserStatus(peerId.toUserId(), ignoreSelf);
    }

    return promise;
  }

  public async setPeerStatus(options: {
    peerId: PeerId,
    element: HTMLElement,
    needClear: boolean,
    useWhitespace: boolean,
    middleware: () => boolean,
    ignoreSelf?: boolean,
    noTyping?: boolean
  }) {
    // const log = this.log.bindPrefix('status-' + peerId);
    // log('setting status', element);

    const {peerId, element, needClear, useWhitespace, middleware, ignoreSelf, noTyping} = options;

    if(!needClear) {
      // * good good good
      const typingContainer = element.querySelector('.peer-typing-container') as HTMLElement;
      if(typingContainer && await this.getPeerTyping(peerId, typingContainer)) {
        // log('already have a status');
        return;
      }
    }

    const result = await this.getPeerStatus(peerId, ignoreSelf, noTyping);
    // log('getPeerStatus result', result);
    if(!middleware()) {
      // log.warn('middleware');
      return;
    }

    const set = async() => {
      const subtitle = result && await result.result;
      if(!middleware()) {
        return;
      }

      return () => replaceContent(element, subtitle || placeholder);
    };

    const placeholder = useWhitespace ? NBSP : ''; // ! HERE U CAN FIND WHITESPACE
    if(!result || result.cached || needClear === undefined) {
      return set();
    } else if(needClear) {
      return () => {
        element.textContent = placeholder;
        return set().then((callback) => callback?.());
      };
    }
  }

  public setChoosingStickerTyping(cancel: boolean) {
    this.managers.appMessagesManager.setTyping(this.chat.peerId, {_: cancel ? 'sendMessageCancelAction' : 'sendMessageChooseStickerAction'}, undefined, this.chat.threadId);
  }

  public isSamePeer(options1: {peerId: PeerId, threadId?: number, monoforumThreadId?: PeerId, type?: ChatType}, options2: typeof options1) {
    return options1.peerId === options2.peerId &&
      options1.threadId === options2.threadId &&
      options1.monoforumThreadId === options2.monoforumThreadId &&
      (typeof(options1.type) !== typeof(options2.type) || options1.type === options2.type);
  }

  public giftPremium(peerId: PeerId) {
    this.managers.appPaymentsManager.getPremiumGiftCodeOptions().then((giftCodeOptions) => {
      PopupElement.createPopup(
        PopupGiftPremium,
        peerId,
        giftCodeOptions.filter((option) => option.users === 1 && option.currency !== STARS_CURRENCY)
      );
    });
  }

  public requestPhone(peerId: PeerId) {
    return confirmationPopup({
      titleLangKey: 'ShareYouPhoneNumberTitle',
      button: {
        langKey: 'OK'
      },
      descriptionLangKey: 'AreYouSureShareMyContactInfoBot'
    }).then(() => {
      return this.managers.appMessagesManager.sendContact({peerId, contactPeerId: rootScope.myId});
    });
  }

  public setPeerColorToElement({
    peerId,
    element,
    messageHighlighting,
    colorAsOut,
    color
  }: {
    peerId: PeerId,
    element: HTMLElement,
    messageHighlighting?: boolean,
    colorAsOut?: boolean,
    color?: PeerColor
  }) {
    const colorProperty = '--peer-color-rgb';
    const borderBackgroundProperty = '--peer-border-background';
    // if(!peerId) {
    //   element.style.removeProperty(colorProperty);
    //   element.style.removeProperty(borderBackgroundProperty);
    //   return;
    // }

    const peer = apiManagerProxy.getPeer(peerId);
    let peerColorRgbValue: string, peerBorderBackgroundValue: string;
    if(messageHighlighting || colorAsOut) {
      const colors = getPeerColorsByPeer(peer);
      const length = colors.length;
      const property = messageHighlighting ? 'message-empty' : 'message-out';
      peerColorRgbValue = `var(--${property}-primary-color-rgb)`;
      peerBorderBackgroundValue = `var(--${property}-peer-${Math.max(1, length)}-border-background)`;
    } else {
      const colorIndex = color?.color ?? getPeerColorIndexByPeer(peer);
      if(colorIndex === -1) {
        element.style.removeProperty(colorProperty);
        element.style.removeProperty(borderBackgroundProperty);
        return;
      }

      peerColorRgbValue = `var(--peer-${colorIndex}-color-rgb)`;
      peerBorderBackgroundValue = `var(--peer-${colorIndex}-border-background)`;
    }

    element.style.setProperty(colorProperty, peerColorRgbValue);
    element.style.setProperty(borderBackgroundProperty, peerBorderBackgroundValue);
  }

  public async initGifting() {
    const appConfig = await this.managers.apiManager.getAppConfig();
    const user = await this.managers.appUsersManager.resolveUsername(appConfig.premium_bot_username);
    const peerId = user.id.toPeerId(false);
    this.managers.appMessagesManager.sendText({peerId, text: '/gift'});
    this.setInnerPeer({peerId});
  }

  public onEmojiStickerClick = async({event, container, managers, peerId, middleware}: {
    event: Event,
    container: HTMLElement,
    managers: AppManagers,
    peerId: PeerId,
    middleware: Middleware
  }) => {
    cancelEvent(event);

    const bubble = findUpClassName(container, 'bubble');
    const emoji = container.dataset.stickerEmoji;

    const animation = !container.classList.contains('custom-emoji') ? lottieLoader.getAnimation(container) : undefined;
    if(animation?.paused) {
      const doc = await managers.appStickersManager.getAnimatedEmojiSoundDocument(emoji);
      if(doc) {
        const audio = document.createElement('audio');
        audio.style.display = 'none';
        container.parentElement.append(audio);

        try {
          const url = await appDownloadManager.downloadMediaURL({media: doc});

          audio.src = url;
          safePlay(audio);
          await onMediaLoad(audio, undefined, true);

          audio.addEventListener('ended', () => {
            audio.src = '';
            audio.remove();
          }, {once: true});
        } catch(err) {

        }
      }

      animation.autoplay = true;
      animation.restart();
    }

    if(!peerId.isUser() || !liteMode.isAvailable('effects_emoji')) {
      return false;
    }

    const activeAnimations: Set<{}> = (container as any).activeAnimations ??= new Set();
    if(activeAnimations.size >= 3) {
      return true;
    }

    const doc = await managers.appStickersManager.getAnimatedEmojiSticker(emoji, true);
    if(!doc) {
      return false;
    }

    const data: SendMessageEmojiInteractionData = (container as any).emojiData ??= {
      a: [],
      v: 1
    };

    const sendInteractionThrottled: () => void = (container as any).sendInteractionThrottled ??= throttle(() => {
      const length = data.a.length;
      if(!length) {
        return;
      }

      const firstTime = data.a[0].t;

      data.a.forEach((a) => {
        a.t = (a.t - firstTime) / 1000;
      });

      const {peerId, threadId} = this.chat;

      const bubble = findUpClassName(container, 'bubble');
      managers.appMessagesManager.setTyping(peerId, {
        _: 'sendMessageEmojiInteraction',
        msg_id: getServerMessageId(+bubble.dataset.mid),
        emoticon: emoji,
        interaction: {
          _: 'dataJSON',
          data: JSON.stringify(data)
        }
      }, true, threadId);

      data.a.length = 0;
    }, 1000, false);

    const o = {};
    activeAnimations.add(o);

    const isOut = bubble ? bubble.classList.contains('is-out') : undefined;
    const {animationDiv} = wrapStickerAnimation({
      doc,
      middleware,
      side: isOut ? 'right' : 'left',
      size: 360,
      target: container,
      play: true,
      withRandomOffset: true,
      onUnmount: () => {
        activeAnimations.delete(o);
      },
      scrollable: this.chat.bubbles.scrollable
    });

    if(isOut !== undefined && !isOut) {
      animationDiv.classList.add('reflect-x');
    }

    // using a trick here: simulated event from interlocutor's interaction won't fire ours
    if(event.isTrusted) {
      data.a.push({
        i: 1,
        t: Date.now()
      });

      sendInteractionThrottled();
    }

    return true;
    // });
  }
}

const appImManager = new AppImManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appImManager = appImManager);
export default appImManager;
