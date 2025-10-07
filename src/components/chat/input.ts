/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../lib/appManagers/appDocsManager';
import type {MyDraftMessage} from '../../lib/appManagers/appDraftsManager';
import type {AppMessagesManager, MessageSendingParams, MyMessage, SuggestedPostPayload} from '../../lib/appManagers/appMessagesManager';
import type Chat from './chat';
import {AppImManager, APP_TABS} from '../../lib/appManagers/appImManager';
import '../../../public/recorder.min';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import opusDecodeController from '../../lib/opusDecodeController';
import {ButtonMenuItemOptions, ButtonMenuItemOptionsVerifiable, ButtonMenuSync} from '../buttonMenu';
import emoticonsDropdown, {EmoticonsDropdown} from '../emoticonsDropdown';
import PopupCreatePoll from '../popups/createPoll';
import PopupForward from '../popups/forward';
import PopupNewMedia, {getCurrentNewMediaPopup} from '../popups/newMedia';
import {toast, toastNew} from '../toast';
import {MessageEntity, DraftMessage, WebPage, Message, UserFull, AttachMenuPeerType, BotMenuButton, MessageMedia, InputReplyTo, Chat as MTChat, User, ChatFull, Dialog} from '../../layer';
import StickersHelper from './stickersHelper';
import ButtonIcon from '../buttonIcon';
import ButtonMenuToggle from '../buttonMenuToggle';
import ListenerSetter, {Listener} from '../../helpers/listenerSetter';
import Button, {replaceButtonIcon} from '../button';
import PopupSchedule from '../popups/schedule';
import SendMenu from './sendContextMenu';
import rootScope from '../../lib/rootScope';
import PopupPinMessage from '../popups/unpinMessage';
import tsNow from '../../helpers/tsNow';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import {IS_MOBILE, IS_MOBILE_SAFARI} from '../../environment/userAgent';
import I18n, {FormatterArguments, i18n, join, LangPackKey} from '../../lib/langPack';
import {generateTail} from './bubbles';
import findUpClassName from '../../helpers/dom/findUpClassName';
import ButtonCorner from '../buttonCorner';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import cancelEvent from '../../helpers/dom/cancelEvent';
import cancelSelection from '../../helpers/dom/cancelSelection';
import {attachClickEvent, simulateClickEvent} from '../../helpers/dom/clickEvent';
import isInputEmpty from '../../helpers/dom/isInputEmpty';
import isSendShortcutPressed from '../../helpers/dom/isSendShortcutPressed';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import getRichValueWithCaret from '../../helpers/dom/getRichValueWithCaret';
import EmojiHelper from './emojiHelper';
import CommandsHelper from './commandsHelper';
import AutocompleteHelperController from './autocompleteHelperController';
import AutocompleteHelper from './autocompleteHelper';
import MentionsHelper from './mentionsHelper';
import fixSafariStickyInput from '../../helpers/dom/fixSafariStickyInput';
import ReplyKeyboard from './replyKeyboard';
import InlineHelper from './inlineHelper';
import debounce from '../../helpers/schedulers/debounce';
import {putPreloader} from '../putPreloader';
import SetTransition from '../singleTransition';
import PeerTitle from '../peerTitle';
import {fastRaf} from '../../helpers/schedulers';
import PopupDeleteMessages from '../popups/deleteMessages';
import fixSafariStickyInputFocusing, {IS_STICKY_INPUT_BUGGED} from '../../helpers/dom/fixSafariStickyInputFocusing';
import PopupPeer from '../popups/peer';
import appMediaPlaybackController from '../appMediaPlaybackController';
import {BOT_START_PARAM, GENERAL_TOPIC_ID, NULL_PEER_ID, SEND_PAID_WITH_STARS_DELAY, SEND_WHEN_ONLINE_TIMESTAMP} from '../../lib/mtproto/mtproto_config';
import setCaretAt from '../../helpers/dom/setCaretAt';
import DropdownHover from '../../helpers/dropdownHover';
import findUpTag from '../../helpers/dom/findUpTag';
import toggleDisability from '../../helpers/dom/toggleDisability';
import callbackify from '../../helpers/callbackify';
import ChatBotCommands from './botCommands';
import copy from '../../helpers/object/copy';
import toHHMMSS from '../../helpers/string/toHHMMSS';
import documentFragmentToHTML from '../../helpers/dom/documentFragmentToHTML';
import PopupElement from '../popups';
import getEmojiEntityFromEmoji from '../../lib/richTextProcessor/getEmojiEntityFromEmoji';
import mergeEntities from '../../lib/richTextProcessor/mergeEntities';
import parseEntities from '../../lib/richTextProcessor/parseEntities';
import parseMarkdown from '../../lib/richTextProcessor/parseMarkdown';
import wrapDraftText from '../../lib/richTextProcessor/wrapDraftText';
import wrapDraft from '../wrappers/draft';
import wrapMessageForReply from '../wrappers/messageForReply';
import getServerMessageId from '../../lib/appManagers/utils/messageId/getServerMessageId';
import {AppManagers} from '../../lib/appManagers/managers';
import contextMenuController from '../../helpers/contextMenuController';
import {emojiFromCodePoints} from '../../vendor/emoji';
import {modifyAckedPromise} from '../../helpers/modifyAckedResult';
import ChatSendAs from './sendAs';
import filterAsync from '../../helpers/array/filterAsync';
import InputFieldAnimated from '../inputFieldAnimated';
import getStickerEffectThumb from '../../lib/appManagers/utils/stickers/getStickerEffectThumb';
import PopupStickers from '../popups/stickers';
import wrapPeerTitle from '../wrappers/peerTitle';
import wrapReply from '../wrappers/reply';
import {getEmojiFromElement} from '../emoticonsDropdown/tabs/emoji';
import RichInputHandler from '../../helpers/dom/richInputHandler';
import {insertRichTextAsHTML} from '../inputField';
import draftsAreEqual from '../../lib/appManagers/utils/drafts/draftsAreEqual';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import getAttachMenuBotIcon from '../../lib/appManagers/utils/attachMenuBots/getAttachMenuBotIcon';
import forEachReverse from '../../helpers/array/forEachReverse';
import {MARKDOWN_ENTITIES} from '../../lib/richTextProcessor';
import IMAGE_MIME_TYPES_SUPPORTED from '../../environment/imageMimeTypesSupport';
import VIDEO_MIME_TYPES_SUPPORTED from '../../environment/videoMimeTypesSupport';
import {ChatRights} from '../../lib/appManagers/appChatsManager';
import getPeerActiveUsernames from '../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import replaceContent from '../../helpers/dom/replaceContent';
import getTextWidth from '../../helpers/canvas/getTextWidth';
import {FontFull} from '../../config/font';
import {ChatType} from './chat';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import idleController from '../../helpers/idleController';
import Icon from '../icon';
import setBadgeContent from '../../helpers/setBadgeContent';
import createBadge from '../../helpers/createBadge';
import deepEqual from '../../helpers/object/deepEqual';
import {clearMarkdownExecutions, createMarkdownCache, handleMarkdownShortcut, maybeClearUndoHistory, processCurrentFormatting} from '../../helpers/dom/markdown';
import MarkupTooltip from './markupTooltip';
import PopupPremium from '../popups/premium';
import PopupPickUser from '../popups/pickUser';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {isSavedDialog} from '../../lib/appManagers/utils/dialogs/isDialog';
import getFwdFromName from '../../lib/appManagers/utils/messages/getFwdFromName';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import eachSecond from '../../helpers/eachSecond';
import {wrapSlowModeLeftDuration} from '../wrappers/wrapDuration';
import showTooltip from '../tooltip';
import createContextMenu from '../../helpers/dom/createContextMenu';
import {Accessor, createEffect, createMemo, createRoot, createSignal, onCleanup, Setter} from 'solid-js';
import {createStore} from 'solid-js/store';
import SelectedEffect from './selectedEffect';
import windowSize from '../../helpers/windowSize';
import {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import accumulate from '../../helpers/array/accumulate';
import splitStringByLength from '../../helpers/string/splitStringByLength';
import PaidMessagesInterceptor, {PAYMENT_REJECTED} from './paidMessagesInterceptor';
import asyncThrottle from '../../helpers/schedulers/asyncThrottle';
import focusInput from '../../helpers/dom/focusInput';
import {PopupChecklist} from '../popups/checklist';
import assumeType from '../../helpers/assumeType';
import {formatFullSentTime} from '../../helpers/date';
import useStars from '../../stores/stars';
import PopupStars from '../popups/stars';
import SolidJSHotReloadGuardProvider from '../../lib/solidjs/hotReloadGuardProvider';
import {makeMessageMediaInputForSuggestedPost} from '../../lib/appManagers/utils/messages/makeMessageMediaInput';
import {useAppConfig, useAppState} from '../../stores/appState';
import showFrozenPopup from '../popups/frozen';

// console.log('Recorder', Recorder);

const RECORD_MIN_TIME = 500;
const REPLY_IN_TOPIC = false;

export const POSTING_NOT_ALLOWED_MAP: {[action in ChatRights]?: LangPackKey} = {
  send_voices: 'GlobalAttachVoiceRestricted',
  send_stickers: 'GlobalAttachStickersRestricted',
  send_gifs: 'GlobalAttachGifRestricted',
  send_media: 'GlobalAttachMediaRestricted',
  send_plain: 'GlobalSendMessageRestricted',
  send_polls: 'ErrorSendRestrictedPollsAll',
  send_inline: 'GlobalAttachInlineRestricted'
};

type ChatInputHelperType = 'edit' | 'webpage' | 'forward' | 'reply' | 'suggested';
type ChatSendBtnIcon = 'send' | 'record' | 'edit' | 'schedule' | 'forward';
export type ChatInputReplyTo = Pick<MessageSendingParams, 'replyToMsgId' | 'replyToQuote' | 'replyToStoryId' | 'replyToPeerId' | 'replyToMonoforumPeerId'>;


const CLASS_NAME = 'chat-input';
const PEER_EXCEPTIONS = new Set<ChatType>([ChatType.Scheduled, ChatType.Stories, ChatType.Saved]);

export default class ChatInput {
  // private static AUTO_COMPLETE_REG_EXP = /(\s|^)((?::|.)(?!.*[:@]).*|(?:[@\/]\S*))$/;
  private static AUTO_COMPLETE_REG_EXP = /(\s|^)((?:(?:@|^\/)\S*)|(?::|^[^:@\/])(?!.*[:@\/]).*)$/;
  public messageInput: HTMLElement;
  public messageInputField: InputFieldAnimated;
  private fileInput: HTMLInputElement;
  private inputMessageContainer: HTMLDivElement;
  private btnSend: HTMLButtonElement;
  public btnCancelRecord: HTMLButtonElement;
  public btnReaction: HTMLButtonElement;
  public lastUrl = '';
  private lastTimeType = 0;
  public noRipple: boolean;

  public chatInput: HTMLElement;
  public inputContainer: HTMLElement;
  public rowsWrapper: HTMLDivElement;
  private newMessageWrapper: HTMLDivElement;
  private btnToggleEmoticons: HTMLButtonElement;
  private btnToggleReplyMarkup: HTMLButtonElement;
  public btnSendContainer: HTMLDivElement;

  private replyKeyboard: ReplyKeyboard;

  public attachMenu: HTMLElement;
  private attachMenuButtons: ButtonMenuItemOptionsVerifiable[];

  public btnSuggestPost: HTMLElement;

  private sendMenu: SendMenu;

  private replyElements: {
    container: HTMLElement,
    cancelBtn: HTMLButtonElement,
    iconBtn: HTMLButtonElement,
    menuContainer: HTMLElement,
    replyInAnother: ButtonMenuItemOptions,
    doNotReply: ButtonMenuItemOptions,
    doNotQuote: ButtonMenuItemOptions
  } = {} as any;

  private forwardElements: {
    changePeer: ButtonMenuItemOptions,
    showSender: ButtonMenuItemOptions,
    hideSender: ButtonMenuItemOptions,
    showCaption: ButtonMenuItemOptions,
    hideCaption: ButtonMenuItemOptions,
    container: HTMLElement,
    modifyArgs?: ButtonMenuItemOptions[]
  };
  private webPageElements: {
    above: ButtonMenuItemOptions,
    below: ButtonMenuItemOptions,
    larger: ButtonMenuItemOptions,
    smaller: ButtonMenuItemOptions,
    container: HTMLElement
  };
  private forwardHover: DropdownHover;
  private webPageHover: DropdownHover;
  private replyHover: DropdownHover;
  private currentHover: DropdownHover;
  private forwardWasDroppingAuthor: boolean;

  private getWebPagePromise: Promise<void>;
  public willSendWebPage: WebPage = null;
  public webPageOptions: Parameters<AppMessagesManager['sendText']>[0]['webPageOptions'] = {};
  private forwarding: {[fromPeerId: PeerId]: number[]};
  public replyToMsgId: MessageSendingParams['replyToMsgId'];
  public replyToStoryId: MessageSendingParams['replyToStoryId'];
  public replyToQuote: MessageSendingParams['replyToQuote'];
  public replyToPeerId: MessageSendingParams['replyToPeerId'];
  public replyToMonoforumPeerId: MessageSendingParams['replyToMonoforumPeerId'];
  public editMsgId: number;
  public editMessage: Message.message;
  private noWebPage: true;
  public scheduleDate: number;
  public sendSilent: true;
  public startParam: string;
  public invertMedia: boolean;
  public effect: Accessor<DocId>;

  public setEffect: Setter<DocId>;

  private recorder: any;
  public recording = false;
  private recordCanceled = false;
  private recordTimeEl: HTMLElement;
  private recordRippleEl: HTMLElement;
  private recordStartTime = 0;
  private recordingOverlayListener: Listener;
  private recordingNavigationItem: NavigationItem;

  // private scrollTop = 0;
  // private scrollOffsetTop = 0;
  // private scrollDiff = 0;

  public helperType: Exclude<ChatInputHelperType, 'webpage'>;
  private helperFunc: () => void | Promise<void>;
  private helperWaitingForward: boolean;
  private helperWaitingReply: boolean;

  public willAttachType: 'document' | 'media';

  private autocompleteHelperController: AutocompleteHelperController;
  private stickersHelper: StickersHelper;
  private emojiHelper: EmojiHelper;
  private commandsHelper: CommandsHelper;
  private mentionsHelper: MentionsHelper;
  private inlineHelper: InlineHelper;
  private listenerSetter: ListenerSetter;
  private hoverListenerSetter: ListenerSetter;

  private pinnedControlBtn: HTMLButtonElement;
  private openChatBtn: HTMLButtonElement;

  private goDownBtn: HTMLButtonElement;
  private goDownUnreadBadge: HTMLElement;
  private goMentionBtn: HTMLButtonElement;
  private goMentionUnreadBadge: HTMLSpanElement;
  private goReactionBtn: HTMLButtonElement;
  private goReactionUnreadBadge: HTMLElement;
  private btnScheduled: HTMLButtonElement;

  private btnPreloader: HTMLButtonElement;

  private saveDraftDebounced: () => void;

  private fakeRowsWrapper: HTMLDivElement;

  private previousQuery: string;

  private releaseMediaPlayback: () => void;

  private botStartBtn: HTMLButtonElement;
  private unblockBtn: HTMLButtonElement;
  private onlyPremiumBtn: HTMLButtonElement;
  private onlyPremiumBtnText: I18n.IntlElement;
  private frozenBtn: HTMLButtonElement;
  private joinBtn: HTMLButtonElement;
  private rowsWrapperWrapper: HTMLDivElement;
  private controlContainer: HTMLElement;
  private fakeSelectionWrapper: HTMLDivElement;
  private starsBadge: HTMLElement;
  private starsBadgeStars: HTMLElement;

  private fakeWrapperTo: HTMLElement;
  private toggleControlButtonDisability: () => void;

  private botCommandsToggle: HTMLElement;
  private botCommands: ChatBotCommands;
  private botCommandsIcon: HTMLElement;
  private botCommandsView: HTMLElement;
  private botMenuButton: BotMenuButton.botMenuButton;
  private hasBotCommands: boolean;

  // private activeContainer: HTMLElement;

  private sendAs: ChatSendAs;
  public sendAsPeerId: PeerId;

  private replyInTopicOverlay: HTMLDivElement;
  private restoreInputLock: () => void;

  private isFocused: boolean;
  private freezedFocused: boolean;
  public onFocusChange: (isFocused: boolean) => void;
  public onMenuToggle: (isOpen: boolean) => void;
  public onRecording: (isRecording: boolean) => void;
  public onUpdateSendBtn: (icon: ChatSendBtnIcon) => void;
  public onMessageSent2: () => void;
  public forwardStoryCallback: (e: MouseEvent) => void;

  public emoticonsDropdown: EmoticonsDropdown;

  public excludeParts: Partial<{
    scheduled: boolean,
    replyMarkup: boolean,
    downButton: boolean,
    reply: boolean,
    forwardOptions: boolean,
    mentionButton: boolean,
    botCommands: boolean,
    attachMenu: boolean,
    commandsHelper: boolean,
    emoticons: boolean
  }>;
  public globalMentions: boolean;

  public onFileSelection: (promise: Promise<File[]>) => void;

  private hasOffset: {type: 'commands' | 'as', forwards: boolean};
  private canForwardStory: boolean;
  private processingDraftMessage: DraftMessage.draftMessage;

  private fileSelectionPromise: CancellablePromise<File[]>;

  public paidMessageInterceptor: PaidMessagesInterceptor;

  private starsState: ReturnType<ChatInput['createStarsState']>;
  private directMessagesHandler: ReturnType<ChatInput['createDirectMessagesHandler']>;

  public suggestedPost: SuggestedPostPayload;

  constructor(
    public chat: Chat,
    private appImManager: AppImManager,
    private managers: AppManagers,
    private className: string
  ) {
    this.listenerSetter = new ListenerSetter();
    this.hoverListenerSetter = new ListenerSetter();
    this.excludeParts = {};
    this.isFocused = false;
    this.emoticonsDropdown = emoticonsDropdown;
  }

  public construct() {
    const className2 = this.className;

    this.chatInput = document.createElement('div');
    this.chatInput.classList.add(CLASS_NAME, className2, 'hide');

    this.inputContainer = document.createElement('div');
    this.inputContainer.classList.add(`${CLASS_NAME}-container`, `${className2}-container`);

    this.rowsWrapperWrapper = document.createElement('div');
    this.rowsWrapperWrapper.classList.add('rows-wrapper-wrapper');

    this.rowsWrapper = document.createElement('div');
    this.rowsWrapper.classList.add(...[
      'rows-wrapper',
      `${CLASS_NAME}-wrapper`,
      `${className2}-wrapper`,
      this.chat.type !== ChatType.Stories && 'chat-rows-wrapper'
    ].filter(Boolean));

    this.rowsWrapperWrapper.append(this.rowsWrapper);

    const tail = generateTail(!this.chat.isMainChat);
    this.rowsWrapper.append(tail);

    const fakeRowsWrapper = this.fakeRowsWrapper = document.createElement('div');
    fakeRowsWrapper.classList.add('fake-wrapper', 'fake-rows-wrapper');

    const fakeSelectionWrapper = this.fakeSelectionWrapper = document.createElement('div');
    fakeSelectionWrapper.classList.add('fake-wrapper', 'fake-selection-wrapper');

    this.inputContainer.append(this.rowsWrapperWrapper, fakeRowsWrapper, fakeSelectionWrapper);
    this.chatInput.append(this.inputContainer);

    if(!this.excludeParts.downButton) {
      this.constructGoDownButton();
    }

    // * constructor end

    /* let setScrollTopTimeout: number;
    // @ts-ignore
    let height = window.visualViewport.height; */
    // @ts-ignore
    // this.listenerSetter.add(window.visualViewport)('resize', () => {
    //   const scrollable = this.chat.bubbles.scrollable;
    //   const wasScrolledDown = scrollable.isScrolledDown;

    //   /* if(wasScrolledDown) {
    //     this.saveScroll();
    //   } */

    //   // @ts-ignore
    //   let newHeight = window.visualViewport.height;
    //   const diff = height - newHeight;
    //   const scrollTop = scrollable.scrollTop;
    //   const needScrollTop = wasScrolledDown ? scrollable.scrollHeight : scrollTop + diff; // * wasScrolledDown это проверка для десктоп хрома, когда пропадает панель загрузок снизу

    //   console.log('resize before', scrollable.scrollTop, scrollable.container.clientHeight, scrollable.scrollHeight, wasScrolledDown, scrollable.lastScrollTop, diff, needScrollTop);

    //   scrollable.scrollTop = needScrollTop;

    //   if(setScrollTopTimeout) clearTimeout(setScrollTopTimeout);
    //   setScrollTopTimeout = window.setTimeout(() => {
    //     const diff = height - newHeight;
    //     const isScrolledDown = scrollable.scrollHeight - Math.round(scrollable.scrollTop + scrollable.container.offsetHeight + diff) <= 1;
    //     height = newHeight;

    //     scrollable.scrollTop = needScrollTop;

    //     console.log('resize after', scrollable.scrollTop, scrollable.container.clientHeight, scrollable.scrollHeight, scrollable.isScrolledDown, scrollable.lastScrollTop, isScrolledDown);

    //     /* if(isScrolledDown) {
    //       scrollable.scrollTop = scrollable.scrollHeight;
    //     } */

    //     //scrollable.scrollTop += diff;
    //     setScrollTopTimeout = 0;
    //   }, 0);
    // });

    // ! Can't use it with resizeObserver
    /* this.listenerSetter.add(window.visualViewport)('resize', () => {
      const scrollable = this.chat.bubbles.scrollable;
      const wasScrolledDown = scrollable.isScrolledDown;

      // @ts-ignore
      let newHeight = window.visualViewport.height;
      const diff = height - newHeight;
      const needScrollTop = wasScrolledDown ? scrollable.scrollHeight : scrollable.scrollTop + diff; // * wasScrolledDown это проверка для десктоп хрома, когда пропадает панель загрузок снизу

      //console.log('resize before', scrollable.scrollTop, scrollable.container.clientHeight, scrollable.scrollHeight, wasScrolledDown, scrollable.lastScrollTop, diff, needScrollTop);

      scrollable.scrollTop = needScrollTop;
      height = newHeight;

      if(setScrollTopTimeout) clearTimeout(setScrollTopTimeout);
      setScrollTopTimeout = window.setTimeout(() => { // * try again for scrolled down Android Chrome
        scrollable.scrollTop = needScrollTop;

        //console.log('resize after', scrollable.scrollTop, scrollable.container.clientHeight, scrollable.scrollHeight, scrollable.isScrolledDown, scrollable.lastScrollTop, isScrolledDown);
        setScrollTopTimeout = 0;
      }, 0);
    }); */

    const c = this.controlContainer = document.createElement('div');
    c.classList.add('chat-input-control', 'chat-input-wrapper');
    this.inputContainer.append(c);

    this.paidMessageInterceptor = new PaidMessagesInterceptor(this.chat, this.managers);
    this.getMiddleware().onDestroy(() => {
      this.paidMessageInterceptor.dispose();
    });

    this.starsState = this.createStarsState();
    this.directMessagesHandler = this.createDirectMessagesHandler();
  }

  public freezeFocused(focused: boolean) {
    if(this.freezedFocused === focused) {
      return;
    }

    this.freezedFocused = focused;
    this.updateSendBtn();
  }

  public createButtonIcon(...args: Parameters<typeof ButtonIcon>) {
    if(this.noRipple) {
      args[1] ??= {};
      args[1].noRipple = true;
    }

    const button = ButtonIcon(...args);
    button.tabIndex = -1;
    return button;
  }

  private constructGoDownButton() {
    this.goDownBtn = ButtonCorner({icon: 'arrow_down', className: 'bubbles-corner-button chat-secondary-button bubbles-go-down hide'});
    this.inputContainer.append(this.goDownBtn);

    attachClickEvent(this.goDownBtn, (e) => {
      cancelEvent(e);
      this.chat.bubbles.onGoDownClick();
    }, {listenerSetter: this.listenerSetter});
  }

  private constructReplyElements() {
    this.replyElements.container = document.createElement('div');
    this.replyElements.container.classList.add('reply-wrapper', 'rows-wrapper-row');

    this.replyElements.iconBtn = this.createButtonIcon('');
    this.replyElements.cancelBtn = this.createButtonIcon('close reply-cancel', {noRipple: true});

    this.replyElements.container.append(this.replyElements.iconBtn, this.replyElements.cancelBtn);

    attachClickEvent(this.replyElements.cancelBtn, this.onHelperCancel, {listenerSetter: this.listenerSetter});
    attachClickEvent(this.replyElements.container, this.onHelperClick, {listenerSetter: this.listenerSetter});

    const buttons: ButtonMenuItemOptions[] = [{
      icon: 'message_jump',
      text: 'ShowMessage',
      onClick: () => {
        this.onHelperClick();
        this.replyHover.toggle(false);
      }
    }, this.replyElements.replyInAnother = {
      icon: 'replace',
      text: 'ReplyToAnotherChat',
      onClick: () => this.changeReplyRecipient()
    }, this.replyElements.doNotReply = {
      icon: 'delete',
      text: 'DoNotReply',
      onClick: this.onHelperCancel,
      danger: true/* ,
      separator: true */
    }, this.replyElements.doNotQuote = {
      icon: 'delete',
      text: 'DoNotQuote',
      onClick: this.onHelperCancel,
      danger: true
    }];
    const btnMenu = this.replyElements.menuContainer = ButtonMenuSync({
      buttons,
      listenerSetter: this.listenerSetter
    });

    if(!IS_TOUCH_SUPPORTED) {
      this.replyHover = new DropdownHover({element: btnMenu});
    }

    this.replyElements.container.append(btnMenu);
  }

  private constructForwardElements() {
    const onHideAuthorClick = () => {
      isChangingAuthor = true;
    };

    const onHideCaptionClick = () => {
      isChangingAuthor = false;
    };

    const forwardElements: ChatInput['forwardElements'] = this.forwardElements = {} as any;
    let isChangingAuthor = false;
    const forwardButtons: ButtonMenuItemOptions[] = [
      forwardElements.showSender = {
        text: 'Chat.Alert.Forward.Action.Show1',
        onClick: onHideAuthorClick,
        checkForClose: () => this.canToggleHideAuthor(),
        radioGroup: 'author'
      },
      forwardElements.hideSender = {
        text: 'Chat.Alert.Forward.Action.Hide1',
        onClick: onHideAuthorClick,
        checkForClose: () => this.canToggleHideAuthor(),
        radioGroup: 'author'
      },
      forwardElements.showCaption = {
        text: 'Chat.Alert.Forward.Action.ShowCaption',
        onClick: onHideCaptionClick,
        radioGroup: 'caption'
      },
      forwardElements.hideCaption = {
        text: 'Chat.Alert.Forward.Action.HideCaption',
        onClick: onHideCaptionClick,
        radioGroup: 'caption'
      },
      forwardElements.changePeer = {
        text: 'Chat.Alert.Forward.Action.Another',
        onClick: () => {
          this.changeForwardRecipient();
        },
        icon: 'replace'
      },
      {
        icon: 'delete',
        text: 'DoNotForward',
        onClick: this.onHelperCancel,
        danger: true
      }
    ];
    const forwardBtnMenu = forwardElements.container = ButtonMenuSync({
      buttons: forwardButtons,
      radioGroups: [{
        name: 'author',
        onChange: (value) => {
          const checked = !!+value;
          if(isChangingAuthor) {
            this.forwardWasDroppingAuthor = !checked;
          }

          const replyTitle = this.replyElements.container.querySelector('.reply-title');
          if(replyTitle) {
            const el = replyTitle.firstElementChild as HTMLElement;
            const i = I18n.weakMap.get(el) as I18n.IntlElement;
            const langPackKey: LangPackKey = forwardElements.showSender.checkboxField.checked ? 'Chat.Accessory.Forward' : 'Chat.Accessory.Hidden';
            i.key = langPackKey;
            i.update();
          }
        },
        checked: 0
      }, {
        name: 'caption',
        onChange: (value) => {
          const checked = !!+value;
          let b: ButtonMenuItemOptions;
          if(checked && this.forwardWasDroppingAuthor !== undefined) {
            b = this.forwardWasDroppingAuthor ? forwardElements.hideSender : forwardElements.showSender;
          } else {
            b = checked ? forwardElements.showSender : forwardElements.hideSender;
          }

          b.checkboxField.checked = true;
        },
        checked: 0
      }],
      listenerSetter: this.listenerSetter
    });

    if(!IS_TOUCH_SUPPORTED) {
      this.forwardHover = new DropdownHover({element: forwardBtnMenu});
    }

    forwardElements.modifyArgs = forwardButtons.slice(0, -2);
    this.replyElements.container.append(forwardBtnMenu);
  }

  private constructWebPageElements() {
    this.webPageElements = {} as any;
    const buttons: ButtonMenuItemOptions[] = [this.webPageElements.above = {
      text: 'AboveMessage',
      onClick: () => {},
      radioGroup: 'position'
    }, this.webPageElements.below = {
      text: 'BelowMessage',
      onClick: () => {},
      radioGroup: 'position'
    }, this.webPageElements.larger = {
      text: 'LargerMedia',
      onClick: () => {},
      radioGroup: 'size'
    }, this.webPageElements.smaller = {
      text: 'SmallerMedia',
      onClick: () => {},
      radioGroup: 'size'
    }, {
      text: 'WebPage.RemovePreview',
      onClick: () => {
        this.onHelperCancel();
      },
      icon: 'delete',
      danger: true
    }];
    const btnMenu = this.webPageElements.container = ButtonMenuSync({
      buttons,
      radioGroups: [{
        name: 'position',
        onChange: (value) => {
          this.invertMedia = !!+value;
          this.saveDraftDebounced?.();
        },
        checked: 0
      }, {
        name: 'size',
        onChange: (value) => {
          this.webPageOptions.largeMedia = !!+value;
          this.webPageOptions.smallMedia = !+value;
          this.saveDraftDebounced?.();
        },
        checked: 0
      }],
      listenerSetter: this.listenerSetter
    });

    if(!IS_TOUCH_SUPPORTED) {
      this.webPageHover = new DropdownHover({element: btnMenu});
    }

    this.replyElements.container.append(btnMenu);
  }

  private constructMentionButton(isReaction?: boolean) {
    const btn = ButtonCorner({icon: isReaction ? 'reactions' : 'mention', className: 'bubbles-corner-button chat-secondary-button bubbles-go-mention bubbles-go-reaction'});
    const badge = createBadge('span', 24, 'primary');
    btn.append(badge);
    this.inputContainer.append(btn);

    attachClickEvent(btn, (e) => {
      cancelEvent(e);
      const middleware = this.getMiddleware();
      this.managers.appMessagesManager.goToNextMention({peerId: this.chat.peerId, threadId: this.chat.threadId, isReaction}).then((mid) => {
        if(!middleware()) {
          return;
        }

        if(mid) {
          this.chat.setMessageId({lastMsgId: mid});
        }
      });
    }, {listenerSetter: this.listenerSetter});

    createContextMenu({
      buttons: [{
        icon: 'readchats',
        text: isReaction ? 'ReadAllReactions' : 'ReadAllMentions',
        onClick: () => {
          this.managers.appMessagesManager.readMentions(this.chat.peerId, this.chat.threadId, isReaction);
        }
      }],
      listenTo: btn,
      listenerSetter: this.listenerSetter
    });

    if(isReaction) {
      this.goReactionUnreadBadge = badge;
      this.goReactionBtn = btn;
    } else {
      this.goMentionUnreadBadge = badge;
      this.goMentionBtn = btn;
    }
  }

  private constructScheduledButton() {
    this.btnScheduled = this.createButtonIcon('scheduled btn-scheduled float hide', {noRipple: true});

    attachClickEvent(this.btnScheduled, (e) => {
      this.appImManager.openScheduled(this.chat.peerId);
    }, {listenerSetter: this.listenerSetter});

    this.listenerSetter.add(rootScope)('scheduled_new', ({peerId}) => {
      if(this.chat.peerId !== peerId) {
        return;
      }

      this.btnScheduled.classList.remove('hide');
    });

    this.listenerSetter.add(rootScope)('scheduled_delete', ({peerId}) => {
      if(this.chat.peerId !== peerId) {
        return;
      }

      this.managers.appMessagesManager.getScheduledMessages(this.chat.peerId).then((value) => {
        this.btnScheduled.classList.toggle('hide', !value.length);
      });
    });
  }

  private constructReplyMarkup() {
    this.btnToggleReplyMarkup = this.createButtonIcon('botcom toggle-reply-markup float hide', {noRipple: true});
    this.replyKeyboard = new ReplyKeyboard({
      appendTo: this.rowsWrapper,
      listenerSetter: this.listenerSetter,
      managers: this.managers,
      btnHover: this.btnToggleReplyMarkup,
      chatInput: this
    });
    this.listenerSetter.add(this.replyKeyboard)('open', () => this.btnToggleReplyMarkup.classList.add('active'));
    this.listenerSetter.add(this.replyKeyboard)('close', () => this.btnToggleReplyMarkup.classList.remove('active'));
  }

  private constructBotCommands() {
    this.botCommands = new ChatBotCommands(this.rowsWrapper, this, this.managers);
    this.botCommandsToggle = document.createElement('div');
    this.botCommandsToggle.classList.add('new-message-bot-commands');
    this.botCommandsToggle.append(Icon('webview', 'new-message-bot-commands-view-icon'));

    const scaler = document.createElement('div');
    scaler.classList.add('new-message-bot-commands-icon-scale');

    const icon = this.botCommandsIcon = document.createElement('div');
    icon.classList.add('animated-menu-icon', 'animated-menu-close-icon');
    scaler.append(icon);

    this.botCommandsView = document.createElement('div');
    this.botCommandsView.classList.add('new-message-bot-commands-view');
    this.botCommandsToggle.append(scaler, this.botCommandsView);

    let webViewTempId = 0, waitingForWebView = false;
    attachClickEvent(this.botCommandsToggle, (e) => {
      cancelEvent(e);
      const botId = this.chat.peerId.toUserId();
      const {botMenuButton} = this;
      if(botMenuButton) {
        if(waitingForWebView) {
          return;
        }

        const tempId = ++webViewTempId;
        waitingForWebView = true;

        Promise.resolve().then(() => {
          if(webViewTempId !== tempId) {
            return;
          }

          return this.chat.openWebApp({
            botId,
            url: botMenuButton.url,
            buttonText: botMenuButton.text,
            fromBotMenu: true
          });
        }).finally(() => {
          if(webViewTempId === tempId) {
            waitingForWebView = false;
          }
        });
        return;
      }

      const middleware = this.getMiddleware();
      const isShown = icon.classList.contains('state-back');
      if(isShown) {
        this.botCommands.toggle(true);
        // icon.classList.remove('state-back');
      } else {
        this.botCommands.setUserId(botId, middleware);
        // icon.classList.add('state-back');
      }
    }, {listenerSetter: this.listenerSetter});

    this.botCommands.addEventListener('visible', () => {
      icon.classList.add('state-back');
    });

    this.botCommands.addEventListener('hiding', () => {
      icon.classList.remove('state-back');
    });
  }

  private constructRecorder() {
    const Recorder = (window as any).Recorder;
    if(Recorder) try {
      this.recorder = new Recorder({
        // encoderBitRate: 32,
        // encoderPath: "../dist/encoderWorker.min.js",
        encoderSampleRate: 48000,
        monitorGain: 0,
        numberOfChannels: 1,
        recordingGain: 1,
        reuseWorker: true
      });
    } catch(err) {
      console.error('Recorder constructor error:', err);
    }

    if(!this.recorder) {
      return;
    }

    attachClickEvent(this.btnCancelRecord, this.onCancelRecordClick, {listenerSetter: this.listenerSetter});

    this.recorder.onstop = () => {
      this.setRecording(false);
      this.chatInput.classList.remove('is-locked');
      this.recordRippleEl.style.transform = '';
    };

    this.recorder.ondataavailable = async(typedArray: Uint8Array) => {
      if(this.releaseMediaPlayback) {
        this.releaseMediaPlayback();
        this.releaseMediaPlayback = undefined;
      }

      if(this.recordingOverlayListener) {
        this.listenerSetter.remove(this.recordingOverlayListener);
        this.recordingOverlayListener = undefined;
      }

      if(this.recordingNavigationItem) {
        appNavigationController.removeItem(this.recordingNavigationItem);
        this.recordingNavigationItem = undefined;
      }

      if(this.recordCanceled) {
        return;
      }

      const sendingParams = this.chat.getMessageSendingParams();

      const preparedPaymentResult = await this.paidMessageInterceptor.prepareStarsForPayment(1);
      if(preparedPaymentResult === PAYMENT_REJECTED) return;

      sendingParams.confirmedPaymentResult = preparedPaymentResult;

      const duration = (Date.now() - this.recordStartTime) / 1000 | 0;
      const dataBlob = new Blob([typedArray], {type: 'audio/ogg'});
      opusDecodeController.decode(typedArray, true).then((result) => {
        opusDecodeController.setKeepAlive(false);

        // тут objectURL ставится уже с audio/wav
        this.managers.appMessagesManager.sendFile({
          ...sendingParams,
          file: dataBlob,
          isVoiceMessage: true,
          isMedia: true,
          duration,
          waveform: result.waveform,
          objectURL: result.url,
          clearDraft: true
        });

        this.onMessageSent(false, true);
      });
    };
  }

  public constructPeerHelpers() {
    if(!this.excludeParts.reply) {
      this.constructReplyElements();

      if(!this.excludeParts.forwardOptions) {
        this.constructForwardElements();
        this.constructWebPageElements();
      }
    }

    this.newMessageWrapper = document.createElement('div');
    this.newMessageWrapper.classList.add('new-message-wrapper', 'rows-wrapper-row');

    if(REPLY_IN_TOPIC) {
      this.replyInTopicOverlay = document.createElement('div');
      this.replyInTopicOverlay.classList.add('reply-in-topic-overlay', 'hide');
      this.replyInTopicOverlay.append(i18n('Chat.Input.ReplyToAnswer'));
    }

    if(!this.excludeParts.emoticons) this.btnToggleEmoticons = this.createButtonIcon('smile toggle-emoticons', {noRipple: true});

    this.inputMessageContainer = document.createElement('div');
    this.inputMessageContainer.classList.add('input-message-container');

    if(this.goDownBtn) {
      this.goDownUnreadBadge = createBadge('span', 24, 'primary');
      this.goDownBtn.append(this.goDownUnreadBadge);
    }

    if(!this.excludeParts.mentionButton) {
      this.constructMentionButton();
      this.constructMentionButton(true);
    }

    if(!this.excludeParts.scheduled) {
      this.constructScheduledButton();
    }

    if(!this.excludeParts.replyMarkup) {
      this.constructReplyMarkup();
    }

    if(!this.excludeParts.botCommands) {
      this.constructBotCommands();
    }

    // const getSendMediaRights = () => Promise.all([this.chat.canSend('send_photos'), this.chat.canSend('send_videos')]).then(([photos, videos]) => ({photos, videos}));

    this.attachMenuButtons = [{
      icon: 'image',
      text: 'Chat.Input.Attach.PhotoOrVideo',
      onClick: () => this.onAttachClick(false, true, true)
      // verify: () => getSendMediaRights().then(({photos, videos}) => photos && videos)
    }, /* {
      icon: 'image',
      text: 'AttachPhoto',
      onClick: () => onAttachMediaClick(true, false),
      verify: () => getSendMediaRights().then(({photos, videos}) => photos && !videos)
    }, {
      icon: 'image',
      text: 'AttachVideo',
      onClick: () => onAttachMediaClick(false, true),
      verify: () => getSendMediaRights().then(({photos, videos}) => !photos && videos)
    }, */ {
      icon: 'document',
      text: 'Chat.Input.Attach.Document',
      onClick: () => this.onAttachClick(true)
      // verify: () => this.chat.canSend('send_docs')
    }, {
      icon: 'gift',
      text: 'GiftPremium',
      onClick: () => this.chat.appImManager.giftPremium(this.chat.peerId),
      verify: () => {
        return this.chat && Promise.all([
          this.chat.canGiftPremium(),
          this.managers.apiManager.getAppConfig()
        ]).then(([canGift, {premium_gift_attach_menu_icon}]) => canGift && premium_gift_attach_menu_icon);
      }
    }, {
      icon: 'poll',
      text: 'Poll',
      onClick: async() => {
        const action: ChatRights = 'send_polls';
        if(!(await this.chat.canSend(action))) {
          toastNew({langPackKey: POSTING_NOT_ALLOWED_MAP[action]});
          return;
        }

        PopupElement.createPopup(PopupCreatePoll, this.chat).show();
      },
      verify: () => (!this.chat.isMonoforum && this.chat.peerId.isAnyChat()) || this.chat.isBot
    }, {
      icon: 'poll',
      text: 'Checklist',
      onClick: async() => {
        if(this.chat.peerId.isAnyChat()) {
          const action: ChatRights = 'send_polls';
          if(!(await this.chat.canSend(action))) {
            toastNew({langPackKey: POSTING_NOT_ALLOWED_MAP[action]});
            return;
          }
        }

        if(!rootScope.premium) {
          PopupPremium.show();
          return;
        }

        PopupElement.createPopup(PopupChecklist, {chat: this.chat}).show();
      },
      verify: () => !this.chat.isMonoforum
    }];

    const attachMenuButtons = this.attachMenuButtons.slice();
    this.attachMenu = ButtonMenuToggle({
      buttonOptions: {noRipple: true},
      listenerSetter: this.listenerSetter,
      direction: 'top-left',
      buttons: this.attachMenuButtons,
      onOpenBefore: this.excludeParts.attachMenu ? undefined : async() => {
        const attachMenuBots = this.chat.isMonoforum ? [] : await this.managers.appAttachMenuBotsManager.getAttachMenuBots();
        const buttons = attachMenuButtons.slice();
        const attachMenuBotsButtons = attachMenuBots.filter((attachMenuBot) => {
          return attachMenuBot.pFlags.show_in_attach_menu;
        }).map((attachMenuBot) => {
          const icon = getAttachMenuBotIcon(attachMenuBot);
          const button: typeof buttons[0] = {
            regularText: wrapEmojiText(attachMenuBot.short_name),
            onClick: () => {
              this.chat.openWebApp({attachMenuBot, fromAttachMenu: true});
            },
            iconDoc: icon?.icon as MyDocument,
            verify: async() => {
              let found = false;

              const verifyMap: {
                [type in AttachMenuPeerType['_']]: () => boolean | Promise<boolean>
              } = {
                attachMenuPeerTypeSameBotPM: () => this.chat.peerId.toUserId() === attachMenuBot.bot_id,
                attachMenuPeerTypeBotPM: () => this.chat.isBot,
                attachMenuPeerTypePM: () => this.chat.peerId.isUser(),
                attachMenuPeerTypeChat: () => this.chat.isAnyGroup,
                attachMenuPeerTypeBroadcast: () => this.chat.isBroadcast
              };

              for(const peerType of attachMenuBot.peer_types) {
                const verify = verifyMap[peerType._];
                found = await verify();
                if(found) {
                  break;
                }
              }

              return found;
            }
          };

          return button;
        });

        buttons.splice(buttons.length, 0, ...attachMenuBotsButtons);
        this.attachMenuButtons.splice(0, this.attachMenuButtons.length, ...buttons);
      },
      onOpen: () => {
        this.emoticonsDropdown?.toggle(false);
        this.onMenuToggle?.(true);
      },
      onClose: () => {
        this.onMenuToggle?.(false);
      }
    });
    this.attachMenu.classList.add('attach-file');
    this.attachMenu.firstElementChild.replaceWith(Icon('attach'));

    this.btnSuggestPost = ButtonIcon('suggested hide');
    attachClickEvent(this.btnSuggestPost, () => {
      this.openSuggestPostPopup();
    });

    this.recordTimeEl = document.createElement('div');
    this.recordTimeEl.classList.add('record-time');

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';

    this.newMessageWrapper.append(...[
      this.botCommandsToggle,
      this.btnToggleEmoticons,
      this.inputMessageContainer,
      this.btnScheduled,
      this.btnToggleReplyMarkup,
      this.btnSuggestPost,
      this.attachMenu,
      this.recordTimeEl,
      this.fileInput
    ].filter(Boolean));

    if(this.replyElements?.container) this.rowsWrapper.append(this.replyElements.container);
    this.autocompleteHelperController = new AutocompleteHelperController();
    this.stickersHelper = new StickersHelper(this.rowsWrapper, this.autocompleteHelperController, this.chat, this.managers);
    this.emojiHelper = new EmojiHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.managers);
    if(!this.excludeParts.commandsHelper) this.commandsHelper = new CommandsHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.managers);
    this.mentionsHelper = new MentionsHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.managers);
    this.inlineHelper = new InlineHelper(this.rowsWrapper, this.autocompleteHelperController, this.chat, this.managers);
    this.rowsWrapper.append(this.newMessageWrapper);

    this.btnCancelRecord = this.createButtonIcon('binfilled btn-circle btn-record-cancel chat-input-secondary-button chat-secondary-button');

    this.btnSendContainer = document.createElement('div');
    this.btnSendContainer.classList.add('btn-send-container');

    this.recordRippleEl = document.createElement('div');
    this.recordRippleEl.classList.add('record-ripple');

    this.btnSend = this.createButtonIcon();
    this.btnSend.classList.add('btn-circle', 'btn-send', 'animated-button-icon');
    const icons: [Icon, string][] = [
      ['send', 'send'],
      ['schedule', 'schedule'],
      ['check', 'edit'],
      ['microphone_filled', 'record'],
      ['forward_filled', 'forward']
    ];
    this.btnSend.append(...icons.map(([name, type]) => Icon(name, 'animated-button-icon-icon', 'btn-send-icon-' + type)));

    this.addStarsBadge();

    this.btnSendContainer.append(this.recordRippleEl, this.btnSend);

    createRoot((dispose) => {
      this.chat.destroyMiddlewareHelper.onDestroy(dispose);
      const [effect, setEffect] = createSignal<DocId>();
      this.effect = effect;
      this.setEffect = setEffect;
      this.btnSendContainer.append(SelectedEffect({effect: this.effect}) as HTMLElement);
    });

    this.sendMenu = new SendMenu({
      onSilentClick: () => {
        this.sendSilent = true;
        this.sendMessage();
      },
      onScheduleClick: () => {
        this.scheduleSending(undefined);
      },
      onSendWhenOnlineClick: () => {
        this.setScheduleTimestamp(SEND_WHEN_ONLINE_TIMESTAMP, this.sendMessage.bind(this, true));
      },
      middleware: this.chat.destroyMiddlewareHelper.get(),
      openSide: 'top-left',
      onContextElement: this.btnSend,
      onOpen: () => {
        const good = this.chat.type !== ChatType.Scheduled && (!this.isInputEmpty() || !!Object.keys(this.forwarding).length) && !this.editMsgId;
        if(good) {
          this.emoticonsDropdown?.toggle(false);
        }

        return good;
      },
      canSendWhenOnline: this.canSendWhenOnline,
      onRef: (element) => {
        this.btnSendContainer.append(element);
      },
      withEffects: () => this.chat.peerId.isUser() && this.chat.peerId !== rootScope.myId,
      effect: this.effect,
      onEffect: this.setEffect
    });

    this.inputContainer.append(...[this.btnReaction, this.btnCancelRecord, this.btnSendContainer].filter(Boolean));

    if(this.btnToggleEmoticons) {
      this.emoticonsDropdown.attachButtonListener(this.btnToggleEmoticons, this.listenerSetter);
      this.listenerSetter.add(this.emoticonsDropdown)('open', this.onEmoticonsOpen);
      this.listenerSetter.add(this.emoticonsDropdown)('close', this.onEmoticonsClose);

      if(emoticonsDropdown === this.emoticonsDropdown) {
        createRoot((dispose) => {
          this.chat.destroyMiddlewareHelper.onDestroy(dispose);
          createEffect(() => {
            const shouldBeTop = windowSize.height >= 570 && windowSize.width > 600;
            this.emoticonsDropdown.getElement().classList.toggle('is-under', !shouldBeTop);
          });
        });
      }
    }

    this.attachMessageInputField();

    /* this.attachMenu.addEventListener('mousedown', (e) => {
      const hidden = this.attachMenu.querySelectorAll('.hide');
      if(hidden.length === this.attachMenuButtons.length) {
        toast(POSTING_MEDIA_NOT_ALLOWED);
        cancelEvent(e);
        return false;
      }
    }, {passive: false, capture: true}); */

    this.listenerSetter.add(rootScope)('settings_updated', () => {
      if(this.stickersHelper || this.emojiHelper) {
        // this.previousQuery = undefined;
        this.previousQuery = '';
        this.checkAutocomplete();
        /* if(!rootScope.settings.stickers.suggest) {
          this.stickersHelper.checkEmoticon('');
        } else {
          this.onMessageInput();
        } */
      }

      this.messageInputField?.onFakeInput();
    });

    if(this.chat) {
      this.setChatListeners();
    }

    this.constructRecorder();

    this.updateSendBtn();

    this.listenerSetter.add(this.fileInput)('change', (e) => {
      const fileList = (e.target as HTMLInputElement & EventTarget).files;
      const files = Array.from(fileList).slice();
      this.fileSelectionPromise.resolve(files);
      if(!files.length) {
        return;
      }

      const newMediaPopup = getCurrentNewMediaPopup();
      if(newMediaPopup) {
        newMediaPopup.addFiles(files);
      } else {
        PopupElement.createPopup(PopupNewMedia, this.chat, files, this.willAttachType);
      }

      this.fileInput.value = '';
    }, false);

    attachClickEvent(this.btnSend, this.onBtnSendClick, {listenerSetter: this.listenerSetter, touchMouseDown: true});

    this.saveDraftDebounced = debounce(() => this.saveDraft(), 2500, false, true);

    const makeControlButton = (langKey: LangPackKey | HTMLElement) => {
      const button = Button('btn-primary btn-transparent text-bold chat-input-control-button');
      button.append(langKey instanceof HTMLElement ? langKey : i18n(langKey));
      return button;
    };

    this.botStartBtn = makeControlButton('BotStart');
    this.unblockBtn = makeControlButton('Unblock');
    this.joinBtn = this.chat.topbar && makeControlButton('ChannelJoin');
    this.onlyPremiumBtnText = new I18n.IntlElement({key: 'Chat.Input.PremiumRequiredButton', args: [0, document.createElement('a')]});
    this.onlyPremiumBtn = makeControlButton(this.onlyPremiumBtnText.element);
    const frozenText = document.createElement('span');
    frozenText.classList.add('chat-input-frozen-text');
    const frozenText1 = i18n('Chat.Input.FrozenButton1');
    frozenText1.classList.add('danger');
    const frozenText2 = i18n('Chat.Input.FrozenButton2');
    frozenText2.classList.add('secondary', 'chat-input-frozen-text-subtitle');
    frozenText.append(frozenText1, frozenText2);
    this.frozenBtn = makeControlButton(frozenText);

    attachClickEvent(this.botStartBtn, this.startBot, {listenerSetter: this.listenerSetter});
    attachClickEvent(this.unblockBtn, this.unblockUser, {listenerSetter: this.listenerSetter});
    attachClickEvent(this.onlyPremiumBtn, () => {
      PopupPremium.show();
    }, {listenerSetter: this.listenerSetter});
    attachClickEvent(this.frozenBtn, () => {
      showFrozenPopup();
    }, {listenerSetter: this.listenerSetter});
    this.joinBtn && attachClickEvent(this.joinBtn, this.chat.topbar.onJoinClick.bind(this.chat.topbar, this.joinBtn), {listenerSetter: this.listenerSetter});

    // * pinned part start
    this.pinnedControlBtn = Button('btn-primary btn-transparent text-bold chat-input-control-button', {icon: 'unpin'});

    this.listenerSetter.add(this.pinnedControlBtn)('click', () => {
      const peerId = this.chat.peerId;

      PopupElement.createPopup(PopupPinMessage, peerId, 0, true, () => {
        this.chat.appImManager.setPeer({isDeleting: true}); // * close tab

        // ! костыль, это скроет закреплённые сообщения сразу, вместо того, чтобы ждать пока анимация перехода закончится
        const originalChat = this.chat.appImManager.chat;
        if(originalChat.topbar.pinnedMessage) {
          originalChat.topbar.pinnedMessage.pinnedMessageContainer.toggle(true);
        }
      });
    });
    // * pinned part end

    this.openChatBtn = makeControlButton('OpenChat');
    attachClickEvent(this.openChatBtn, () => {
      this.chat.appImManager.setInnerPeer({
        peerId: this.chat.threadId
      });
    }, {listenerSetter: this.listenerSetter});

    this.controlContainer.append(...[
      this.botStartBtn,
      this.unblockBtn,
      this.joinBtn,
      this.onlyPremiumBtn,
      this.frozenBtn,
      this.replyInTopicOverlay,
      this.pinnedControlBtn,
      this.openChatBtn
    ].filter(Boolean));
  }

  private setChatListeners() {
    this.listenerSetter.add(rootScope)('draft_updated', ({peerId, threadId, monoforumThreadId, draft, force}) => {
      // We don't have draft functionality when in the global monoforum chat, but we still need to clear the input right after sending the message
      if(!draft && force && this.chat.peerId === peerId && this.chat.isMonoforum) {
        this.setDraft(draft, true, force);
        return;
      }

      if(this.chat.threadId !== threadId || this.chat.monoforumThreadId !== monoforumThreadId || this.chat.peerId !== peerId || PEER_EXCEPTIONS.has(this.chat.type)) return;
      this.setDraft(draft, true, force);
    });

    this.listenerSetter.add(this.appImManager)('peer_changing', (chat) => {
      if(this.chat === chat && (this.chat.type === ChatType.Chat || this.chat.type === ChatType.Discussion)) {
        this.saveDraft();
      }
    });

    this.listenerSetter.add(this.appImManager)('chat_changing', ({from, to}) => {
      if(this.chat === from) {
        this.autocompleteHelperController.toggleListNavigation(false);
      } else if(this.chat === to) {
        this.autocompleteHelperController.toggleListNavigation(true);
      }
    });

    this.listenerSetter.add(rootScope)('scheduled_delete', ({peerId, mids}) => {
      if(this.chat.type === ChatType.Scheduled && this.chat.peerId === peerId && mids.includes(this.editMsgId)) {
        this.onMessageSent();
      }
    });

    this.listenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
      if(this.chat.peerId === peerId && !PEER_EXCEPTIONS.has(this.chat.type)) {
        if(msgs.has(this.editMsgId)) {
          this.onMessageSent();
        }

        if(this.replyToMsgId && msgs.has(this.replyToMsgId)) {
          this.clearHelper('reply');
        }

        /* if(this.chat.isStartButtonNeeded()) {
          this.setStartParam(BOT_START_PARAM);
        } */
      }
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      if(dialogs.has(this.chat.peerId) && (this.chat.type === ChatType.Chat || this.chat.type === ChatType.Discussion)) {
        if(this.startParam === BOT_START_PARAM) {
          this.setStartParam();
        } else { // updateNewMessage comes earlier than dialog appers
          this.center(true);
        }
      }
    });
  }

  public onAttachClick = async(documents?: boolean, photos?: boolean, videos?: boolean) => {
    if(await this.showSlowModeTooltipIfNeeded({
      element: this.attachMenu
    })) {
      return;
    }

    const promise = this.fileSelectionPromise = deferredPromise();
    this.fileInput.value = '';

    promise.finally(() => {
      idleController.removeEventListener('change', onIdleChange);
      if(promise !== this.fileSelectionPromise) {
        return;
      }
    });

    const onIdleChange = (idle: boolean) => {
      if(promise !== this.fileSelectionPromise) {
        promise.reject();
        return;
      }

      if(!idle) {
        setTimeout(() => {
          promise.reject();
        }, 1000);
      }
    };
    idleController.addEventListener('change', onIdleChange);

    if(documents) {
      this.fileInput.removeAttribute('accept');
      this.willAttachType = 'document';
    } else {
      const accept = [
        ...(photos ? IMAGE_MIME_TYPES_SUPPORTED : []),
        ...(videos ? VIDEO_MIME_TYPES_SUPPORTED : [])
      ].join(', ');

      this.fileInput.setAttribute('accept', accept || '*/*');
      this.willAttachType = 'media';
    }

    this.fileInput.click();
    this.onFileSelection?.(this.fileSelectionPromise);
  };

  public _center(neededFakeContainer: HTMLElement, animate?: boolean) {
    if(!neededFakeContainer && !this.inputContainer.classList.contains('is-centering')) {
      return;
    }

    if(neededFakeContainer === this.fakeWrapperTo) {
      return;
    }

    /* if(neededFakeContainer === this.botStartContainer && this.fakeWrapperTo === this.fakeSelectionWrapper) {
      this.inputContainer.classList.remove('is-centering');
      void this.rowsWrapper.offsetLeft; // reflow
      // this.inputContainer.classList.add('is-centering');
      // void this.rowsWrapper.offsetLeft; // reflow
    } */

    const fakeSelectionWrapper = neededFakeContainer || this.fakeWrapperTo;
    const forwards = !!neededFakeContainer;
    const oldFakeWrapperTo = this.fakeWrapperTo;
    let transform = '', borderRadius = '', needTranslateX: number;
    // if(forwards) {]
    const fakeSelectionRect = fakeSelectionWrapper.getBoundingClientRect();
    const fakeRowsRect = this.fakeRowsWrapper.getBoundingClientRect();
    const widthFrom = fakeRowsRect.width;
    const widthTo = fakeSelectionRect.width;

    if(widthFrom !== widthTo) {
      const scale = (widthTo/*  - 8 */) / widthFrom;
      const initTranslateX = (widthFrom - widthTo) / 2;
      needTranslateX = fakeSelectionRect.left - fakeRowsRect.left - initTranslateX;

      if(forwards) {
        transform = `translateX(${needTranslateX}px) scaleX(${scale})`;
        // transform = `translateX(0px) scaleX(${scale})`;

        if(scale < 1) {
          const br = 16;
          borderRadius = '' + (br + br * (1 - scale)) + 'px';
        }
      }
      // scale = widthTo / widthFrom;
    }
    // }

    this.fakeWrapperTo = neededFakeContainer;

    const duration = animate ? 200 : 0;
    SetTransition({
      element: this.inputContainer,
      className: 'is-centering',
      forwards,
      duration
    });
    SetTransition({
      element: this.rowsWrapperWrapper,
      className: 'is-centering-to-control',
      forwards: !!(forwards && neededFakeContainer && neededFakeContainer.classList.contains('chat-input-control')),
      duration
    });
    this.rowsWrapper.style.transform = transform;
    this.rowsWrapper.style.borderRadius = borderRadius;

    return {
      transform,
      borderRadius,
      needTranslateX: oldFakeWrapperTo && (
          (
            neededFakeContainer &&
            neededFakeContainer.classList.contains('chat-input-control') &&
            oldFakeWrapperTo === this.fakeSelectionWrapper
          ) || oldFakeWrapperTo.classList.contains('chat-input-control')
        ) ? needTranslateX * -.5 : needTranslateX,
      widthFrom,
      widthTo
    };
  }

  public async center(animate = false) {
    return this._center(await this.getNeededFakeContainer(), animate);
  }

  public setStartParam(startParam?: string) {
    if(this.startParam === startParam) {
      return;
    }

    this.startParam = startParam;
    this.center(true);
  }

  public unblockUser = () => {
    const toggle = this.toggleControlButtonDisability = toggleDisability([this.unblockBtn], true);
    const peerId = this.chat.peerId;
    const middleware = this.getMiddleware(() => {
      return this.chat.peerId === peerId && this.toggleControlButtonDisability === toggle;
    });

    this.managers.appUsersManager.toggleBlock(peerId, false).then(() => {
      if(middleware()) {
        toggle();
        this.toggleControlButtonDisability = undefined;
      }
    });
  };

  public startBot = () => {
    const {startParam} = this;

    const toggle = this.toggleControlButtonDisability = toggleDisability([this.botStartBtn], true);
    const peerId = this.chat.peerId;
    const middleware = this.getMiddleware(() => {
      return this.chat.peerId === peerId &&
        this.startParam === startParam &&
        this.toggleControlButtonDisability === toggle;
    });

    this.managers.appMessagesManager.startBot(peerId.toUserId(), undefined, startParam).then(() => {
      if(middleware()) {
        toggle();
        this.toggleControlButtonDisability = undefined;
        this.setStartParam();
      }
    });
  };

  public isReplyInTopicOverlayNeeded() {
    return REPLY_IN_TOPIC &&
      this.chat.isForum &&
      !this.chat.isForumTopic &&
      !this.replyToMsgId &&
      this.chat.type === ChatType.Chat;
  }

  public getJoinButtonType() {
    const {peerId, threadId, isMonoforum} = this.chat;
    if(peerId.isUser() || isMonoforum) {
      return;
    }

    const chat = apiManagerProxy.getChat(peerId.toChatId());
    if(!chat || !(chat as MTChat.channel).pFlags.left || (chat as MTChat.channel).pFlags.broadcast) {
      return;
    }

    if((chat as MTChat.channel).pFlags.join_request) {
      return 'request';
    }

    if((chat as MTChat.channel).pFlags.join_to_send || !threadId) {
      return 'join';
    }
  }

  public async getNeededFakeContainer(startParam = this.startParam) {
    if(this.chat.selection?.isSelecting) {
      return this.fakeSelectionWrapper;
    } else if(
      // startParam !== undefined || // * startParam isn't always should force control container, so it's commented
      // !(await this.chat.canSend()) || // ! WARNING, TEMPORARILY COMMENTED
      this.chat.type === ChatType.Pinned ||
      (this.chat.type === ChatType.Saved && this.chat.threadId !== this.chat.peerId) ||
      await this.chat.isStartButtonNeeded() ||
      this.isReplyInTopicOverlayNeeded() ||
      (this.chat.peerId.isUser() && (this.chat.isUserBlocked || this.chat.isPremiumRequired)) ||
      this.getJoinButtonType() ||
      (this.frozenBtn && useAppConfig().freeze_since_date && !(await this.chat.canSend()))
    ) {
      return this.controlContainer;
    }
  }

  // public getActiveContainer() {
  //   if(this.chat.selection.isSelecting) {
  //     return this.chat
  //   }
  //   return this.startParam !== undefined ? this.botStartContainer : this.rowsWrapper;
  // }

  // public setActiveContainer() {
  //   const container = this.activeContainer;
  //   const newContainer = this.getActiveContainer();
  //   if(newContainer === container) {
  //     return;
  //   }


  // }

  private onCancelRecordClick = (e?: Event) => {
    if(e) {
      cancelEvent(e);
    }

    this.recordCanceled = true;
    this.recorder.stop();
    opusDecodeController.setKeepAlive(false);
  };

  private onEmoticonsToggle = (open: boolean) => {
    if(!this.btnToggleEmoticons) {
      return;
    }

    if(!IS_TOUCH_SUPPORTED) {
      this.btnToggleEmoticons.classList.toggle('active', open);
    } else {
      replaceButtonIcon(this.btnToggleEmoticons, open ? 'keyboard' : 'smile');
    }
  };

  private onEmoticonsOpen = () => {
    this.onEmoticonsToggle(true);
  };

  private onEmoticonsClose = () => {
    this.onEmoticonsToggle(false);
  };

  public getReadyToSend(callback: () => void) {
    return this.chat.type === ChatType.Scheduled ? (this.scheduleSending(callback), true) : (callback(), false);
  }

  public canSendWhenOnline = async() => {
    const peerId = this.chat.peerId;
    if(rootScope.myId === peerId || !peerId.isUser()) {
      return false;
    }

    if(!(await this.managers.appUsersManager.isUserOnlineVisible(peerId))) {
      return false;
    }

    const user = await this.managers.appUsersManager.getUser(peerId);
    return user.status?._ !== 'userStatusOnline';
  };

  public setScheduleTimestamp(timestamp: number, callback: () => void) {
    const middleware = this.getMiddleware();
    const minTimestamp = (Date.now() / 1000 | 0) + 10;
    if(timestamp <= minTimestamp) {
      timestamp = undefined;
    }

    this.scheduleDate = timestamp;
    callback();

    if(this.chat.type !== ChatType.Scheduled && this.chat.type !== ChatType.Stories && timestamp) {
      setTimeout(() => { // ! need timeout here because .forwardMessages will be called after timeout
        if(!middleware()) {
          return;
        }

        const popups = PopupElement.getPopups(PopupStickers);
        popups.forEach((popup) => popup.hide());

        this.appImManager.openScheduled(this.chat.peerId);
      }, 0);
    }
  }

  public getMiddleware(...args: Parameters<Chat['bubbles']['getMiddleware']>) {
    return this.chat.bubbles.getMiddleware(...args);
  }

  public scheduleSending = async(
    callback: () => void = this.sendMessage.bind(this, true),
    initDate = new Date()
  ) => {
    const middleware = this.getMiddleware();
    const canSendWhenOnline = await this.canSendWhenOnline();
    if(!middleware()) {
      return;
    }

    PopupElement.createPopup(PopupSchedule, {
      initDate,
      onPick: (timestamp) => {
        if(!middleware()) {
          return;
        }

        this.setScheduleTimestamp(timestamp, callback);
      },
      canSendWhenOnline
    }).show();
  };

  public async setUnreadCount() {
    if(!this.goDownUnreadBadge) {
      return;
    }

    const dialog = this.chat.monoforumThreadId ?
      await this.managers.monoforumDialogsStorage.getDialogByParent(this.chat.peerId, this.chat.monoforumThreadId) :
      await this.managers.dialogsStorage.getAnyDialog(
        this.chat.peerId,
        this.chat.type === ChatType.Discussion ? undefined : this.chat.threadId
      );

    if(isSavedDialog(dialog)) {
      return;
    }

    assumeType<Partial<Pick<Dialog.dialog,
      | 'unread_count'
      | 'unread_mentions_count'
      | 'unread_reactions_count'
    >>>(dialog);

    const count = dialog?.unread_count;
    setBadgeContent(this.goDownUnreadBadge, '' + (count || ''));
    const isPeerLocalMuted = await this.managers.appNotificationsManager.isPeerLocalMuted({
      peerId: this.chat.peerId,
      respectType: true,
      threadId: this.chat.threadId
    });
    this.goDownUnreadBadge.classList.toggle('badge-gray', isPeerLocalMuted);

    if(this.goMentionUnreadBadge && this.chat.type === ChatType.Chat) {
      const hasMentions = !!(dialog?.unread_mentions_count && dialog.unread_count);
      setBadgeContent(this.goMentionUnreadBadge, hasMentions ? '' + (dialog.unread_mentions_count) : '');
      this.goMentionBtn.classList.toggle('is-visible', hasMentions);
    }

    if(this.goReactionUnreadBadge && this.chat.type === ChatType.Chat) {
      const hasReactions = !!dialog?.unread_reactions_count;
      setBadgeContent(this.goReactionUnreadBadge, hasReactions ? '' + (dialog.unread_reactions_count) : '');
      this.goReactionBtn.classList.toggle('is-visible', hasReactions);
    }
  }

  public getCurrentInputAsDraft(ignoreEmptyValue?: boolean) {
    const {value, entities} = getRichValueWithCaret(this.messageInputField.input, true, false);

    let draft: DraftMessage.draftMessage;
    if((value.length || ignoreEmptyValue) || this.replyToMsgId || this.willSendWebPage) {
      const webPage = this.willSendWebPage as WebPage.webPage;
      const webPageOptions = this.webPageOptions;
      const hasLargeMedia = !!webPage?.pFlags?.has_large_media;
      const replyTo = this.getReplyTo();
      draft = {
        _: 'draftMessage',
        date: tsNow(true),
        message: value.trim(),
        entities: entities.length ? entities : undefined,
        pFlags: {
          no_webpage: this.noWebPage,
          invert_media: this.invertMedia || undefined
        },
        reply_to: replyTo ? {
          _: 'inputReplyToMessage',
          reply_to_msg_id: replyTo.replyToMsgId,
          top_msg_id: this.chat.threadId,
          reply_to_peer_id: replyTo.replyToPeerId,
          monoforum_peer_id: replyTo.replyToMonoforumPeerId,
          ...(replyTo.replyToQuote && {
            quote_text: replyTo.replyToQuote.text,
            quote_entities: replyTo.replyToQuote.entities,
            quote_offset: replyTo.replyToQuote.offset
          })
        } : undefined,
        media: webPage ? {
          _: 'inputMediaWebPage',
          pFlags: {
            force_large_media: hasLargeMedia && webPageOptions?.largeMedia || undefined,
            force_small_media: hasLargeMedia && webPageOptions?.smallMedia || undefined,
            optional: true
          },
          url: webPage.url
        } : undefined,
        effect: this.effect()
      };
    }

    return draft;
  }

  public saveDraft() {
    const isMonoforumParent = this.chat.isMonoforum && !this.chat.monoforumThreadId;
    if(
      !this.chat.peerId ||
      this.editMsgId ||
      PEER_EXCEPTIONS.has(this.chat.type) ||
      isMonoforumParent
    ) {
      return;
    }

    const draft = this.getCurrentInputAsDraft();
    this.managers.appDraftsManager.syncDraft({peerId: this.chat.peerId, threadId: this.chat.threadId, monoforumThreadId: this.chat.monoforumThreadId, localDraft: draft});
  }

  public mentionUser(peerId: PeerId, isHelper?: boolean) {
    Promise.resolve(this.managers.appPeersManager.getPeer(peerId)).then((peer) => {
      let str = '', entity: MessageEntity;
      const usernames = getPeerActiveUsernames(peer);
      if(usernames[0]) {
        str = '@' + usernames[0];
      } else {
        if(peerId.isUser()) {
          str = (peer as User.user).first_name || (peer as User.user).last_name;
        } else {
          str = (peer as MTChat.channel).title;
        }

        entity = {
          _: 'messageEntityMentionName',
          length: str.length,
          offset: 0,
          user_id: peer.id
        };
      }

      str += ' ';
      this.insertAtCaret(str, entity, isHelper);
    });
  }

  public destroy() {
    // this.chat.log.error('Input destroying');

    this.listenerSetter.removeAll();
    this.setCurrentHover();
  }

  public cleanup(helperToo = true) {
    if(this.chat && !this.chat.peerId) {
      this.chatInput.classList.add('hide');
      this.goDownBtn.classList.add('hide');
    }

    cancelSelection();

    this.lastTimeType = 0;
    this.startParam = undefined;

    if(this.toggleControlButtonDisability) {
      this.toggleControlButtonDisability();
      this.toggleControlButtonDisability = undefined;
    }

    if(this.messageInput) {
      this.clearInput();
      helperToo && this.clearHelper();
    }
  }

  public async setDraft(draft?: MyDraftMessage, fromUpdate = true, force = false) {
    if(
      (!force && !isInputEmpty(this.messageInput)) ||
      PEER_EXCEPTIONS.has(this.chat.type)
    ) {
      return false;
    }

    if(!draft) {
      const isMonoforumParent = this.chat.isMonoforum && !this.chat.monoforumThreadId;

      draft = !isMonoforumParent ?
        await this.managers.appDraftsManager.getDraft(this.chat.peerId, this.chat.threadId || this.chat.monoforumThreadId) :
        undefined;

      if(!draft) {
        if(force) { // this situation can only happen when sending message with clearDraft
          /* const height = this.chatInput.getBoundingClientRect().height;
          const willChangeHeight = 78 - height;
          this.willChangeHeight = willChangeHeight; */
          if(this.chat.container.classList.contains('is-helper-active')) {
            this.t();
          }

          this.messageInputField.inputFake.textContent = '';
          this.messageInputField.onFakeInput(false);

          ((this.chat.bubbles.messagesQueuePromise || Promise.resolve()) as Promise<any>).then(() => {
            fastRaf(() => {
              this.onMessageSent();
            });
          });
        }

        return false;
      }
    }

    const wrappedDraft = wrapDraft(draft, {wrappingForPeerId: this.chat.peerId});
    const currentDraft = this.getCurrentInputAsDraft();

    const replyTo = draft.reply_to as InputReplyTo.inputReplyToMessage;
    const draftReplyToMsgId = replyTo?.reply_to_msg_id;
    if(draftsAreEqual(draft, currentDraft)) {
      return false;
    }

    if(fromUpdate) {
      this.clearHelper();
    }

    this.noWebPage = draft.pFlags.no_webpage;
    if(draftReplyToMsgId) {
      this.initMessageReply({
        replyToMsgId: draftReplyToMsgId,
        replyToPeerId: replyTo.reply_to_peer_id && getPeerId(replyTo.reply_to_peer_id),
        replyToQuote: replyTo.quote_text && {
          text: replyTo.quote_text,
          entities: replyTo.quote_entities,
          offset: replyTo.quote_offset
        },
        replyToMonoforumPeerId: replyTo.monoforum_peer_id && getPeerId(replyTo.monoforum_peer_id)
      });
    }

    this.setInputValue(wrappedDraft, fromUpdate, fromUpdate, draft);
    return true;
  }

  private createSendAs() {
    this.sendAsPeerId = undefined;

    if(this.chat && (this.chat.type === ChatType.Chat || this.chat.type === ChatType.Discussion)) {
      let firstChange = true;
      this.sendAs = new ChatSendAs({
        managers: this.managers,
        onReady: (container, skipAnimation) => {
          let useRafs = 0;
          if(!container.parentElement) {
            this.newMessageWrapper.prepend(container);
            useRafs = 2;
          }

          this.updateOffset('as', true, skipAnimation, useRafs);
        },
        onChange: (sendAsPeerId) => {
          this.sendAsPeerId = sendAsPeerId;

          // do not change placeholder earlier than finishPeerChange does
          if(firstChange) {
            firstChange = false;
            return;
          }

          this.getPlaceholderParams().then((params) => {
            this.updateMessageInputPlaceholder(params);
          });
        }
      });
    } else {
      this.sendAs = undefined;
    }

    return this.sendAs;
  }

  public async finishPeerChange(options: Parameters<Chat['finishPeerChange']>[0]) {
    const {peerId, startParam, middleware} = options;

    const {
      forwardElements,
      btnScheduled,
      replyKeyboard,
      sendMenu,
      goDownBtn,
      chatInput,
      botCommandsToggle,
      attachMenu
    } = this;

    const previousSendAs = this.sendAs;
    const sendAs = this.createSendAs();
    const filteredAttachMenuButtons = this.filterAttachMenuButtons();

    const [
      isBroadcast,
      canPinMessage,
      isBot,
      canSend,
      canSendPlain,
      neededFakeContainer,
      ackedPeerFull,
      ackedScheduledMids,
      setSendAsCallback,
      peerTitleShort,
      isPremiumRequired,
      appConfig
    ] = await Promise.all([
      this.managers.appPeersManager.isBroadcast(peerId),
      this.managers.appPeersManager.canPinMessage(peerId),
      this.managers.appPeersManager.isBot(peerId),
      this.chat?.canSend('send_messages') || true,
      this.chat?.canSend('send_plain') || true,
      this.getNeededFakeContainer(startParam),
      modifyAckedPromise(this.managers.acknowledged.appProfileManager.getProfileByPeerId(peerId)),
      btnScheduled ? modifyAckedPromise(this.managers.acknowledged.appMessagesManager.getScheduledMessages(peerId)) : undefined,
      sendAs ? (sendAs.setPeerId(peerId), sendAs.updateManual(true)) : undefined,
      wrapPeerTitle({peerId, onlyFirstName: true}),
      this.chat.isPremiumRequiredToContact(),
      apiManagerProxy.getAppConfig()
    ]);

    const placeholderParams = this.messageInput ? await this.getPlaceholderParams(canSendPlain) : undefined;

    return () => {
      const {isMonoforum, canManageDirectMessages, monoforumThreadId} = this.chat;
      // console.warn('[input] finishpeerchange start');

      chatInput.classList.remove('hide');
      if(goDownBtn) {
        goDownBtn.classList.toggle('is-broadcast', isBroadcast);
        goDownBtn.classList.remove('hide');
      }

      if(this.goDownUnreadBadge) {
        this.setUnreadCount();
      }

      if(this.chat?.type === ChatType.Pinned) {
        chatInput.classList.toggle('can-pin', canPinMessage);
      }/*  else if(this.chat.type === 'chat') {
      } */

      if(forwardElements) {
        this.forwardWasDroppingAuthor = false;
        forwardElements.showCaption.checkboxField.setValueSilently(true);
        forwardElements.showSender.checkboxField.setValueSilently(true);
      }

      if(btnScheduled && ackedScheduledMids) {
        btnScheduled.classList.add('hide');
        callbackify(ackedScheduledMids.result, (mids) => {
          if(!middleware() || !mids) return;
          btnScheduled.classList.toggle('hide', !mids.length);
        });
      }

      if(this.newMessageWrapper) {
        this.updateOffset(null, false, true);
      }

      if(botCommandsToggle) {
        this.hasBotCommands = undefined;
        this.botMenuButton = undefined;
        this.botCommands.toggle(true, undefined, true);
        this.updateBotCommandsToggle(true);
        botCommandsToggle.remove();
        if(isBot) {
          const result = ackedPeerFull.result;
          callbackify(result, (userFull) => {
            if(!middleware()) return;
            this.updateBotCommands(userFull as UserFull.userFull, !(result instanceof Promise));
          });
        }
      }

      previousSendAs?.destroy();
      setSendAsCallback?.();
      replyKeyboard?.setPeer(peerId);
      sendMenu?.setPeerParams({peerId, isPaid: !!this.chat.starsAmount});

      let haveSomethingInControl = false;
      if(this.chat && this.frozenBtn) {
        const good = !haveSomethingInControl && appConfig.freeze_since_date && !canSend;
        haveSomethingInControl ||= good;
        this.frozenBtn.classList.toggle('hide', !good);
      }

      if(this.chat && this.joinBtn) {
        const type = this.getJoinButtonType();
        const good = !haveSomethingInControl && !!type;
        haveSomethingInControl ||= good;
        this.joinBtn.classList.toggle('hide', !good);
        this.joinBtn.replaceChildren(i18n(type === 'request' ? 'ChannelJoinRequest' : 'ChannelJoin'));
      }

      if(this.chat && this.pinnedControlBtn) {
        const good = !haveSomethingInControl && this.chat.type === ChatType.Pinned;
        haveSomethingInControl ||= good;
        this.pinnedControlBtn.classList.toggle('hide', !good);
        this.pinnedControlBtn.replaceChildren(i18n(canPinMessage ? 'Chat.Input.UnpinAll' : 'Chat.Pinned.DontShow'));
      }

      if(this.chat && this.openChatBtn) {
        const good = !haveSomethingInControl && this.chat.type === ChatType.Saved;
        haveSomethingInControl ||= good;
        if(good) {
          const savedPeerId = this.chat.threadId;
          const peer = apiManagerProxy.getPeer(savedPeerId);
          const key: LangPackKey = (peer as MTChat.channel).pFlags.broadcast ? 'OpenChannel2' : (savedPeerId.isUser() ? ((peer as User.user).pFlags.bot ? 'BotWebViewOpenBot' : 'OpenChat') : 'OpenGroup2');
          const span = i18n(key);
          this.openChatBtn.querySelector('.i18n').replaceWith(span);
        }
        this.openChatBtn.classList.toggle('hide', !good);
      }

      if(REPLY_IN_TOPIC && this.chat) {
        const good = !haveSomethingInControl && this.chat.isForum && !this.chat.isForumTopic && this.chat.type === ChatType.Chat;
        haveSomethingInControl ||= good;
        this.replyInTopicOverlay.classList.toggle('hide', !good);
      }

      if(this.chat && this.onlyPremiumBtn) {
        const good = !haveSomethingInControl && !isBot && peerId.isUser() && isPremiumRequired;
        haveSomethingInControl ||= good;
        this.onlyPremiumBtnText.compareAndUpdate({
          args: [peerTitleShort, this.onlyPremiumBtnText.args[1]]
        });
        this.onlyPremiumBtn.classList.toggle('hide', !good);
      }

      if(this.chat) {
        const good = !haveSomethingInControl && !isBot && peerId.isUser();
        haveSomethingInControl ||= good;
        this.unblockBtn.classList.toggle('hide', !good);
      }

      if(this.chat) {
        this.btnSuggestPost.classList.toggle('hide', !this.canShowSuggestPostButton(!!this.helperType));
      }

      this.botStartBtn.classList.toggle('hide', haveSomethingInControl);

      if(this.messageInput) {
        this.updateMessageInput(
          canSend || haveSomethingInControl,
          canSendPlain,
          placeholderParams,
          peerId.isUser() ? options.text : undefined,
          peerId.isUser() ? options.entities : undefined
        );
        this.messageInput.dataset.peerId = '' + peerId;

        if(filteredAttachMenuButtons && attachMenu) {
          filteredAttachMenuButtons.then((visible) => {
            if(!middleware()) {
              return;
            }

            attachMenu.toggleAttribute('disabled', !visible.length);
            attachMenu.classList.toggle('btn-disabled', !visible.length);
          });
        }
      }

      this.messageInputField?.onFakeInput(undefined, true);

      // * testing
      // this.startParam = this.appPeersManager.isBot(peerId) ? '123' : undefined;

      this.startParam = startParam;

      this._center(neededFakeContainer, false);

      this.setStarsAmount(this.chat?.starsAmount); // should reset when undefined

      this.directMessagesHandler.set({
        isMonoforumAllChats: isMonoforum && canManageDirectMessages && !monoforumThreadId,
        isReplying: !!this.helperType
      });
      // console.warn('[input] finishpeerchange ends');
    };
  }

  private updateOffset(
    type: ChatInput['hasOffset']['type'],
    forwards: boolean,
    skipAnimation?: boolean,
    useRafs?: number,
    applySameType?: boolean // ! WARNING
  ) {
    const prevOffset = this.hasOffset;
    const newOffset: ChatInput['hasOffset'] = {type, forwards};
    if(deepEqual(prevOffset, newOffset) && !applySameType) {
      return;
    }

    this.hasOffset = newOffset;

    if(type) {
      this.newMessageWrapper.dataset.offset = type;
    } else {
      delete this.newMessageWrapper.dataset.offset;
    }

    if(prevOffset?.forwards === newOffset.forwards && !applySameType) {
      return;
    }

    SetTransition({
      element: this.newMessageWrapper,
      className: 'has-offset',
      forwards,
      duration: skipAnimation ? 0 : 300,
      useRafs
    });
  }

  private updateBotCommands(userFull: UserFull.userFull, skipAnimation?: boolean) {
    const botInfo = userFull.bot_info;
    const menuButton = botInfo?.menu_button;
    this.hasBotCommands = !!botInfo?.commands?.length;
    this.botMenuButton = menuButton?._ === 'botMenuButton' ? menuButton : undefined;
    replaceContent(this.botCommandsView, this.botMenuButton ? wrapEmojiText(this.botMenuButton.text) : '');
    this.botCommandsIcon.classList.toggle('hide', !!this.botMenuButton);
    this.botCommandsView.classList.toggle('hide', !this.botMenuButton);
    this.botCommandsToggle.classList.toggle('is-view', !!this.botMenuButton);
    this.updateBotCommandsToggle(skipAnimation);
  }

  private updateBotCommandsToggle(skipAnimation?: boolean) {
    const {botCommandsToggle, hasBotCommands, botMenuButton} = this;

    const isNeeded = !!(hasBotCommands || botMenuButton);

    const isInputEmpty = this.isInputEmpty();
    const show = isNeeded && (isInputEmpty || !!botMenuButton);
    if(!isNeeded) {
      if(!botCommandsToggle.parentElement) {
        return;
      }

      botCommandsToggle.remove();
    }

    const forwards = show;
    const useRafs = botCommandsToggle.parentElement ? 0 : 2;

    if(botMenuButton && isInputEmpty) {
      // padding + icon size + icon margin
      const width = getTextWidth(botMenuButton.text, FontFull) + 22 + 20 + 6;
      this.newMessageWrapper.style.setProperty('--commands-size', `${Math.ceil(width)}px`);
    } else {
      // this.newMessageWrapper.style.setProperty('--commands-size', `38px`);
      this.newMessageWrapper.style.removeProperty('--commands-size');
    }

    if(!botCommandsToggle.parentElement) {
      this.newMessageWrapper.prepend(botCommandsToggle);
    }

    this.updateOffset('commands', forwards, skipAnimation, useRafs, true);
  }

  private async getPlaceholderParams(canSend?: boolean): Promise<Parameters<ChatInput['updateMessageInputPlaceholder']>[0]> {
    canSend ??= await this.chat.canSend('send_plain');
    const {peerId, threadId, isForum, type} = this.chat;
    let key: LangPackKey, args: FormatterArguments, inputStarsCountEl: HTMLElement;
    if(!canSend) {
      key = 'Channel.Persmission.MessageBlock';
    } else if(threadId && !isForum && !peerId.isUser()) {
      key = 'Comment';
    } else if(await this.managers.appPeersManager.isBroadcast(peerId)) {
      key = 'ChannelBroadcast';
    } else if(this.chat.isMonoforum && this.chat.canManageDirectMessages) {
      key = this.directMessagesHandler.store.isSuggestingUneditablePostChange ?
        'ChannelDirectMessages.CantChangeSuggestedPostMessage' :
        this.chat.monoforumThreadId || this.directMessagesHandler.store.isReplying ?
          'Message' :
          'ChannelDirectMessages.ChooseMessage';
    } else if(
      (this.sendAsPeerId !== undefined && this.sendAsPeerId !== rootScope.myId) ||
      await this.managers.appMessagesManager.isAnonymousSending(peerId)
    ) {
      key = 'SendAnonymously';
    } else if(type === ChatType.Stories) {
      key = 'Story.ReplyPlaceholder';
    } else if(isForum && type === ChatType.Chat && !threadId) {
      const topic = await this.managers.dialogsStorage.getForumTopic(peerId, GENERAL_TOPIC_ID);
      if(topic) {
        key = 'TypeMessageIn';
        args = [wrapEmojiText(topic.title)];
      } else {
        key = 'Message';
      }
    } else if(this.chat.starsAmount) {
      key = 'PaidMessages.MessageForStars';
      const starsElement = document.createElement('span');
      const span = inputStarsCountEl = document.createElement('span');
      starsElement.append(Icon('star', 'input-message-placeholder-stars'), span);

      args = [starsElement];
    } else {
      key = 'Message';
    }

    return {key, args, inputStarsCountEl};
  }

  private updateMessageInputPlaceholder({key, args = [], inputStarsCountEl}: {key: LangPackKey, args?: FormatterArguments, inputStarsCountEl?: HTMLElement}) {
    // console.warn('[input] update placeholder');
    // const i = I18n.weakMap.get(this.messageInput) as I18n.IntlElement;
    const i = I18n.weakMap.get(this.messageInputField.placeholder) as I18n.IntlElement;
    if(!i) {
      return;
    }

    const oldKey = i.key;
    const oldArgs = i.args;
    i.compareAndUpdateBool({key, args}) &&
    this.starsState.set({inputStarsCountEl});

    return {oldKey, oldArgs};
  }

  private filterAttachMenuButtons() {
    if(!this.attachMenuButtons) return;
    return filterAsync(this.attachMenuButtons, (button) => {
      return button.verify ? button.verify() : true;
    });
  }

  public updateMessageInput(
    canSend: boolean,
    canSendPlain: boolean,
    placeholderParams: Parameters<ChatInput['updateMessageInputPlaceholder']>[0],
    text?: string,
    entities?: MessageEntity[]
  ) {
    const {chatInput, messageInput} = this;
    const isHidden = chatInput.classList.contains('is-hidden');
    const willBeHidden = !canSend;
    if(isHidden !== willBeHidden) {
      chatInput.classList.add('no-transition');
      chatInput.classList.toggle('is-hidden', !canSend);
      void chatInput.offsetLeft; // reflow
      chatInput.classList.remove('no-transition');
    }

    const isEditingAndLocked = canSend && !canSendPlain && this.restoreInputLock;

    !isEditingAndLocked && this.updateMessageInputPlaceholder(placeholderParams);

    if(isEditingAndLocked) {
      this.restoreInputLock = () => {
        this.updateMessageInputPlaceholder(placeholderParams);
        this.messageInput.contentEditable = 'false';
      };
    } else if(!canSend || !canSendPlain) {
      messageInput.contentEditable = 'false';

      if(!canSendPlain) {
        this.messageInputField.onFakeInput(undefined, true);
      }
    } else {
      this.restoreInputLock = undefined;
      messageInput.contentEditable = 'true';
      if(text) {
        this.managers.appDraftsManager.setDraft(this.chat.peerId, undefined, text, entities);
      }
      this.setDraft(undefined, false);

      if(!messageInput.innerHTML) {
        this.messageInputField.onFakeInput(undefined, true);
      }
    }

    this.updateSendBtn();
  }

  private attachMessageInputField() {
    const oldInputField = this.messageInputField;
    this.messageInputField = new InputFieldAnimated({
      placeholder: 'Message',
      // placeholderAsElement: true,
      name: 'message',
      withLinebreaks: true
    });

    this.messageInputField.input.tabIndex = -1;
    this.messageInputField.input.classList.replace('input-field-input', 'input-message-input');
    this.messageInputField.inputFake.classList.replace('input-field-input', 'input-message-input');
    this.messageInput = this.messageInputField.input;
    this.attachMessageInputListeners();
    createMarkdownCache(this.messageInput);

    if(IS_STICKY_INPUT_BUGGED) {
      fixSafariStickyInputFocusing(this.messageInput);
    }

    if(oldInputField) {
      oldInputField.input.replaceWith(this.messageInputField.input);
      oldInputField.placeholder.replaceWith(this.messageInputField.placeholder);
      oldInputField.inputFake.replaceWith(this.messageInputField.inputFake);
    } else {
      this.inputMessageContainer.append(this.messageInputField.input, this.messageInputField.placeholder, this.messageInputField.inputFake);
    }
  }

  public passEventToInput(e: KeyboardEvent): void {
    if(!isSendShortcutPressed(e)) return void focusInput(this.messageInput, e);

    this.sendMessage();
    document.addEventListener('keyup', () => {
      focusInput(this.messageInput);
    }, {once: true});
  }

  private attachMessageInputListeners() {
    this.listenerSetter.add(this.messageInput)('keydown', (e) => {
      const key = e.key;

      if(isSendShortcutPressed(e)) {
        cancelEvent(e);
        this.sendMessage();
      } else if(e.ctrlKey || e.metaKey) {
        handleMarkdownShortcut(this.messageInput, e);
      } else if((key === 'PageUp' || key === 'PageDown') && !e.shiftKey) { // * fix pushing page to left (Chrome Windows)
        e.preventDefault();

        if(key === 'PageUp') {
          const range = document.createRange();
          const sel = window.getSelection();

          range.setStart(this.messageInput.childNodes[0] || this.messageInput, 0);
          range.collapse(true);

          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          placeCaretAtEnd(this.messageInput);
        }
      }
    });

    attachClickEvent(this.messageInput, (e) => {
      if(!this.canSendPlain()) {
        toastNew({
          langPackKey: POSTING_NOT_ALLOWED_MAP['send_plain']
        });
        return;
      }

      // const checkPseudoElementClick = (e: MouseEvent, tag: 'after' | 'before') => {
      //   const target = (e.currentTarget || e.target) as HTMLElement;
      //   const pseudo = getComputedStyle(target, `:${tag}`);
      //   if(!pseudo) {
      //     return false;
      //   }

      //   const [atop, aheight, aleft, awidth] = ['top', 'height', 'left', 'width'].map((k) => pseudo.getPropertyValue(k).slice(0, -2));

      //   const ex = (e as any).layerX;
      //   const ey = (e as any).layerY;
      //   if(ex > aleft && ex < (aleft + awidth) && ey > atop && ey < (atop + aheight)) {
      //     return true;
      //   }

      //   return false;
      // };

      const checkIconClick = (e: MouseEvent, quote: HTMLElement) => {
        const rect = quote.getBoundingClientRect();
        const ex = e.clientX;
        const ey = e.clientY;
        const elementWidth = 20;
        const elementHeight = 20;
        if(ex > (rect.right - elementWidth) && ex < rect.right && ey > rect.top && ey < (rect.top + elementHeight)) {
          return true;
        }

        return false;
      };

      const quote = findUpClassName(e.target, 'can-send-collapsed');
      if(quote && checkIconClick(e, quote)) {
        if(quote.dataset.collapsed) delete quote.dataset.collapsed;
        else quote.dataset.collapsed = '1';
        toastNew({langPackKey: quote.dataset.collapsed ? 'Input.Quote.Collapsed' : 'Input.Quote.Expanded'});
        return;
      }
    }, {listenerSetter: this.listenerSetter});

    if(IS_TOUCH_SUPPORTED) {
      attachClickEvent(this.messageInput, (e) => {
        if(this.emoticonsDropdown.isActive()) {
          this.emoticonsDropdown.toggle(false);
          blurActiveElement();
          cancelEvent(e);
          // this.messageInput.focus();
          return;
        }

        if(!this.chat.isStandalone) {
          this.appImManager.selectTab(APP_TABS.CHAT); // * set chat tab for album orientation
        }
        // this.saveScroll();
      }, {listenerSetter: this.listenerSetter});

      /* this.listenerSetter.add(window)('resize', () => {
        this.restoreScroll();
      }); */

      /* if(isSafari) {
        this.listenerSetter.add(this.messageInput)('mousedown', () => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              emoticonsDropdown.toggle(false);
            });
          });
        });
      } */
    }

    /* this.listenerSetter.add(this.messageInput)('beforeinput', (e: Event) => {
      // * validate due to manual formatting through browser's context menu
      const inputType = (e as InputEvent).inputType;
      //console.log('message beforeinput event', e);

      if(inputType.indexOf('format') === 0) {
        //console.log('message beforeinput format', e, inputType, this.messageInput.innerHTML);
        const markdownType = inputType.split('format')[1].toLowerCase() as MarkdownType;
        if(this.applyMarkdown(markdownType)) {
          cancelEvent(e); // * cancel legacy markdown event
        }
      }
    }); */
    this.listenerSetter.add(this.messageInput)('input', this.onMessageInput);
    this.listenerSetter.add(this.messageInput)('keyup', () => {
      this.checkAutocomplete();
    });

    this.listenerSetter.add(this.messageInput)('focusin', () => {
      this.isFocused = true;
      // this.updateSendBtn();

      if((this.chat.type === ChatType.Chat || this.chat.type === ChatType.Discussion) &&
        this.chat.bubbles.scrollable.loadedAll.bottom) {
        this.managers.appMessagesManager.readAllHistory(this.chat.peerId, this.chat.threadId);
      }

      this.onFocusChange?.(true);
    });

    this.listenerSetter.add(this.messageInput)('focusout', () => {
      this.isFocused = false;
      // this.updateSendBtn();

      this.onFocusChange?.(false);
    });
  }

  public canSendPlain() {
    return this.messageInput.isContentEditable && !this.chatInput.classList.contains('is-hidden');
  }

  public onMessageInput = (e?: Event) => {
    // * validate due to manual formatting through browser's context menu
    /* const inputType = (e as InputEvent).inputType;
    console.log('message input event', e);
    if(inputType === 'formatBold') {
      console.log('message input format', this.messageInput.innerHTML);
      cancelEvent(e);
    }

    if(!isSelectionSingle()) {
      alert('not single');
    } */

    // console.log('messageInput input', this.messageInput.innerText);
    // const value = this.messageInput.innerText;
    const {value: richValue, entities: markdownEntities1, caretPos} = getRichValueWithCaret(this.messageInputField.input);

    // const entities = parseEntities(value);
    const [value, markdownEntities] = parseMarkdown(richValue, markdownEntities1, true);
    const entities = mergeEntities(markdownEntities, parseEntities(value));

    this.throttledSetMessageCountToBadgeState(richValue);

    maybeClearUndoHistory(this.messageInput);

    this.processWebPage(richValue, entities);

    const isEmpty = !richValue.trim();
    if(isEmpty) {
      if(this.lastTimeType) {
        this.managers.appMessagesManager.setTyping(this.chat.peerId, {_: 'sendMessageCancelAction'}, undefined, this.chat.threadId);
      }

      MarkupTooltip.getInstance().hide();

      // * Chrome has a bug - it will preserve the formatting if the input with monospace text is cleared
      // * so have to reset formatting
      if(document.activeElement === this.messageInput && !IS_MOBILE) {
        setTimeout(() => {
          if(document.activeElement === this.messageInput) {
            this.messageInput.textContent = '1';
            placeCaretAtEnd(this.messageInput);
            this.messageInput.textContent = '';
          }
        }, 0);
      }
    } else {
      const time = Date.now();
      if((time - this.lastTimeType) >= 6000 && e?.isTrusted) {
        this.lastTimeType = time;
        this.managers.appMessagesManager.setTyping(this.chat.peerId, {_: 'sendMessageTypingAction'}, undefined, this.chat.threadId);
      }

      this.botCommands?.toggle(true);
    }

    if(this.botCommands) {
      this.updateBotCommandsToggle();
    }

    if(!this.editMsgId && !this.processingDraftMessage) {
      this.saveDraftDebounced();
    }

    this.checkAutocomplete(richValue, caretPos, entities);

    processCurrentFormatting(this.messageInput);

    this.updateSendBtn();
  };

  private processWebPage(
    richValue: string,
    entities: MessageEntity[],
    message: Message.message | DraftMessage.draftMessage = this.processingDraftMessage || this.editMessage
  ) {
    const messageMedia = message?.media;
    const invertMedia = message?.pFlags?.invert_media;
    const webPageUrl = messageMedia?._ === 'inputMediaWebPage' ?
      messageMedia.url :
      ((messageMedia as MessageMedia.messageMediaWebPage)?.webpage as WebPage.webPage)?.url;
    const urlEntities: Array<MessageEntity.messageEntityUrl | MessageEntity.messageEntityTextUrl> =
      (!messageMedia || webPageUrl) &&
      entities.filter((e) => e._ === 'messageEntityUrl' || e._ === 'messageEntityTextUrl') as any;
    if(!urlEntities?.length) {
      if(this.lastUrl) {
        this.lastUrl = '';
        delete this.noWebPage;
        this.willSendWebPage = null;

        if(this.helperType) {
          this.helperFunc();
        } else {
          this.clearHelper();
        }
      }

      return;
    }

    let foundUrl = webPageUrl;
    if(!foundUrl) for(const entity of urlEntities) {
      let url: string;
      if(entity._ === 'messageEntityTextUrl') {
        url = entity.url;
      } else {
        url = richValue.slice(entity.offset, entity.offset + entity.length);

        if(!(url.includes('http://') || url.includes('https://'))) {
          continue;
        }
      }

      foundUrl = url;
      break;
    }

    if(this.lastUrl === foundUrl) {
      return;
    }

    if(!foundUrl) {
      if(this.willSendWebPage) {
        this.onHelperCancel();
      }

      return;
    }

    this.lastUrl = foundUrl;
    const oldWebPage = webPageUrl;
    const promise = this.getWebPagePromise = Promise.all([
      this.managers.appWebPagesManager.getWebPage(foundUrl),
      this.chat.canSend('embed_links')
    ]).then(([webPage, canEmbedLinks]) => {
      if(this.getWebPagePromise === promise) this.getWebPagePromise = undefined;
      if(this.lastUrl !== foundUrl) return;
      if(webPage?._  === 'webPage' && canEmbedLinks) {
        const newReply = this.setTopInfo({
          type: 'webpage',
          callerFunc: () => {},
          title: webPage.site_name || webPage.title || 'Webpage',
          subtitle: webPage.description || webPage.url || ''
        });

        this.setCurrentHover(this.webPageHover, newReply);
        delete this.noWebPage;
        this.willSendWebPage = webPage;

        if(this.webPageElements) {
          const positionElement = oldWebPage && invertMedia ? this.webPageElements.above : this.webPageElements.below;
          positionElement.checkboxField.checked = true;

          const sizeElement = oldWebPage && (messageMedia as MessageMedia.messageMediaWebPage).pFlags.force_small_media ? this.webPageElements.smaller : this.webPageElements.larger;
          sizeElement.checkboxField.checked = true;

          const sizeGroupContainer = sizeElement.element.parentElement;
          sizeGroupContainer.classList.toggle('hide', !webPage.pFlags.has_large_media);
        }

        this.webPageOptions = {
          optional: true,
          ...(oldWebPage ? {
            smallMedia: oldWebPage && (messageMedia as MessageMedia.messageMediaWebPage).pFlags.force_small_media || undefined,
            largeMedia: oldWebPage && (messageMedia as MessageMedia.messageMediaWebPage).pFlags.force_large_media || undefined
          } : {})
        };
      } else if(this.willSendWebPage) {
        this.onHelperCancel();
      }
    });
  }

  public insertAtCaret(insertText: string, insertEntity?: MessageEntity, isHelper = true) {
    if(!this.canSendPlain()) {
      toastNew({
        langPackKey: POSTING_NOT_ALLOWED_MAP['send_plain']
      });
      return;
    }

    RichInputHandler.getInstance().makeFocused(this.messageInput);

    const {value: fullValue, caretPos, entities} = getRichValueWithCaret(this.messageInput);
    const pos = caretPos >= 0 ? caretPos : fullValue.length;
    const prefix = fullValue.substr(0, pos);
    const suffix = fullValue.substr(pos);

    const matches = isHelper ? prefix.match(ChatInput.AUTO_COMPLETE_REG_EXP) : null;

    const matchIndex = matches ? matches.index + (matches[0].length - matches[2].length) : prefix.length;
    const newPrefix = prefix.slice(0, matchIndex);
    const newValue = newPrefix + insertText + suffix;

    if(isHelper && caretPos !== -1) {
      const match = matches ? matches[2] : fullValue;
      // const {node, selection} = getCaretPosNew(this.messageInput);

      const selection = document.getSelection();
      // const range = document.createRange();
      let counter = 0;
      while(selection.toString() !== match) {
        if(++counter >= 10000) {
          throw new Error('lolwhat');
        }

        // for(let i = 0; i < match.length; ++i) {
        selection.modify('extend', 'backward', 'character');
      }
    }

    {
      // const fragment = wrapDraftText(insertText, {entities: insertEntity ? [insertEntity] : undefined, wrappingForPeerId: this.chat.peerId});
      insertRichTextAsHTML(this.messageInput, insertText, insertEntity ? [insertEntity] : undefined, this.chat.peerId);
      // const {node, offset} = getCaretPos(this.messageInput);
      // const fragmentLastChild = fragment.lastChild;
      // if(node?.nodeType === node.TEXT_NODE) {
      //   const prefix = node.nodeValue.slice(0, offset);
      //   const suffix = node.nodeValue.slice(offset);

      //   const suffixNode = document.createTextNode(suffix);

      //   node.nodeValue = prefix;
      //   node.parentNode.insertBefore(suffixNode, node.nextSibling);
      //   node.parentNode.insertBefore(fragment, suffixNode);

      //   setCaretAt(fragmentLastChild.nextSibling);

      //   this.messageInputField.simulateInputEvent();
      // }
    }
    // return;

    // // merge emojis
    // const hadEntities = parseEntities(fullValue);
    // mergeEntities(entities, hadEntities);

    // // max for additional whitespace
    // const insertLength = insertEntity ? Math.max(insertEntity.length, insertText.length) : insertText.length;
    // const addEntities: MessageEntity[] = [];
    // if(insertEntity) {
    //   addEntities.push(insertEntity);
    //   insertEntity.offset = matchIndex;
    // }

    // // add offset to entities next to emoji
    // const diff = matches ? insertLength - matches[2].length : insertLength;
    // entities.forEach((entity) => {
    //   if(entity.offset >= matchIndex) {
    //     entity.offset += diff;
    //   }
    // });

    // mergeEntities(entities, addEntities);

    // if(/* caretPos !== -1 && caretPos !== fullValue.length */true) {
    //   const caretEntity: MessageEntity.messageEntityCaret = {
    //     _: 'messageEntityCaret',
    //     offset: matchIndex + insertLength,
    //     length: 0
    //   };

    //   let insertCaretAtIndex = 0;
    //   for(let length = entities.length; insertCaretAtIndex < length; ++insertCaretAtIndex) {
    //     const entity = entities[insertCaretAtIndex];
    //     if(entity.offset > caretEntity.offset) {
    //       break;
    //     }
    //   }

    //   entities.splice(insertCaretAtIndex, 0, caretEntity);
    // }

    // // const saveExecuted = this.prepareDocumentExecute();
    // // can't exec .value here because it will instantly check for autocomplete
    // const value = documentFragmentToHTML(wrapDraftText(newValue, {entities}));
    // this.messageInputField.setValueSilently(value);

    // const caret = this.messageInput.querySelector('.composer-sel');
    // if(caret) {
    //   setCaretAt(caret);
    //   caret.remove();
    // }

    // // but it's needed to be checked only here
    // this.onMessageInput();

    // // saveExecuted();

    // // document.execCommand('insertHTML', true, wrapEmojiText(emoji));
  }

  public onEmojiSelected = (emoji: ReturnType<typeof getEmojiFromElement>, autocomplete: boolean) => {
    const entity: MessageEntity = emoji.docId ? {
      _: 'messageEntityCustomEmoji',
      document_id: emoji.docId,
      length: emoji.emoji.length,
      offset: 0
    } : getEmojiEntityFromEmoji(emoji.emoji);
    this.insertAtCaret(emoji.emoji, entity, autocomplete);
    return true;
  };

  private async checkAutocomplete(value?: string, caretPos?: number, entities?: MessageEntity[]) {
    // return;

    const hadValue = value !== undefined;
    if(!hadValue) {
      const r = getRichValueWithCaret(this.messageInputField.input, true, true);
      value = r.value;
      caretPos = r.caretPos;
      entities = r.entities;
    }

    if(caretPos === -1) {
      caretPos = value.length;
    }

    if(entities === undefined || !hadValue) {
      const [_value, newEntities] = parseMarkdown(value, entities, true);
      entities = mergeEntities(newEntities, parseEntities(_value));
    }

    value = value.slice(0, caretPos);

    if(this.previousQuery === value) {
      return;
    }

    this.previousQuery = value;

    const matches = value.match(ChatInput.AUTO_COMPLETE_REG_EXP);
    let foundHelper: AutocompleteHelper;
    if(matches) {
      const entity = entities[0];

      let query = matches[2];
      const firstChar = query[0];

      if(
        this.stickersHelper &&
        rootScope.settings.stickers.suggest !== 'none' &&
        await this.chat.canSend('send_stickers') &&
        (['messageEntityEmoji', 'messageEntityCustomEmoji'] as MessageEntity['_'][]).includes(entity?._) &&
        entity.length === value.length &&
        !entity.offset
      ) {
        foundHelper = this.stickersHelper;
        this.stickersHelper.checkEmoticon(value);
      } else if(firstChar === '@') { // mentions
        const topMsgId = this.chat.threadId ? getServerMessageId(this.chat.threadId) : undefined;
        const result = this.mentionsHelper.checkQuery(
          query,
          this.chat.peerId.isUser() ? NULL_PEER_ID : this.chat.peerId,
          topMsgId,
          this.globalMentions
        );
        if(result) {
          foundHelper = this.mentionsHelper;
        }
      } else if(!matches[1] && firstChar === '/') { // commands
        if(this.commandsHelper && await this.commandsHelper.checkQuery(query, this.chat.peerId)) {
          foundHelper = this.commandsHelper;
        }
      } else if(rootScope.settings.emoji.suggest) { // emoji
        query = query.replace(/^\s*/, '');
        if(!value.match(/^\s*:(.+):\s*$/) && !value.match(/:[;!@#$%^&*()-=|]/) && query) {
          foundHelper = this.emojiHelper;
          this.emojiHelper.checkQuery(query, firstChar);
        }
      }
    }

    let canSendInline: boolean;
    if(!foundHelper) {
      canSendInline = await this.chat.canSend('send_inline');
    }

    foundHelper = this.checkInlineAutocomplete(value, canSendInline, foundHelper);

    this.autocompleteHelperController.hideOtherHelpers(foundHelper);
  }

  private checkInlineAutocomplete(value: string, canSendInline: boolean, foundHelper?: AutocompleteHelper): AutocompleteHelper {
    let needPlaceholder = false;

    const setPreloaderShow = (show: boolean) => {
      if(!this.btnPreloader) {
        return;
      }

      if(show && !canSendInline) {
        show = false;
      }

      SetTransition({
        element: this.btnPreloader,
        className: 'show',
        forwards: show,
        duration: 400
      });
    };

    if(!foundHelper) {
      const inlineMatch = value.match(/^@([a-zA-Z\\d_]{3,32})\s/);
      if(inlineMatch) {
        const username = inlineMatch[1];
        const query = value.slice(inlineMatch[0].length);
        needPlaceholder = inlineMatch[0].length === value.length;

        foundHelper = this.inlineHelper;

        if(!this.btnPreloader) {
          this.btnPreloader = this.createButtonIcon('none btn-preloader float show disable-hover', {noRipple: true});
          putPreloader(this.btnPreloader, true);
          this.inputMessageContainer.parentElement.insertBefore(this.btnPreloader, this.inputMessageContainer.nextSibling);
        } else {
          setPreloaderShow(true);
        }

        this.inlineHelper.checkQuery(this.chat.peerId, username, query, canSendInline).then(({user, renderPromise}) => {
          if(needPlaceholder && user.bot_inline_placeholder) {
            this.messageInput.dataset.inlinePlaceholder = user.bot_inline_placeholder;
          }

          renderPromise.then(() => {
            setPreloaderShow(false);
          });
        }).catch((err: ApiError) => {
          setPreloaderShow(false);
        });
      }
    }

    if(!needPlaceholder) {
      delete this.messageInput.dataset.inlinePlaceholder;
    }

    if(foundHelper !== this.inlineHelper) {
      setPreloaderShow(false);
    }

    return foundHelper;
  }

  private setRecording(value: boolean) {
    if(this.recording === value) {
      return;
    }

    this.recording = value;
    this.starsState.set({isRecording: value});
    this.setShrinking(this.recording, ['is-recording']);
    this.updateSendBtn();
    this.onRecording?.(value);
  }

  public setShrinking(value?: boolean, classNames?: string[]) {
    value ||= this.recording;
    SetTransition({
      element: this.chatInput,
      className: 'is-shrinking' + (classNames ? ' ' + classNames.join(' ') : ''),
      forwards: value,
      duration: 200
    });
  }

  public setCanForwardStory(value: boolean) {
    // * true, because forward button will be hidden if it's a private story
    // * this is to correctly animate the button on changing story
    this.canForwardStory = value || true;
    this.updateSendBtn();
  }

  public async showSlowModeTooltipIfNeeded({
    container,
    element,
    sendingFew,
    textOverflow
  }: {
    container?: HTMLElement,
    element?: HTMLElement,
    sendingFew?: boolean,
    textOverflow?: boolean
  } = {}) {
    const {peerId} = this.chat;
    if(peerId.isUser()) {
      return false;
    }

    const chatId = peerId.toChatId();
    const chat = apiManagerProxy.getChat(chatId) as MTChat.channel;

    if(!chat.pFlags.slowmode_enabled) {
      return false;
    }

    let textElement: HTMLElement, onClose: () => void;
    if(textOverflow) {
      textElement = i18n('SlowmodeSendErrorTooLong');
    } else if(sendingFew) {
      textElement = i18n('SlowmodeSendError');
    } else if(await this.managers.appMessagesManager.hasOutgoingMessage(peerId)) {
      textElement = i18n('SlowmodeSendError');
    } else {
      const chatFull = await this.managers.appProfileManager.getChatFull(chatId) as ChatFull.channelFull;

      const getLeftDuration = () => Math.max(0, (chatFull.slowmode_next_send_date || 0) - tsNow(true));
      if(!getLeftDuration()) {
        return false;
      }

      const s = document.createElement('span');
      onClose = eachSecond(() => {
        const leftDuration = getLeftDuration();
        s.replaceChildren(wrapSlowModeLeftDuration(leftDuration));

        if(!leftDuration) {
          close();
        }
      }, true);

      textElement = i18n('SlowModeHint', [s]);
    }

    const {close} = showTooltip({
      element: element || this.btnSendContainer,
      vertical: 'top',
      container: container || this.btnSendContainer.parentElement,
      textElement,
      onClose: () => {
        onClose?.();
        this.emoticonsDropdown.setIgnoreMouseOut('tooltip', false);
      },
      auto: true
    });

    this.emoticonsDropdown.setIgnoreMouseOut('tooltip', true);

    return true;
  }

  private onBtnSendClick = async(e: Event) => {
    cancelEvent(e);

    const isInputEmpty = this.isInputEmpty();
    if(this.chat.type === ChatType.Stories && isInputEmpty && !this.freezedFocused && this.canForwardStory) {
      this.forwardStoryCallback?.(e as MouseEvent);
      return;
    } else if(!this.recorder || this.recording || !isInputEmpty || this.forwarding || this.editMsgId || this.suggestedPost?.hasMedia) {
      if(this.recording) {
        if((Date.now() - this.recordStartTime) < RECORD_MIN_TIME) {
          this.onCancelRecordClick();
        } else {
          this.recorder.stop();
        }
      } else {
        this.sendMessage();
      }
    } else {
      const isAnyChat = this.chat.peerId.isAnyChat();
      const flag: ChatRights = 'send_voices';
      if(isAnyChat && !(await this.chat.canSend(flag))) {
        toastNew({langPackKey: POSTING_NOT_ALLOWED_MAP[flag]});
        return;
      }

      if(await this.showSlowModeTooltipIfNeeded()) {
        return;
      }

      this.chatInput.classList.add('is-locked');
      blurActiveElement();

      let restricted = false;
      if(!isAnyChat) {
        const userFull = await this.managers.appProfileManager.getProfile(this.chat.peerId.toUserId());
        if(userFull?.pFlags.voice_messages_forbidden) {
          toastNew({
            langPackKey: 'Chat.SendVoice.PrivacyError',
            langPackArguments: [await wrapPeerTitle({peerId: this.chat.peerId})]
          });
          restricted = true;
        }
      }

      if(restricted) {
        this.chatInput.classList.remove('is-locked');
        return;
      }

      this.recorder.start().then(() => {
        this.releaseMediaPlayback = appMediaPlaybackController.setSingleMedia();
        this.recordCanceled = false;

        this.setRecording(true);
        opusDecodeController.setKeepAlive(true);

        const showDiscardPopup = () => {
          PopupElement.createPopup(PopupPeer, 'popup-cancel-record', {
            titleLangKey: 'DiscardVoiceMessageTitle',
            descriptionLangKey: 'DiscardVoiceMessageDescription',
            buttons: [{
              langKey: 'DiscardVoiceMessageAction',
              callback: () => {
                simulateClickEvent(this.btnCancelRecord);
              }
            }, {
              langKey: 'Continue',
              isCancel: true
            }]
          }).show();
        };

        this.recordingOverlayListener = this.listenerSetter.add(document.body)('mousedown', (e) => {
          if(!findUpClassName(e.target, CLASS_NAME) && !findUpClassName(e.target, 'popup-cancel-record')) {
            cancelEvent(e);
            showDiscardPopup();
          }
        }, {capture: true, passive: false}) as any;

        appNavigationController.pushItem(this.recordingNavigationItem = {
          type: 'voice',
          onPop: () => {
            setTimeout(() => {
              showDiscardPopup();
            }, 0);

            return false;
          }
        });

        this.recordStartTime = Date.now();

        const sourceNode: MediaStreamAudioSourceNode = this.recorder.sourceNode;
        const context = sourceNode.context;

        const analyser = context.createAnalyser();
        sourceNode.connect(analyser);
        // analyser.connect(context.destination);
        analyser.fftSize = 32;

        const frequencyData = new Uint8Array(analyser.frequencyBinCount);
        const max = frequencyData.length * 255;
        const min = 54 / 150;
        const r = () => {
          if(!this.recording) return;

          analyser.getByteFrequencyData(frequencyData);

          let sum = 0;
          frequencyData.forEach((value) => {
            sum += value;
          });

          const percents = Math.min(1, (sum / max) + min);
          // console.log('frequencyData', frequencyData, percents);

          this.recordRippleEl.style.transform = `scale(${percents})`;
          // this.recordRippleEl.style.transform = `scale(0.8)`;

          const diff = Date.now() - this.recordStartTime;
          const ms = diff % 1000;

          const formatted = toHHMMSS(diff / 1000) + ',' + ('00' + Math.round(ms / 10)).slice(-2);

          this.recordTimeEl.textContent = formatted;

          fastRaf(r);
        };

        r();
      }).catch((e: Error) => {
        switch(e.name as string) {
          case 'NotAllowedError': {
            toast('Please allow access to your microphone');
            break;
          }

          case 'NotReadableError': {
            toast(e.message);
            break;
          }

          default:
            console.error('Recorder start error:', e, e.name, e.message);
            toast(e.message);
            break;
        }

        this.setRecording(false);
        this.chatInput.classList.remove('is-locked');
      });
    }
  };

  public onHelperCancel = async(e?: Event, force?: boolean) => {
    if(e) {
      cancelEvent(e);
    }

    if(this.willSendWebPage) {
      const lastUrl = this.lastUrl;
      let needReturn = false;
      if(this.helperType) {
        // if(this.helperFunc) {
        await this.helperFunc();
        // }

        needReturn = true;
      }

      // * restore values
      this.lastUrl = lastUrl;
      this.noWebPage = true;
      this.willSendWebPage = null;

      if(needReturn) return;
    }

    if(this.helperType === 'edit' && !force) {
      const message = this.editMessage;
      const draft = this.getCurrentInputAsDraft(true);
      if(draft) {
        delete draft.pFlags.no_webpage;
      }

      const replyTo = message.reply_to?._ === 'messageReplyHeader' ? message.reply_to : undefined;
      const messageMedia = message?.media?._ === 'messageMediaWebPage' ? message.media : undefined;
      const hasLargeMedia = (messageMedia?.webpage as WebPage.webPage)?.pFlags?.has_large_media;
      const originalDraft: DraftMessage.draftMessage = {
        _: 'draftMessage',
        date: draft?.date,
        message: message.message,
        entities: message.entities,
        pFlags: {
          invert_media: message.pFlags.invert_media
        },
        media: messageMedia && {
          _: 'inputMediaWebPage',
          pFlags: {
            force_large_media: hasLargeMedia && messageMedia.pFlags.force_large_media || undefined,
            force_small_media: hasLargeMedia && messageMedia.pFlags.force_small_media || undefined,
            optional: true
          },
          url: (messageMedia.webpage as WebPage.webPage).url
        },
        reply_to: replyTo && {
          _: 'inputReplyToMessage',
          reply_to_msg_id: replyTo.reply_to_msg_id
        }
      };

      if(originalDraft.entities?.length || draft?.entities?.length) {
        const canPassEntitiesTypes = new Set(Object.values(MARKDOWN_ENTITIES));
        canPassEntitiesTypes.add('messageEntityCustomEmoji');

        if(originalDraft?.entities) {
          originalDraft.entities = originalDraft.entities.slice();
        }

        [originalDraft, draft].forEach((draft) => {
          if(!draft?.entities) {
            return;
          }

          forEachReverse(draft.entities, (entity, idx, arr) => {
            if(!canPassEntitiesTypes.has(entity._)) {
              arr.splice(idx, 1);
            }
          });

          if(!draft.entities.length) {
            delete draft.entities;
          }
        });
      }

      if(!draftsAreEqual(draft, originalDraft)) {
        PopupElement.createPopup(PopupPeer, 'discard-editing', {
          buttons: [{
            langKey: 'Alert.Confirm.Discard',
            callback: () => {
              this.onHelperCancel(undefined, true);
            }
          }],
          descriptionLangKey: 'Chat.Edit.Cancel.Text'
        }).show();

        return;
      }
    } else if(this.helperType === 'reply') {
      this.saveDraftDebounced();
    }

    this.clearHelper();
    this.updateSendBtn();
  };

  private onHelperClick = (e?: Event) => {
    e && cancelEvent(e);

    if(e && !findUpClassName(e.target, 'reply')) return;
    let possibleBtnMenuContainer: HTMLElement;
    if(this.helperType === 'forward') {
      possibleBtnMenuContainer = this.forwardElements?.container;
    } else if(this.helperType === 'reply') {
      this.chat.setMessageId({lastMsgId: this.replyToMsgId});
      possibleBtnMenuContainer = this.replyElements?.menuContainer;
    } else if(this.helperType === 'edit') {
      this.chat.setMessageId({lastMsgId: this.editMsgId});
    } else if(this.helperType === 'suggested') {
      this.openSuggestPostPopup(this.suggestedPost);
    } else if(!this.helperType) {
      possibleBtnMenuContainer = this.webPageElements?.container;
    }

    if(IS_TOUCH_SUPPORTED && possibleBtnMenuContainer && !possibleBtnMenuContainer.classList.contains('active')) {
      contextMenuController.openBtnMenu(possibleBtnMenuContainer);
    }
  };

  private changeForwardRecipient() {
    if(this.helperWaitingForward || !this.helperFunc) return;
    this.helperWaitingForward = true;

    const forwarding = copy(this.forwarding);
    const helperFunc = this.helperFunc;
    this.clearHelper();
    this.updateSendBtn();
    let selected = false;
    const popup = PopupElement.createPopup(
      PopupForward,
      forwarding,
      () => {
        selected = true;
      }
    );

    popup.addEventListener('close', () => {
      this.helperWaitingForward = false;

      if(!selected) {
        helperFunc();
      }
    });
  }

  private async changeReplyRecipient() {
    if(this.helperWaitingReply) return;
    this.helperWaitingReply = true;

    const replyTo = this.getReplyTo();
    replyTo.replyToPeerId ??= this.chat.peerId;
    const helperFunc = this.helperFunc;
    this.clearHelper();
    this.updateSendBtn();

    try {
      await this.createReplyPicker(replyTo);
    } catch(err) {
      helperFunc();
    }

    this.helperWaitingReply = false;
  }

  public async createReplyPicker(replyTo: ChatInputReplyTo) {
    const {peerId, threadId, monoforumThreadId} = await PopupPickUser.createReplyPicker(this.chat.isMonoforum ? {excludeMonoforums: true} : undefined);
    this.appImManager.setInnerPeer({peerId, threadId, monoforumThreadId}).then(() => {
      replyTo.replyToMonoforumPeerId = monoforumThreadId;
      this.appImManager.chat.input.initMessageReply(replyTo);
    });
  }

  public getReplyTo(): ChatInputReplyTo {
    if(!this.replyToMsgId && !this.replyToStoryId) {
      return;
    }

    const {replyToMsgId, replyToStoryId, replyToQuote, replyToPeerId, replyToMonoforumPeerId} = this;
    return {replyToMsgId, replyToStoryId, replyToQuote, replyToPeerId, replyToMonoforumPeerId};
  }

  public async clearInput(canSetDraft = true, fireEvent = true, clearValue = '') {
    if(document.activeElement === this.messageInput && IS_MOBILE_SAFARI) { // fix first char uppercase
      const i = document.createElement('input');
      document.body.append(i);
      fixSafariStickyInput(i);
      this.messageInputField.setValueSilently(clearValue);
      fixSafariStickyInput(this.messageInput);
      i.remove();
    } else {
      this.messageInputField.setValueSilently(clearValue);
    }

    if(IS_TOUCH_SUPPORTED) {
      // this.messageInput.innerText = '';
    } else {
      // this.attachMessageInputField();
      // this.messageInput.innerText = '';

      clearMarkdownExecutions(this.messageInput);
    }

    this.setEffect();

    let set = false;
    if(canSetDraft) {
      set = await this.setDraft(undefined, false);
    }

    if(!set && fireEvent) {
      this.onMessageInput();
    }
  }

  public isInputEmpty() {
    return isInputEmpty(this.messageInput);
  }

  public updateSendBtn() {
    let icon: ChatSendBtnIcon;

    const isInputEmpty = this.isInputEmpty();

    if(this.chat.type === ChatType.Stories && isInputEmpty && !this.freezedFocused && this.canForwardStory) icon = 'forward';
    else if(this.editMsgId) icon = 'edit';
    else if(!this.recorder || this.recording || !isInputEmpty || this.forwarding || this.suggestedPost?.hasMedia) icon = this.chat.type === ChatType.Scheduled ? 'schedule' : 'send';
    else icon = 'record';

    ['send', 'record', 'edit', 'schedule', 'forward'].forEach((i) => {
      this.btnSend.classList.toggle(i, icon === i);
    });

    this.starsState.set({
      hasSendButton: icon === 'send',
      forwarding: accumulate(Object.values(this.forwarding || {}).map(messages => messages.length), 0)
    });

    if(this.btnScheduled) {
      this.btnScheduled.classList.toggle('show', isInputEmpty && this.chat.type !== ChatType.Scheduled);
    }

    if(this.btnToggleReplyMarkup) {
      this.btnToggleReplyMarkup.classList.toggle('show', isInputEmpty && this.chat.type !== ChatType.Scheduled);
    }

    this.onUpdateSendBtn?.(icon);
  }

  private async addStarsBadge() {
    const starsBadge = this.starsBadge = document.createElement('span');
    starsBadge.classList.add('btn-send-stars-badge', 'stars-badge-base');

    const starsBadgeStars = this.starsBadgeStars = document.createElement('span');

    starsBadge.append(
      Icon('star', 'stars-badge-base__icon'),
      starsBadgeStars
    );

    this.btnSendContainer.append(starsBadge);

    this.starsState.set({inited: true});
  }

  public async setStarsAmount(starsAmount: number | undefined) {
    this.starsState.set({starsAmount});

    // TODO: review this `|| true` WTF?
    const params = await this.getPlaceholderParams(await this.chat?.canSend('send_plain') || true);
    this.updateMessageInputPlaceholder(params);
  }

  private createStarsState = () => createRoot((dispose) => {
    this.getMiddleware()?.onDestroy(() => void dispose());

    const [store, set] = createStore({
      inited: false,
      inputStarsCountEl: null as null | HTMLElement,

      hasSendButton: false,
      isRecording: false,
      messageCount: 0,
      forwarding: 0,
      starsAmount: 0
    });

    const canSend = createMemo(() => store.hasSendButton && !!store.starsAmount);
    const hasSomethingToSend = createMemo(() => !!store.messageCount || !!store.forwarding || store.isRecording);

    const isVisible = createMemo(() => canSend() && hasSomethingToSend());

    const totalStarsAmount = createMemo(() => store.starsAmount * Math.max(1, store.forwarding + store.messageCount));
    const forwardedMessagesStarsAmount = createMemo(() => store.starsAmount /* * Math.max(1, store.forwarding) */);

    createEffect(() => {
      if(!store.inited) return;
      this.starsBadge.classList.toggle('btn-send-stars-badge--active', isVisible());
    });

    createEffect(() => {
      if(!store.inited) return;
      this.starsBadgeStars.innerText = numberThousandSplitterForStars(totalStarsAmount());
    });

    createEffect(() => {
      if(!store.inited || !store.inputStarsCountEl || !forwardedMessagesStarsAmount()) return;

      store.inputStarsCountEl.textContent = numberThousandSplitterForStars(forwardedMessagesStarsAmount());
    });

    return {store, set};
  });

  private createDirectMessagesHandler = () => createRoot((dispose) => {
    this.getMiddleware()?.onDestroy(() => void dispose());

    const [store, set] = createStore({
      isMonoforumAllChats: false,
      isReplying: false,
      isSuggestingUneditablePostChange: false
    });

    createEffect(() => {
      if(!store.isMonoforumAllChats) return;

      this.getPlaceholderParams().then(params => this.updateMessageInputPlaceholder(params));

      if(store.isReplying) return;

      this.messageInputField?.input?.classList.add('hide')
      this.attachMenu?.classList.add('hide');
      this.messageInputField?.setHidden(true);
      this.btnToggleEmoticons?.setAttribute('disabled', '');
      this.autocompleteHelperController.hideOtherHelpers();
      this.btnSend?.setAttribute('disabled', '');
      this.btnSend?.classList.add('disabled');

      onCleanup(() => {
        this.messageInputField?.input?.classList.remove('hide');
        this.attachMenu?.classList.remove('hide');
        this.messageInputField?.setHidden(false);
        this.btnToggleEmoticons?.removeAttribute('disabled');
        this.btnSend?.removeAttribute('disabled');
        this.btnSend?.classList.remove('disabled');
      });
    });

    createEffect(() => {
      this.getPlaceholderParams().then(params => this.updateMessageInputPlaceholder(params));

      if(!store.isSuggestingUneditablePostChange) return;

      this.messageInputField?.input?.classList.add('hide')
      this.messageInputField?.setHidden(true);
      this.btnToggleEmoticons?.setAttribute('disabled', '');
      this.autocompleteHelperController.hideOtherHelpers();

      onCleanup(() => {
        this.messageInputField?.input?.classList.remove('hide');
        this.messageInputField?.setHidden(false);
        this.btnToggleEmoticons?.removeAttribute('disabled');
      });
    });

    const canPaste = () => !store.isMonoforumAllChats || store.isReplying;

    return {store, set, canPaste};
  });

  private throttledSetMessageCountToBadgeState = asyncThrottle(async(value: string) => {
    if(!value?.trim()) {
      this.starsState.set({messageCount: 0});
      return;
    }

    const config = await this.managers.apiManager.getConfig();
    const splitted = splitStringByLength(value, config.message_length_max);

    this.starsState.set({messageCount: splitted.length});
  }, 120);

  private getValueAndEntities(input: HTMLElement) {
    const {entities: apiEntities, value} = getRichValueWithCaret(input, true, false);
    const myEntities = parseEntities(value);
    const totalEntities = mergeEntities(apiEntities, myEntities);

    return {value, totalEntities};
  }

  public canPaste() {
    return this.directMessagesHandler.canPaste();
  }

  public onMessageSent(clearInput = true, clearReply?: boolean) {
    if(!PEER_EXCEPTIONS.has(this.chat.type)) {
      this.managers.appMessagesManager.readAllHistory(this.chat.peerId, this.chat.threadId, true);
    }

    this.scheduleDate = undefined;
    this.sendSilent = undefined;

    const {totalEntities} = this.getValueAndEntities(this.messageInput);
    let nextOffset = 0;
    const emojiEntities: (MessageEntity.messageEntityEmoji | MessageEntity.messageEntityCustomEmoji)[] = totalEntities.filter((entity) => {
      if(entity._ === 'messageEntityEmoji' || entity._ === 'messageEntityCustomEmoji') {
        const endOffset = entity.offset + entity.length;
        return endOffset <= nextOffset ? false : (nextOffset = endOffset, true);
      }

      return false;
    }) as any;
    emojiEntities.forEach((entity) => {
      const emoji: AppEmoji = entity._ === 'messageEntityEmoji' ? {emoji: emojiFromCodePoints(entity.unicode)} : {docId: entity.document_id, emoji: ''};
      this.managers.appEmojiManager.pushRecentEmoji(emoji);
    });

    if(clearInput) {
      this.lastUrl = '';
      delete this.noWebPage;
      this.willSendWebPage = null;
      this.clearInput();
    }

    if(clearReply || clearInput) {
      this.clearHelper();
    }

    this.updateSendBtn();
    this.onMessageSent2?.();
  }

  public async sendMessage(force = false) {
    const {editMsgId, chat} = this;
    if(chat.type === ChatType.Scheduled && !force && !editMsgId) {
      this.scheduleSending();
      return;
    }

    const {peerId} = chat;
    const {noWebPage} = this;
    const sendingParams = this.chat.getMessageSendingParams();

    const {value, entities} = getRichValueWithCaret(this.messageInputField.input, true, false);
    const trimmedValue = value.trim();

    let messageCount = 0;
    if(chat.type !== ChatType.Scheduled && !editMsgId) {
      if(this.forwarding) {
        for(const fromPeerId in this.forwarding) {
          messageCount += this.forwarding[fromPeerId].length;
        }
      }

      const config = await this.managers.apiManager.getConfig();
      const MAX_LENGTH = config.message_length_max;
      const textOverflow = value.length > MAX_LENGTH;

      messageCount += trimmedValue ?
        splitStringByLength(value, MAX_LENGTH).length :
        0;

      if(await this.showSlowModeTooltipIfNeeded({
        sendingFew: messageCount > 1,
        textOverflow
      })) {
        return;
      }
    }

    const preparedPaymentResult = !editMsgId && messageCount ?
      await this.paidMessageInterceptor.prepareStarsForPayment(messageCount) :
      undefined;

    if(preparedPaymentResult === PAYMENT_REJECTED) return;

    sendingParams.confirmedPaymentResult = preparedPaymentResult;

    if(editMsgId) {
      const message = this.editMessage;
      if(trimmedValue || message.media) {
        this.managers.appMessagesManager.editMessage(
          message,
          value,
          {
            entities,
            noWebPage,
            webPage: this.getWebPagePromise ? undefined : this.willSendWebPage,
            webPageOptions: this.webPageOptions,
            invertMedia: this.willSendWebPage ? this.invertMedia : undefined
          }
        );

        this.onMessageSent();
      } else {
        PopupElement.createPopup(PopupDeleteMessages, peerId, [editMsgId], chat.type);

        return;
      }
    } else if(trimmedValue || this.suggestedPost?.hasMedia) {
      this.managers.appMessagesManager.sendText({
        ...sendingParams,
        text: value,
        entities,
        noWebPage,
        webPage: this.getWebPagePromise ? undefined : this.willSendWebPage,
        webPageOptions: this.webPageOptions,
        invertMedia: this.willSendWebPage ? this.invertMedia : undefined,
        clearDraft: true
      });

      if(PEER_EXCEPTIONS.has(this.chat.type)) {
        this.onMessageSent(true);
      } else {
        this.onMessageSent(false, false);
      }
      if(this.suggestedPost) this.clearHelper();
      // this.onMessageSent();
    }

    // * wait for sendText set messageId for invokeAfterMsg
    if(this.forwarding) {
      const forwarding = copy(this.forwarding);
      // setTimeout(() => {
      for(const fromPeerId in forwarding) {
        this.managers.appMessagesManager.forwardMessages({
          ...sendingParams,
          fromPeerId: fromPeerId.toPeerId(),
          mids: forwarding[fromPeerId],
          dropAuthor: this.forwardElements && this.forwardElements.hideSender.checkboxField.checked,
          dropCaptions: this.isDroppingCaptions()
        }).catch(async(err: ApiError) => {
          if(err.type === 'VOICE_MESSAGES_FORBIDDEN') {
            toastNew({
              langPackKey: 'Chat.SendVoice.PrivacyError',
              langPackArguments: [await wrapPeerTitle({peerId})]
            });
          }
        });
      }

      if(!value) {
        this.onMessageSent();
      }
      // }, 0);
    }

    // this.onMessageSent();
  }


  public async sendMessageWithDocument({
    document,
    force = false,
    clearDraft = false,
    silent = false,
    target,
    ignoreNoPremium
  }: {
    document: MyDocument | DocId,
    force?: boolean,
    clearDraft?: boolean,
    silent?: boolean,
    target?: HTMLElement,
    ignoreNoPremium?: boolean
  }) {
    document = await this.managers.appDocsManager.getDoc(document);

    const flag = document.type === 'sticker' ? 'send_stickers' : (document.type === 'gif' ? 'send_gifs' : 'send_media');
    if(this.chat.peerId.isAnyChat() && !(await this.chat.canSend(flag))) {
      toastNew({langPackKey: POSTING_NOT_ALLOWED_MAP[flag]});
      return false;
    }

    if(this.chat.type === ChatType.Scheduled && !force) {
      this.scheduleSending(() => this.sendMessageWithDocument({document, force: true, clearDraft, silent, target}));
      return false;
    }

    if(!document) {
      return false;
    }

    if(document.sticker && getStickerEffectThumb(document) && !rootScope.premium && !ignoreNoPremium) {
      PopupPremium.show({feature: 'premium_stickers'});
      return false;
    }

    if(await this.showSlowModeTooltipIfNeeded({element: target})) {
      return false;
    }

    const sendingParams = this.chat.getMessageSendingParams();

    const preparedPaymentResult = await this.paidMessageInterceptor.prepareStarsForPayment(1);
    if(preparedPaymentResult === PAYMENT_REJECTED) return;

    sendingParams.confirmedPaymentResult = preparedPaymentResult;

    this.managers.appMessagesManager.sendFile({
      ...sendingParams,
      file: document,
      isMedia: true,
      clearDraft,
      silent
    });
    this.onMessageSent(clearDraft, true);

    if(document.type === 'sticker') {
      this.managers.appStickersManager.saveRecentSticker(document.id);
    }

    return true;
  }

  private canToggleHideAuthor() {
    const {forwardElements} = this;
    if(!forwardElements) return false;
    const hideCaptionCheckboxField = forwardElements.hideCaption.checkboxField;
    return !hideCaptionCheckboxField.checked ||
      findUpTag(hideCaptionCheckboxField.label, 'FORM').classList.contains('hide');
  }

  private isDroppingCaptions() {
    return !this.canToggleHideAuthor();
  }

  /* public sendSomething(callback: () => void, force = false) {
    if(this.chat.type === 'scheduled' && !force) {
      this.scheduleSending(() => this.sendSomething(callback, true));
      return false;
    }

    callback();
    this.onMessageSent(false, true);

    return true;
  } */

  public initMessageEditing(mid: number) {
    const message = this.chat.getMessage(mid) as Message.message;

    let input = wrapDraftText(message.message, {entities: message.totalEntities, wrappingForPeerId: this.chat.peerId});
    const f = async() => {
      let restoreInputLock: () => void;
      if(!this.messageInput.isContentEditable) {
        const placeholderParams = await this.getPlaceholderParams(true);
        const {contentEditable} = this.messageInput;
        this.messageInput.contentEditable = 'true';
        const {oldKey, oldArgs} = this.updateMessageInputPlaceholder(placeholderParams);

        restoreInputLock = () => {
          this.messageInput.contentEditable = contentEditable;
          this.updateMessageInputPlaceholder({key: oldKey, args: oldArgs});
        };
      }

      const replyFragment = await wrapMessageForReply({message, usingMids: [message.mid]});
      this.setTopInfo({
        type: 'edit',
        callerFunc: f,
        title: i18n('AccDescrEditing'),
        subtitle: replyFragment,
        input,
        message
      });

      this.editMsgId = mid;
      this.editMessage = message;
      input = undefined;

      this.restoreInputLock = restoreInputLock;
    };
    f();
  }

  public initSuggestPostChange(mid: number) {
    const message = this.chat.getMessage(mid) as Message.message;
    if(!message) return;

    const monoforumThreadId = getPeerId(message.saved_peer_id);
    if(!monoforumThreadId) return;

    const input = wrapDraftText(message.message, {entities: message.totalEntities, wrappingForPeerId: this.chat.peerId});

    const payload: SuggestedPostPayload = {
      stars: message.suggested_post?.price?._ === 'starsAmount' ? +message.suggested_post.price.amount : undefined,
      timestamp: message.suggested_post?.schedule_date && message.suggested_post.schedule_date * 1000 > Date.now() ?
        message.suggested_post.schedule_date :
        undefined,
      changeMid: message.mid,
      hasMedia: !!makeMessageMediaInputForSuggestedPost(message.media), // accept only supported media
      monoforumThreadId
    };

    this.setTopInfo({
      type: 'suggested',
      callerFunc: () => {},
      title: i18n('SuggestedPosts.SuggestChanges'),
      subtitle: this.createSuggestedPostSubtitle(payload),
      input,
      message
    });

    this.suggestedPost = payload;

    const isSuggestingUneditablePostChange = !!(message.media?._ === 'messageMediaDocument' && message.media.document?._ === 'document' && message.media.document.sticker);
    this.directMessagesHandler.set({isSuggestingUneditablePostChange});
    if(isSuggestingUneditablePostChange) {
      this.openSuggestPostPopup(payload);
    }
  }

  public initMessagesForward(fromPeerIdsMids: {[fromPeerId: PeerId]: number[]}) {
    const f = async() => {
      // const peerTitles: string[]
      const fromPeerIds = Object.keys(fromPeerIdsMids).map((fromPeerId) => fromPeerId.toPeerId());
      const smth: Set<string> = new Set();
      let length = 0, messagesWithCaptionsLength = 0;

      const p = fromPeerIds.map(async(fromPeerId) => {
        const mids = fromPeerIdsMids[fromPeerId];
        const promises = mids.map(async(mid) => {
          const message = (await this.managers.appMessagesManager.getMessageByPeer(fromPeerId, mid)) as Message.message;
          if(getFwdFromName(message.fwd_from) && !message.fromId && !message.fwdFromId) {
            smth.add('N' + getFwdFromName(message.fwd_from));
          } else {
            smth.add('P' + message.fromId);
          }

          if(
            message.media &&
            !(['messageMediaWebPage'] as MessageMedia['_'][]).includes(message.media._) &&
            message.message
          ) {
            ++messagesWithCaptionsLength;
          }
        });

        await Promise.all(promises);

        length += mids.length;
      });

      await Promise.all(p);

      const onlyFirstName = smth.size > 2;
      const peerTitles = [...smth].map((smth) => {
        const type = smth[0];
        smth = smth.slice(1);
        if(type === 'P') {
          const peerId = smth.toPeerId();
          return peerId === rootScope.myId ? i18n('Chat.Accessory.Forward.You') : new PeerTitle({peerId, dialog: false, onlyFirstName}).element;
        } else {
          return onlyFirstName ? smth.split(' ')[0] : smth;
        }
      });

      const {forwardElements} = this;
      const form = findUpTag(forwardElements.showCaption.checkboxField.label, 'FORM');
      form.classList.toggle('hide', !messagesWithCaptionsLength);
      const hideCaption = forwardElements.hideCaption.checkboxField.checked;
      if(messagesWithCaptionsLength && hideCaption) {
        forwardElements.hideSender.checkboxField.setValueSilently(true);
      } else if(this.forwardWasDroppingAuthor !== undefined) {
        (this.forwardWasDroppingAuthor ? forwardElements.hideSender : forwardElements.showSender).checkboxField.setValueSilently(true);
      }

      const titleKey: LangPackKey = forwardElements.showSender.checkboxField.checked ? 'Chat.Accessory.Forward' : 'Chat.Accessory.Hidden';
      const title = i18n(titleKey, [length]);

      const senderTitles = document.createDocumentFragment();
      if(peerTitles.length < 3) {
        senderTitles.append(...join(peerTitles, false));
      } else {
        senderTitles.append(peerTitles[0], i18n('AndOther', [peerTitles.length - 1]));
      }

      let firstMessage: Message.message, usingFullGrouped: boolean;
      if(fromPeerIds.length === 1) {
        const fromPeerId = fromPeerIds[0];
        const mids = fromPeerIdsMids[fromPeerId];
        firstMessage = (await this.managers.appMessagesManager.getMessageByPeer(fromPeerId, mids[0])) as Message.message;

        usingFullGrouped = !!firstMessage.grouped_id;
        if(usingFullGrouped) {
          const groupedMids = await this.managers.appMessagesManager.getMidsByMessage(firstMessage);
          if(groupedMids.length !== length || groupedMids.find((mid) => !mids.includes(mid))) {
            usingFullGrouped = false;
          }
        }
      }

      const subtitleFragment = document.createDocumentFragment();
      const delimiter = ': ';
      if(usingFullGrouped || length === 1) {
        const mids = fromPeerIdsMids[fromPeerIds[0]];
        const replyFragment = await wrapMessageForReply({message: firstMessage, usingMids: mids});
        subtitleFragment.append(
          senderTitles,
          delimiter,
          replyFragment
        );
      } else {
        subtitleFragment.append(
          i18n('Chat.Accessory.Forward.From'),
          delimiter,
          senderTitles
        );
      }

      const newReply = this.setTopInfo({
        type: 'forward',
        callerFunc: f,
        title,
        subtitle: subtitleFragment
      });

      forwardElements.modifyArgs.forEach((b, idx) => {
        const text = b.textElement;
        const intl: I18n.IntlElement = I18n.weakMap.get(text) as any;
        intl.args = [idx < 2 ? fromPeerIds.length : messagesWithCaptionsLength];
        intl.update();
      });

      this.setCurrentHover(this.forwardHover, newReply);
      this.forwarding = fromPeerIdsMids;
    };

    f();
  }

  public getChatInputReplyToFromMessage(message: MyMessage, quote?: MessageSendingParams['replyToQuote']) {
    const result: ChatInputReplyTo = {
      replyToMsgId: message?.mid
    };

    if(quote) result.replyToQuote = quote;
    if(
      message?._ === 'message' &&
      message?.saved_peer_id &&
      this.chat.isMonoforum
    ) {
      result.replyToMonoforumPeerId = getPeerId(message.saved_peer_id);
    }

    return result;
  }

  public async initMessageReply(replyTo: ReturnType<ChatInput['getReplyTo']>) {
    if(deepEqual(this.getReplyTo(), replyTo)) {
      return;
    }

    let {replyToMsgId, replyToQuote, replyToPeerId} = replyTo;
    replyToPeerId ??= this.chat.peerId;
    let message = await (
      replyToPeerId ?
        this.managers.appMessagesManager.getMessageByPeer(replyToPeerId, replyToMsgId) :
        this.chat.getMessage(replyToMsgId)
    );
    const f = () => {
      let title: HTMLElement, subtitle: string | HTMLElement;
      if(!message) { // load missing replying message
        title = i18n('Loading');

        this.managers.appMessagesManager.reloadMessages(replyToPeerId, replyToMsgId).then((_message) => {
          if(!deepEqual(this.getReplyTo(), replyTo)) {
            return;
          }

          message = _message;
          if(!message) {
            this.clearHelper('reply');
          } else {
            f();
          }
        });
      } else {
        const peerId = message.fromId;
        title = new PeerTitle({
          peerId: message.fromId,
          dialog: false,
          fromName: !peerId ? getFwdFromName((message as Message.message).fwd_from) : undefined
        }).element;

        title = i18n(replyToQuote ? 'ReplyToQuote' : 'ReplyTo', [title]);
      }

      const newReply = this.setTopInfo({
        type: 'reply',
        callerFunc: f,
        title,
        subtitle,
        message,
        setColorPeerId: message?.fromId,
        quote: message ? replyToQuote : undefined
      });
      this.setReplyTo(replyTo);

      this.replyElements.replyInAnother.element.classList.toggle('hide', !this.chat.bubbles.canForward(message as Message.message));
      this.replyElements.doNotReply.element.classList.toggle('hide', !!replyToQuote);
      this.replyElements.doNotQuote.element.classList.toggle('hide', !replyToQuote);
      this.setCurrentHover(this.replyHover, newReply);
    };
    f();
  }

  private setCurrentHover(dropdownHover?: DropdownHover, newReply?: HTMLElement) {
    if(this.currentHover) {
      this.currentHover.toggle(false);
    }

    this.hoverListenerSetter.removeAll();
    this.currentHover = dropdownHover;
    dropdownHover?.attachButtonListener(newReply, this.listenerSetter);
  }

  public setReplyTo(replyTo: ChatInputReplyTo) {
    const {replyToMsgId, replyToQuote, replyToPeerId, replyToStoryId, replyToMonoforumPeerId} = replyTo || {};
    this.replyToMsgId = replyToMsgId;
    this.replyToStoryId = replyToStoryId;
    this.replyToQuote = replyToQuote;
    this.replyToPeerId = replyToPeerId;
    this.replyToMonoforumPeerId = replyToMonoforumPeerId;
    this.center(true);
  }

  public clearHelper(type?: ChatInputHelperType) {
    if(this.helperType === 'edit' && type !== 'edit') {
      this.clearInput();
    }

    if(type) {
      this.lastUrl = '';
      delete this.noWebPage;
      this.willSendWebPage = null;
    }

    if(type !== 'reply') {
      this.setReplyTo(undefined);
      this.forwarding = undefined;
    }

    if(type !== 'suggested') {
      this.suggestedPost = undefined;
      this.btnSuggestPost.classList.toggle('hide', !this.canShowSuggestPostButton(false))
      this.fileInput.multiple = true;
      this.directMessagesHandler.set({isSuggestingUneditablePostChange: false});
    }

    this.editMsgId = this.editMessage = undefined;
    this.helperType = this.helperFunc = undefined;
    this.setCurrentHover();
    this.saveDraftDebounced();

    if(this.restoreInputLock) {
      this.restoreInputLock();
      this.restoreInputLock = undefined;
    }

    if(this.chat.container && this.chat.container.classList.contains('is-helper-active')) {
      appNavigationController.removeByType('input-helper');
      this.chat.container.classList.remove('is-helper-active');
      this.t();
    }

    if(!type) this.directMessagesHandler.set({isReplying: false});
  }

  private t() {
    const className = 'is-toggling-helper';
    SetTransition({
      element: this.chat.container,
      className,
      forwards: true,
      duration: 150,
      onTransitionEnd: () => {
        this.chat.container.classList.remove(className);
      }
    });
  }

  public setInputValue(
    value: Parameters<InputFieldAnimated['setValueSilently']>[0],
    clear = true,
    focus = true,
    draftMessage?: DraftMessage.draftMessage
  ) {
    value ||= '';

    if(clear) this.clearInput(false, false, value as string);
    else this.messageInputField.setValueSilently(value);

    fastRaf(() => {
      focus && placeCaretAtEnd(this.messageInput);
      this.processingDraftMessage = draftMessage;
      if(draftMessage) this.setEffect(draftMessage.effect);
      this.onMessageInput();
      this.processingDraftMessage = undefined;
      this.messageInput.scrollTop = this.messageInput.scrollHeight;
    });
  }

  public setTopInfo({
    type,
    callerFunc,
    title,
    subtitle,
    setColorPeerId,
    input,
    message,
    quote
  }: {
    type: ChatInputHelperType,
    callerFunc: () => void,
    input?: Parameters<InputFieldAnimated['setValueSilently']>[0],
    message?: any
  } & Pick<Parameters<typeof wrapReply>[0], 'title' | 'subtitle' | 'setColorPeerId' | 'quote'>) {
    if(this.willSendWebPage && type === 'reply') {
      return;
    }

    if(type !== 'webpage') {
      this.clearHelper(type);
      this.helperType = type;
      this.helperFunc = callerFunc;
    }

    if(type === 'suggested') {
      this.fileInput.multiple = false;
    }

    this.btnSuggestPost?.classList.toggle('hide', !this.canShowSuggestPostButton(true));

    const replyParent = this.replyElements.container;
    const oldReply = replyParent.lastElementChild.previousElementSibling;
    const haveReply = oldReply.classList.contains('reply');

    this.replyElements.iconBtn.replaceWith(this.replyElements.iconBtn = this.createButtonIcon((type === 'webpage' ? 'link' : type) + ' reply-icon', {noRipple: true}));
    const {container} = wrapReply({
      title,
      subtitle,
      setColorPeerId,
      animationGroup: this.chat.animationGroup,
      message,
      textColor: 'secondary-text-color',
      quote
    });

    this.appImManager.setPeerColorToElement({peerId: setColorPeerId, element: replyParent});

    if(haveReply) {
      oldReply.replaceWith(container);
    } else {
      replyParent.lastElementChild.before(container);
    }

    if(!this.chat.container.classList.contains('is-helper-active')) {
      this.chat.container.classList.add('is-helper-active');
      this.t();
    }

    if(!IS_MOBILE) {
      appNavigationController.pushItem({
        type: 'input-helper',
        onPop: () => {
          this.onHelperCancel();
        }
      });
    }

    if(input !== undefined) {
      this.setInputValue(input);
    }

    setTimeout(() => {
      this.updateSendBtn();
    }, 0);

    this.directMessagesHandler.set({isReplying: true});

    return container;
  }

  private canShowSuggestPostButton(hasSuggestedHeader?: boolean) {
    const canSuggest = this.chat.isMonoforum && (!!this.chat.monoforumThreadId || !this.chat.canManageDirectMessages);

    return canSuggest && !hasSuggestedHeader;
  }

  public async openSuggestPostPopup(initial?: SuggestedPostPayload) {
    const {default: SuggestPostPopup} = await import('./suggestPostPopup');
    new SuggestPostPopup({HotReloadGuard: SolidJSHotReloadGuardProvider, suggestChange: !!initial?.changeMid, initialStars: initial?.stars, initialTimestamp: initial?.timestamp, onFinish: (payload) => {
      const balance = +useStars()() || 0;
      if(!this.chat.canManageDirectMessages && payload.stars && payload.stars > balance) {
        PopupElement.createPopup(PopupStars);
        return;
      }

      const message = initial?.changeMid ? this.chat.getMessage(initial.changeMid) as Message.message : undefined;

      this.setTopInfo({
        type: 'suggested',
        callerFunc: () => { },
        title: i18n('SuggestedPosts.SuggestAPost'),
        subtitle: this.createSuggestedPostSubtitle(payload),
        message
      });

      this.suggestedPost = {
        ...initial,
        ...payload
      };

      if(this.directMessagesHandler.store.isSuggestingUneditablePostChange) {
        this.sendMessage();
      }
    }}).show();
  }

  private createSuggestedPostSubtitle(payload: SuggestedPostPayload) {
    if(!payload.stars && !payload.timestamp) {
      return payload.changeMid ?
        i18n('SuggestedPosts.SuggestedAPostTopInfoSubtitle.NoConditionsChange') :
        i18n('SuggestedPosts.SuggestedAPostTopInfoSubtitle.NoConditions')
    }

    const element = document.createElement('div');
    element.classList.add('suggested-post-subtitle');

    if(payload.stars) {
      const span = document.createElement('span');
      span.append(i18n('Stars', [numberThousandSplitterForStars(payload.stars)]));
      element.append(span);
    }

    if(payload.timestamp) {
      const span = document.createElement('span');
      span.append(wrapEmojiText('📅'), ' ', formatFullSentTime(payload.timestamp));
      element.append(span);
    }

    return element;
  }
}
