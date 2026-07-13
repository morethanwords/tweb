import type {MyDocument} from '@appManagers/appDocsManager';
import getDocumentInput from '@appManagers/utils/docs/getDocumentInput';
import type {MyDraftMessage} from '@appManagers/appDraftsManager';
import type {AppMessagesManager, MessageSendingParams, MyMessage, SuggestedPostPayload} from '@appManagers/appMessagesManager';
import type Chat from '@components/chat/chat';
import {AppImManager, APP_TABS} from '@lib/appImManager';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import ChatRecording from '@components/chat/recording/chatRecording';
import {ButtonMenuItemOptions, ButtonMenuItemOptionsVerifiable, ButtonMenuSync} from '@components/buttonMenu';
import emoticonsDropdown, {EmoticonsDropdown} from '@components/emoticonsDropdown';
import showForwardPopup from '@components/popups/forward';
import PopupNewMedia, {getCurrentNewMediaPopup} from '@components/popups/newMedia';
import {toast, toastNew} from '@components/toast';
import {MessageEntity, DraftMessage, WebPage, Message, UserFull, AttachMenuPeerType, BotMenuButton, MessageMedia, InputReplyTo, Chat as MTChat, User, ChatFull, Dialog, PhotoSize, Photo, Document, TextWithEntities, GlobalPrivacySettings} from '@layer';
import StickersHelper from '@components/chat/stickersHelper';
import ChatInputPlate from '@components/chat/controlPlate';
import PopupSendGift from '@components/popups/sendGift';
import ButtonIcon from '@components/buttonIcon';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import ListenerSetter from '@helpers/listenerSetter';
import Button, {replaceButtonIcon} from '@components/button';
import showScheduleSendingPopup from '@components/popups/scheduleSendingPopup';
import SendMenu from '@components/chat/sendContextMenu';
import rootScope from '@lib/rootScope';
import PopupPinMessage from '@components/popups/unpinMessage';
import tsNow from '@helpers/tsNow';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {IS_MOBILE, IS_MOBILE_SAFARI} from '@environment/userAgent';
import I18n, {FormatterArguments, i18n, join, LangPackKey} from '@lib/langPack';
import {AttachedMediaType, canUploadAsWhenEditing, generateTail, getMediaTypeForMessage, slowModeTimer} from '@components/chat/utils';
import findUpClassName from '@helpers/dom/findUpClassName';
import ButtonCorner from '@components/buttonCorner';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import cancelEvent from '@helpers/dom/cancelEvent';
import cancelSelection from '@helpers/dom/cancelSelection';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import isInputEmpty from '@helpers/dom/isInputEmpty';
import isSendShortcutPressed from '@helpers/dom/isSendShortcutPressed';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import classifyInputKeyup from '@helpers/dom/classifyInputKeyup';
import isPlausibleEmojiQuery from '@components/chat/isPlausibleEmojiQuery';
import EmojiHelper from '@components/chat/emojiHelper';
import CommandsHelper from '@components/chat/commandsHelper';
import QuickRepliesHelper from '@components/chat/quickRepliesHelper';
import AutocompleteHelperController from '@components/chat/autocompleteHelperController';
import AutocompleteHelper from '@components/chat/autocompleteHelper';
import MentionsHelper from '@components/chat/mentionsHelper';
import fixSafariStickyInput from '@helpers/dom/fixSafariStickyInput';
import ReplyKeyboard from '@components/chat/replyKeyboard';
import InlineHelper from '@components/chat/inlineHelper';
import debounce, {DebounceReturnType} from '@helpers/schedulers/debounce';
import {putPreloader} from '@components/putPreloader';
import SetTransition from '@components/singleTransition';
import PeerTitle from '@components/peerTitle';
import {fastRaf} from '@helpers/schedulers';
import PopupDeleteMessages from '@components/popups/deleteMessages';
import fixSafariStickyInputFocusing, {IS_STICKY_INPUT_BUGGED} from '@helpers/dom/fixSafariStickyInputFocusing';
import PopupPeer from '@components/popups/peer';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import {BOT_START_PARAM, GENERAL_TOPIC_ID, HIDDEN_PEER_ID, NULL_PEER_ID, REPLIES_PEER_ID, SEND_PAID_WITH_STARS_DELAY, SEND_WHEN_ONLINE_TIMESTAMP, SERVICE_PEER_ID} from '@appManagers/constants';
import setCaretAt from '@helpers/dom/setCaretAt';
import DropdownHover from '@helpers/dropdownHover';
import {positionMenuTrigger} from '@helpers/positionMenu';
import {getAppWindow, getOverlayRoot} from '@helpers/appWindow';
import findUpTag from '@helpers/dom/findUpTag';
import toggleDisability from '@helpers/dom/toggleDisability';
import callbackify from '@helpers/callbackify';
import ChatBotCommands from '@components/chat/botCommands';
import copy from '@helpers/object/copy';
import documentFragmentToHTML from '@helpers/dom/documentFragmentToHTML';
import PopupElement from '@components/popups';
import getEmojiEntityFromEmoji from '@lib/richTextProcessor/getEmojiEntityFromEmoji';
import mergeEntities from '@lib/richTextProcessor/mergeEntities';
import parseEntities from '@lib/richTextProcessor/parseEntities';
import parseMarkdown from '@lib/richTextProcessor/parseMarkdown';
import wrapDraftText from '@lib/richTextProcessor/wrapDraftText';
import wrapDraft from '@components/wrappers/draft';
import wrapMessageForReply from '@components/wrappers/messageForReply';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {AppManagers} from '@lib/managers';
import contextMenuController from '@helpers/contextMenuController';
import {emojiFromCodePoints} from '@vendor/emoji';
import {modifyAckedPromise} from '@helpers/modifyAckedResult';
import ChatSendAs from '@components/chat/sendAs';
import filterAsync from '@helpers/array/filterAsync';
import InputFieldAnimated from '@components/inputFieldAnimated';
import getStickerEffectThumb from '@appManagers/utils/stickers/getStickerEffectThumb';
import {STICKERS_POPUP_KIND} from '@components/popups/stickers';
import PopupElementTsx from '@components/popups/indexTsx';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import wrapReply from '@components/wrappers/reply';
import {getEmojiFromElement} from '@components/emoticonsDropdown/tabs/emoji';
import RichInputHandler from '@helpers/dom/richInputHandler';
import {insertRichTextAsHTML} from '@components/inputField';
import draftsAreEqual from '@appManagers/utils/drafts/draftsAreEqual';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import getAttachMenuBotIcon from '@appManagers/utils/attachMenuBots/getAttachMenuBotIcon';
import forEachReverse from '@helpers/array/forEachReverse';
import {MARKDOWN_ENTITIES} from '@lib/richTextProcessor';
import IMAGE_MIME_TYPES_SUPPORTED from '@environment/imageMimeTypesSupport';
import VIDEO_MIME_TYPES_SUPPORTED from '@environment/videoMimeTypesSupport';
import {ChatRights} from '@appManagers/appChatsManager';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import replaceContent from '@helpers/dom/replaceContent';
import getTextWidth from '@helpers/canvas/getTextWidth';
import {FontFull} from '@config/font';
import {ChatType} from './chatType';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import idleController from '@helpers/idleController';
import Icon from '@components/icon';
import setBadgeContent from '@helpers/setBadgeContent';
import createBadge from '@helpers/createBadge';
import deepEqual from '@helpers/object/deepEqual';
import {clearMarkdownExecutions, createMarkdownCache, handleMarkdownShortcut, maybeClearUndoHistory, processCurrentFormatting} from '@helpers/dom/markdown';
import MarkupTooltip from '@components/chat/markupTooltip';
import PopupPremium from '@components/popups/premium';
import {showReplyPickerPopup} from '@components/popups/pickUser';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {isSavedDialog} from '@appManagers/utils/dialogs/isDialog';
import getFwdFromName from '@appManagers/utils/messages/getFwdFromName';
import apiManagerProxy from '@lib/apiManagerProxy';
import eachSecond from '@helpers/eachSecond';
import {wrapSlowModeLeftDuration} from '@components/wrappers/wrapDuration';
import showTooltip from '@components/tooltip';
import createContextMenu from '@helpers/dom/createContextMenu';
import {Accessor, createEffect, createMemo, createRoot, createSignal, on, onCleanup, Setter} from 'solid-js';
import {createStore} from 'solid-js/store';
import SelectedEffect from '@components/chat/selectedEffect';
import windowSize from '@helpers/windowSize';
import mediaSizes from '@helpers/mediaSizes';
import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import accumulate from '@helpers/array/accumulate';
import splitStringByLength from '@helpers/string/splitStringByLength';
import PaidMessagesInterceptor, {PAYMENT_REJECTED} from '@components/chat/paidMessagesInterceptor';
import asyncThrottle from '@helpers/schedulers/asyncThrottle';
import focusInput from '@helpers/dom/focusInput';
import showChecklistPopup from '@components/popups/checklist';
import showQuickRepliesPickerPopup from '@components/popups/quickRepliesPicker';
import assumeType from '@helpers/assumeType';
import {formatFullSentTime} from '@helpers/date';
import useStars from '@stores/stars';
import PopupStars from '@components/popups/stars';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {makeMessageMediaInputForSuggestedPost} from '@appManagers/utils/messages/makeMessageMediaInput';
import showFrozenPopup from '@components/popups/frozen';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {setPeerColorToElement} from '@components/peerColors';
import getMainGroupedMessage from '@lib/appManagers/utils/messages/getMainGroupedMessage';
import appDownloadManager, {DownloadBlob} from '@lib/appDownloadManager';
import {MediaEditorProps} from '@components/mediaEditor/mediaEditor';
import {NumberPair} from '@components/mediaEditor/types';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import AttachMenuButton from './attachMenuButton';
import pause from '@helpers/schedulers/pause';
import onMediaLoad from '@helpers/onMediaLoad';
import createVideo from '@helpers/dom/createVideo';
import {MAX_EDITABLE_VIDEO_SIZE} from '@components/mediaEditor/support';
import getDocumentDownloadOptions from '@lib/appManagers/utils/docs/getDocumentDownloadOptions';
import getPhotoDownloadOptions from '@lib/appManagers/utils/photos/getPhotoDownloadOptions';
import {getFileNameByLocation} from '@helpers/fileName';
import {Middleware, getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import {createAutoDeleteIcon} from '@components/autoDeleteIcon';
import compareUint8Arrays from '@helpers/bytes/compareUint8Arrays';
import {LocalTextWithOptionalEntities} from '@types';
import createChatInputState, {ChatInputState} from './inputState';
import {SupportedMediaType} from '@components/popups/createPoll/storeContext';
import {runWithHotReloadGuard} from '@lib/solidjs/runWithHotReloadGuard';

const HOT_CHAT_INPUTS = import.meta.hot ? [] as ChatInput[] : null;

if(import.meta.hot) {
  import.meta.hot.accept('./inputState', (newModule) => {
    if(!newModule) return;
    const create = (newModule as unknown as typeof import('./inputState')).default;
    HOT_CHAT_INPUTS!.forEach((input) => input.reloadInputState(create));
  });
}


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

type ChatSendBtnIcon = 'send' | 'record' | 'record-video' | 'edit' | 'schedule' | 'forward';
export type ChatInputReplyTo = Pick<MessageSendingParams, 'replyToMsgId' | 'replyToQuote' | 'replyToPollOption' | 'replyToStoryId' | 'replyToPeerId' | 'replyToMonoforumPeerId'>;

const CLASS_NAME = 'chat-input';
const PEER_EXCEPTIONS = new Set<ChatType>([ChatType.Scheduled, ChatType.Stories, ChatType.Saved]);

type WatchDownloadProgressArgs<T> = {
  getDownloadPromise: () => DownloadBlob;
  getResult: () => Promise<T>;
  middleware: Middleware;
  cancel: () => void;
};

export default class ChatInput {
  readonly Class = ChatInput;
  // private static AUTO_COMPLETE_REG_EXP = /(\s|^)((?::|.)(?!.*[:@]).*|(?:[@\/]\S*))$/;
  private static AUTO_COMPLETE_REG_EXP = /(\s|^)((?:(?:@|^\/)\S*)|(?::|^[^:@\/])(?!.*[:@\/]).*)$/;
  public messageInput: HTMLElement;
  public messageInputField: InputFieldAnimated;
  private inputHeightDelta = 0;
  private helperVisible = false;
  /** @internal — used by ChatInput input state */
  public fileInput: HTMLInputElement;
  /** @internal — used by ChatInput input state */
  public inputMessageContainer: HTMLDivElement;
  /** @internal — used by ChatRecording */
  public btnSend: HTMLButtonElement;
  public btnCancelRecord: HTMLButtonElement;
  public btnReaction: HTMLButtonElement;
  public lastUrl = '';
  private lastTimeType = 0;
  public noRipple: boolean;

  public chatInput: HTMLElement;
  public inputContainer: HTMLElement;
  public rowsWrapper: HTMLDivElement;
  /** @internal — used by ChatRecording */
  public newMessageWrapper: HTMLDivElement;
  /** @internal — used by ChatInput input state */
  public btnToggleEmoticons: HTMLButtonElement;
  private btnToggleReplyMarkup: HTMLButtonElement;
  public btnSendContainer: HTMLDivElement;

  private replyKeyboard: ReplyKeyboard;

  public attachMenu: InstanceType<typeof AttachMenuButton>;
  private attachMenuButtons: ButtonMenuItemOptionsVerifiable[];

  public btnSuggestPost: HTMLElement;

  private btnAutoDeletePeriod: HTMLElement;
  private btnSendGift: HTMLButtonElement;

  private sendMenu: SendMenu;

  private replyElements: {
    container: HTMLElement,
    cancelBtn: HTMLButtonElement,
    iconBtn: HTMLButtonElement,
    menuContainer: HTMLElement,
    replyInAnother: ButtonMenuItemOptions,
    doNotReply: ButtonMenuItemOptions,
    doNotQuote: ButtonMenuItemOptions,
    content: HTMLElement
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
  /** @internal — used by ChatRecording */
  public forwarding: {[fromPeerId: PeerId]: number[]};
  public replyToMsgId: MessageSendingParams['replyToMsgId'];
  public replyToStoryId: MessageSendingParams['replyToStoryId'];
  public replyToQuote: MessageSendingParams['replyToQuote'];
  public replyToPollOption: MessageSendingParams['replyToPollOption'];
  public replyToPeerId: MessageSendingParams['replyToPeerId'];
  public replyToMonoforumPeerId: MessageSendingParams['replyToMonoforumPeerId'];
  public editMsgId: number;
  public editMessage: Message.message;
  private noWebPage: true;
  public scheduleDate: number;
  public scheduleRepeatPeriod: number;
  public sendSilent: true;
  public startParam: string;
  public invertMedia: boolean;
  public effect: Accessor<DocId>;

  public setEffect: Setter<DocId>;

  // All voice + round-video recording state and behaviour lives in this
  // collaborator (extracted from ChatInput). The `recording` getter below
  // forwards to it.
  private recordingController: ChatRecording;

  // private scrollTop = 0;
  // private scrollOffsetTop = 0;
  // private scrollDiff = 0;

  public helperType: Exclude<ChatInputHelperType, 'webpage'>;
  private helperFunc: () => void | Promise<void>;
  private helperWaitingForward: boolean;
  private helperWaitingReply: boolean;

  public willAttachType: AttachedMediaType;

  /** @internal — used by ChatInput input state */
  public autocompleteHelperController: AutocompleteHelperController;
  private stickersHelper: StickersHelper;
  private emojiHelper: EmojiHelper;
  private commandsHelper: CommandsHelper;
  private quickRepliesHelper: QuickRepliesHelper;
  private mentionsHelper: MentionsHelper;
  private inlineHelper: InlineHelper;
  // * lowercased usernames known to be guest bots (bot_guestchat). a leading @guestbot in the
  // * composer is a plain, sendable message, not an inline query — this cache keeps typing flicker-free
  private knownGuestBots: Set<string> = new Set();
  /** @internal — used by ChatRecording */
  public listenerSetter: ListenerSetter;
  private middlewareHelper: MiddlewareHelper;
  private hoverListenerSetter: ListenerSetter;

  private pinnedControlBtn: HTMLButtonElement;
  private openChatBtn: HTMLButtonElement;

  private goDownBtn: HTMLButtonElement;
  private goDownUnreadBadge: HTMLElement;
  private goMentionBtn: HTMLButtonElement;
  private goMentionUnreadBadge: HTMLSpanElement;
  private goReactionBtn: HTMLButtonElement;
  private goReactionUnreadBadge: HTMLElement;
  private goPollVoteBtn: HTMLButtonElement;
  private goPollVoteUnreadBadge: HTMLElement;
  private btnScheduled: HTMLButtonElement;

  private btnPreloader: HTMLButtonElement;

  private saveDraftDebounced: DebounceReturnType<() => void>;

  private fakeRowsWrapper: HTMLDivElement;

  private previousQuery: string;

  private releaseMediaPlayback: () => void;

  private botStartBtn: HTMLButtonElement;
  private unblockBtn: HTMLButtonElement;
  private onlyPremiumBtn: HTMLButtonElement;
  private onlyPremiumBtnText: I18n.IntlElement;
  private frozenBtn: HTMLButtonElement;
  private joinBtn: HTMLButtonElement;
  private channelMuteBtn: HTMLButtonElement;
  private directControlBtn: HTMLButtonElement;
  private giftControlBtn: HTMLButtonElement;
  private rowsWrapperWrapper: HTMLDivElement;
  private controlContainer: HTMLElement;
  private fakeSelectionWrapper: HTMLDivElement;
  /** @internal — used by ChatInput input state */
  public starsBadge: HTMLElement;
  /** @internal — used by ChatInput input state */
  public starsBadgeStars: HTMLElement;

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
  /** True while `finishPeerChange` runs — suppresses animated plate centering. */
  private peerChanging: boolean;
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

  public inputState: ChatInputState;

  public suggestedPost: SuggestedPostPayload;
  private inputHelperNavigationItem: NavigationItem;
  private placeholderParamsMiddlewareHelper: MiddlewareHelper;

  private savedReplyToPollOption?: {
    msgId: number;
    option: Uint8Array;
    text: TextWithEntities;
  };

  constructor(
    public chat: Chat,
    private appImManager: AppImManager,
    /** @internal — used by ChatRecording */
    public managers: AppManagers,
    private className: string
  ) {
    this.listenerSetter = new ListenerSetter();
    this.hoverListenerSetter = new ListenerSetter();
    this.middlewareHelper = getMiddleware();
    this.excludeParts = {};
    this.isFocused = false;
    this.emoticonsDropdown = emoticonsDropdown;
  }

  // Public because selection.ts and appImManager.ts read `chat.input.recording`.
  public get recording() {
    return this.recordingController?.active ?? false;
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

    const fakeRowsWrapper = this.fakeRowsWrapper = document.createElement('div');
    fakeRowsWrapper.classList.add('fake-wrapper', 'fake-rows-wrapper');

    const fakeSelectionWrapper = this.fakeSelectionWrapper = document.createElement('div');
    fakeSelectionWrapper.classList.add('fake-wrapper', 'fake-selection-wrapper');

    this.inputContainer.append(this.rowsWrapperWrapper, fakeRowsWrapper, fakeSelectionWrapper);
    this.chatInput.append(this.inputContainer);

    if(!this.excludeParts.downButton) {
      this.constructGoDownButton();
    }

    this.placeholderParamsMiddlewareHelper = getMiddleware();

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

    this.inputState = runWithHotReloadGuard(() => createChatInputState(this));

    if(HOT_CHAT_INPUTS) {
      HOT_CHAT_INPUTS.push(this);
      this.getMiddleware()?.onDestroy(() => {
        const idx = HOT_CHAT_INPUTS.indexOf(this);
        if(idx !== -1) HOT_CHAT_INPUTS.splice(idx, 1);
      });
    }
  }

  /** @internal — used to hot-reload the input state with freshly evaluated code */
  public reloadInputState(create: typeof createChatInputState) {
    if(!this.inputState) return;
    const carried = {...this.inputState.store};
    this.inputState.dispose();
    this.inputState = runWithHotReloadGuard(() => create(this, carried));
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

    this.replyElements.content = document.createElement('div');
    this.replyElements.content.classList.add('reply-wrapper-content');

    this.replyElements.iconBtn = this.createButtonIcon('');
    this.replyElements.cancelBtn = this.createButtonIcon('close reply-cancel', {noRipple: true});

    this.replyElements.content.append(this.replyElements.iconBtn, this.replyElements.cancelBtn);
    this.replyElements.container.append(this.replyElements.content);

    attachClickEvent(this.replyElements.cancelBtn, this.onHelperCancel, {listenerSetter: this.listenerSetter});
    attachClickEvent(this.replyElements.content, this.onHelperClick, {listenerSetter: this.listenerSetter});

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
    btnMenu.classList.add('reply-line-menu', 'top-right');

    if(!IS_TOUCH_SUPPORTED) {
      this.replyHover = this.createReplyLineHover(btnMenu);
    }
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

          const replyTitle = this.replyElements.content.querySelector('.reply-title');
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

    forwardBtnMenu.classList.add('reply-line-menu', 'top-right');

    if(!IS_TOUCH_SUPPORTED) {
      this.forwardHover = this.createReplyLineHover(forwardBtnMenu);
    }

    forwardElements.modifyArgs = forwardButtons.slice(0, -2);
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

    btnMenu.classList.add('reply-line-menu', 'top-right');

    if(!IS_TOUCH_SUPPORTED) {
      this.webPageHover = this.createReplyLineHover(btnMenu);
    }
  }

  private constructMentionButton(kind: 'mention' | 'reaction' | 'pollVote' = 'mention') {
    const isReaction = kind === 'reaction';
    const isPollVote = kind === 'pollVote';
    const icon: Icon = isPollVote ? 'poll' : (isReaction ? 'reactions' : 'mention');
    const btn = ButtonCorner({icon, className: 'bubbles-corner-button chat-secondary-button bubbles-go-mention bubbles-go-reaction'});
    const badge = createBadge('span', 24, 'primary');
    btn.append(badge);
    this.inputContainer.append(btn);

    attachClickEvent(btn, (e) => {
      cancelEvent(e);
      const middleware = this.getMiddleware();
      const peerId = this.chat.peerId;
      this.managers.appMessagesManager.goToNextMention({peerId, threadId: this.chat.threadId, isReaction, isPollVote}).then(async(mid) => {
        if(!middleware() || !mid) {
          return;
        }

        // Wait for the message to actually be focused — rendered AND scrolled
        // into view — then re-arm the intersection observer so it reads the
        // mention/reaction only if the bubble is genuinely on screen. Without
        // this, a target that was already visible never triggers a fresh
        // intersection callback and stays unread (the badge would never clear).
        // Poll votes have their own read flow inside goToNextMention, so they're
        // excluded. setMessageId resolves before render/scroll finish — that's
        // the inner `promise` field, which we await (swallowing middleware
        // cancellation) so the bubble exists and is positioned before re-arming.
        const result = await this.chat.setMessageId({lastMsgId: mid});
        await result?.promise?.catch(() => {});
        if(!middleware()) {
          return;
        }

        if(!isPollVote) {
          this.chat.bubbles.reobserveUnreadContent(peerId, mid);
        }
      });
    }, {listenerSetter: this.listenerSetter});

    createContextMenu({
      buttons: [{
        icon: 'readchats',
        text: isPollVote ? 'ReadAllPollVotes' : (isReaction ? 'ReadAllReactions' : 'ReadAllMentions'),
        onClick: () => {
          this.managers.appMessagesManager.readMentions(this.chat.peerId, this.chat.threadId, isReaction, isPollVote);
        }
      }],
      listenTo: btn,
      listenerSetter: this.listenerSetter
    });

    if(isPollVote) {
      this.goPollVoteUnreadBadge = badge;
      this.goPollVoteBtn = btn;
    } else if(isReaction) {
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
      chatInput: this,
      middleware: this.middlewareHelper.get()
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
    // All recording state + behaviour lives in ChatRecording now; constructing
    // it wires the recorders, mounts the voice + video panels, and installs the
    // record-mode switch menu (the same work this method used to do inline).
    this.recordingController = new ChatRecording(this);
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

    this.btnSendGift = this.createButtonIcon('gift toggle-send-gift float hide', {noRipple: true});
    attachClickEvent(this.btnSendGift, () => {
      PopupElement.createPopup(PopupSendGift, {peerId: this.chat.peerId});
    }, {listenerSetter: this.listenerSetter});

    this.inputMessageContainer = document.createElement('div');
    this.inputMessageContainer.classList.add('input-message-container');
    this.inputState.set({inputMessageContainerInited: true});

    if(this.goDownBtn) {
      this.goDownUnreadBadge = createBadge('span', 24, 'primary');
      this.goDownBtn.append(this.goDownUnreadBadge);
    }

    if(!this.excludeParts.mentionButton) {
      this.constructMentionButton();
      this.constructMentionButton('reaction');
      this.constructMentionButton('pollVote');
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

    const inputThis = this;

    this.attachMenuButtons = [{
      icon: 'image',
      text: 'Chat.Input.Attach.PhotoOrVideo',
      onClick: () => this.onAttachClick(false, true, true),
      verify: () => canUploadAsWhenEditing({asWhat: 'media', message: this.editMessage})
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
      onClick: () => this.onAttachClick(true),
      verify: () => canUploadAsWhenEditing({asWhat: 'document', message: this.editMessage})
      // verify: () => this.chat.canSend('send_docs')
    }, {
      icon: 'brush',
      get text() {
        return inputThis.editMessage?.media?._ === 'messageMediaPhoto' ?
          'EditThisPhoto' :
          'EditThisVideo';
      },
      onClick: () => this.editMediaWithEditor(),
      verify: () => this.editMessage && getMediaTypeForMessage(this.editMessage) === 'media' && canEditMediaWithEditor(this.editMessage?.media)
    }, {
      icon: 'gift',
      text: 'GiftPremium',
      onClick: () => this.chat.appImManager.giftPremium(this.chat.peerId),
      verify: () => {
        if(this.editMsgId) return;
        return this.chat && Promise.all([
          this.chat.canGiftPremium(),
          this.managers.apiManager.getAppConfig()
        ]).then(([canGift, {premium_gift_attach_menu_icon}]) => canGift && premium_gift_attach_menu_icon);
      }
    }, {
      icon: 'poll',
      text: 'Poll',
      onClick: async() => {
        const pollsAction: ChatRights = 'send_polls';

        if(!(await this.chat.canSend(pollsAction))) {
          toastNew({langPackKey: POSTING_NOT_ALLOWED_MAP[pollsAction]});
          return;
        }

        const {openCreatePollPopup} = await import('@components/popups/createPoll');

        const supportedMediaTypes: SupportedMediaType[] = [];

        const supportedPromises: [Promise<boolean>, SupportedMediaType][] = [
          [this.chat.canSend('send_photos'), 'photo'],
          [this.chat.canSend('send_stickers'), 'sticker'],
          [this.chat.canSend('send_videos'), 'video'],
          [this.chat.canSend('send_gifs'), 'gif']
        ];

        for(const [canSendPromise, type] of supportedPromises) {
          if(await canSendPromise) supportedMediaTypes.push(type);
        }

        openCreatePollPopup({
          isBroadcast: this.chat.isBroadcast,
          supportedMediaTypes: supportedMediaTypes,
          onSubmit: async(payload) => {
            const attachments = [
              payload.descriptionAttachment,
              payload.explanationAttachment,
              ...payload.pollOptions.map((option) => option.attachment)
            ];

            const requiredRights = new Set<ChatRights>();
            for(const attachment of attachments) {
              if(!attachment) continue;
              switch(attachment.type) {
                case 'photo': requiredRights.add('send_photos'); break;
                case 'sticker': requiredRights.add('send_stickers'); break;
                case 'video':
                  requiredRights.add(attachment.isAnimated ? 'send_gifs' : 'send_videos');
                  break;
              }
            }

            for(const right of requiredRights) {
              if(!(await this.chat.canSend(right))) {
                toastNew({langPackKey: POSTING_NOT_ALLOWED_MAP[right]});
                return;
              }
            }

            const sendingParams = this.chat.getMessageSendingParams();

            const preparedPaymentResult = await this.chat.input.paidMessageInterceptor.prepareStarsForPayment(1);
            if(preparedPaymentResult === PAYMENT_REJECTED) return;

            sendingParams.confirmedPaymentResult = preparedPaymentResult;

            this.managers.appPollsManager.sendPollMessage(sendingParams, payload);
          }
        }, SolidJSHotReloadGuardProvider);

        // PopupElement.createPopup(PopupCreatePoll, this.chat).show();
      },
      verify: () => {
        if(this.editMsgId) return;
        return (!this.chat.isMonoforum && this.chat.peerId.isAnyChat()) || this.chat.isBot || this.chat.peerId === rootScope.myId;
      }
    }, {
      icon: 'checkround',
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

        showChecklistPopup({chat: this.chat});
      },
      verify: () => !this.editMsgId && !this.chat.isMonoforum
    }, {
      icon: 'list',
      text: 'QuickReplies.AttachMenu',
      onClick: () => {
        showQuickRepliesPickerPopup({
          onSelect: (reply) => this.insertQuickReply({
            text: reply.text,
            crmTemplateId: reply.crmTemplateId,
            hasImages: !!reply.imageCount,
            isHelper: false
          })
        });
      },
      verify: () => !this.editMsgId && this.canSendPlain()
    }];

    const attachMenuButtons = this.attachMenuButtons.slice();
    this.attachMenu = new AttachMenuButton;

    ButtonMenuToggle({
      container: this.attachMenu,
      buttonOptions: {noRipple: true},
      listenerSetter: this.listenerSetter,
      direction: 'top-right',
      buttons: this.attachMenuButtons,
      onOpenBefore: this.excludeParts.attachMenu ? undefined : async() => {
        const attachMenuBots = (this.chat.isMonoforum || this.editMsgId) ? [] : await this.managers.appAttachMenuBotsManager.getAttachMenuBots();
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

    this.btnSuggestPost = ButtonIcon('suggested hide');
    attachClickEvent(this.btnSuggestPost, wrapAsyncClickHandler(async() => {
      await this.openSuggestPostPopup();
    }));

    this.btnAutoDeletePeriod = ButtonIcon('auto_delete_circle_clock hide');
    attachClickEvent(this.btnAutoDeletePeriod, wrapAsyncClickHandler(async() => {
      await this.chat.openAutoDeleteMessagesCustomTimePopup();
    }));

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';

    this.newMessageWrapper.append(...[
      this.botCommandsToggle,
      this.attachMenu,
      this.inputMessageContainer,
      this.btnScheduled,
      this.btnToggleReplyMarkup,
      this.btnSuggestPost,
      this.btnAutoDeletePeriod,
      this.btnSendGift,
      this.btnToggleEmoticons,
      this.fileInput
    ].filter(Boolean));

    if(this.replyElements?.container) this.rowsWrapper.append(this.replyElements.container);
    this.autocompleteHelperController = new AutocompleteHelperController();
    this.stickersHelper = new StickersHelper(this.rowsWrapper, this.autocompleteHelperController, this.chat, this.managers);
    this.emojiHelper = new EmojiHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.managers);
    // * stickers + custom-emoji-by-emoji suggestions can be visible at the same time;
    // * emoji helper positions itself above the stickers panel and hides on stickers scroll
    this.emojiHelper.addSibling(this.stickersHelper);
    this.emojiHelper.attachStickersHelper(this.stickersHelper);
    if(!this.excludeParts.commandsHelper) this.commandsHelper = new CommandsHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.managers);
    if(!this.excludeParts.commandsHelper) this.quickRepliesHelper = new QuickRepliesHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.managers);
    this.mentionsHelper = new MentionsHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.managers);
    this.inlineHelper = new InlineHelper(this.rowsWrapper, this.autocompleteHelperController, this.chat, this.managers);
    this.rowsWrapper.append(this.newMessageWrapper);

    this.btnCancelRecord = this.createButtonIcon('binfilled btn-circle btn-record-cancel chat-input-secondary-button chat-secondary-button');

    this.btnSendContainer = document.createElement('div');
    this.btnSendContainer.classList.add('btn-send-container');

    this.btnSend = this.createButtonIcon();
    this.btnSend.classList.add('btn-circle', 'btn-send', 'animated-button-icon');
    const icons: [Icon, string][] = [
      ['logo', 'send'],
      ['schedule', 'schedule'],
      ['check', 'edit'],
      ['microphone_filled', 'record'],
      ['recordround', 'record-video'],
      ['forward_filled', 'forward']
    ];
    this.btnSend.append(...icons.map(([name, type]) => Icon(name, 'animated-button-icon-icon', 'btn-send-icon-' + type)));

    this.addStarsBadge();

    this.btnSendContainer.append(this.btnSend);

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
        if(this.recording) this.recordingController.finishRecordingFromMenu();
        else this.sendMessage();
      },
      onScheduleClick: () => {
        if(this.recording) this.scheduleSending(() => this.recordingController.finishRecordingFromMenu());
        else this.scheduleSending(undefined);
      },
      onSendWhenOnlineClick: () => {
        if(this.recording) this.setScheduleTimestamp(SEND_WHEN_ONLINE_TIMESTAMP, () => this.recordingController.finishRecordingFromMenu());
        else this.setScheduleTimestamp(SEND_WHEN_ONLINE_TIMESTAMP, this.sendMessage.bind(this, true));
      },
      middleware: this.chat.destroyMiddlewareHelper.get(),
      openSide: 'top-left',
      onContextElement: this.btnSend,
      onOpen: () => {
        const good = this.chat.type !== ChatType.Scheduled && (this.recording || !this.isInputEmpty() || !!(this.forwarding && Object.keys(this.forwarding).length)) && !this.editMsgId;
        if(good) {
          this.emoticonsDropdown?.toggle(false);
        }

        return good;
      },
      // While recording, the send button is the only visible original control —
      // the trash / pause-toggle / play buttons of the recording panel are also
      // live. Without this guard, a left-click on any of them while the
      // schedule/silent menu is open would close the menu AND trigger that
      // button's action (cancel recording, pause, etc.). Capturing clicks at
      // the document level keeps the behaviour consistent: any click anywhere
      // outside the menu just dismisses the menu, no action fires.
      onToggle: (open) => this.recordingController.setVoiceRecordingMenuGuard(open),
      canSendWhenOnline: this.canSendWhenOnline,
      onRef: (element) => {
        this.btnSendContainer.append(element);
      },
      withEffects: () => this.chat.peerId.isUser() && this.chat.peerId !== rootScope.myId,
      effect: this.effect,
      onEffect: this.setEffect
    });

    // Move the morphing send/record button into the input row as the last button.
    // btnCancelRecord is built above but intentionally not appended to the DOM.
    this.newMessageWrapper.append(this.btnSendContainer);
    this.inputContainer.append(...[this.btnReaction].filter(Boolean));

    // The voice + round-video recording panels are constructed and mounted by
    // ChatRecording (built in constructRecorder below): the voice panel is
    // inserted into newMessageWrapper before btnSendContainer, the round-video
    // preview overlay onto <body>.

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

    // Builds the ChatRecording controller, which wires the recorders, mounts the
    // voice + round-video panels, and installs the record-mode switch menu.
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

    const makeControlButton = (langKey: LangPackKey | HTMLElement, filled?: boolean) => {
      const button = Button(`btn-primary ${filled ? 'btn-color-primary' : 'btn-transparent'} text-bold chat-input-control-button chat-input-plate-button`);
      button.append(langKey instanceof HTMLElement ? langKey : i18n(langKey));
      return button;
    };

    this.botStartBtn = makeControlButton('BotStart');
    this.unblockBtn = makeControlButton('Unblock');
    this.joinBtn = this.chat.topbar && makeControlButton('ChannelJoin', true);
    this.channelMuteBtn = makeControlButton('ChatList.Context.Mute');
    this.channelMuteBtn.classList.add('hide');
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
    attachClickEvent(this.channelMuteBtn, () => {
      this.managers.appMessagesManager.togglePeerMute({peerId: this.chat.peerId});
    }, {listenerSetter: this.listenerSetter});

    // * pinned part start
    this.pinnedControlBtn = Button('btn-primary btn-transparent text-bold chat-input-control-button chat-input-plate-button', {icon: 'unpin'});

    this.listenerSetter.add(this.pinnedControlBtn)('click', () => {
      const peerId = this.chat.peerId;

      PopupElement.createPopup(PopupPinMessage, peerId, 0, true, () => {
        this.chat.appImManager.setPeer({isDeleting: true}); // * close tab

        // ! костыль, это скроет закреплённые сообщения сразу, вместо того, чтобы ждать пока анимация перехода закончится
        const originalChat = this.chat.appImManager.chat;
        if(originalChat.topbar.pinnedMessage) {
          originalChat.topbar.pinnedMessage.setHidden(true);
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

    // Channel "can't write" plate side buttons: write-in-direct (shown only
    // when the channel has a linked direct-messages chat) and gift.
    this.directControlBtn = this.createButtonIcon('comments hide');
    attachClickEvent(this.directControlBtn, () => {
      const channel = this.chat.peer as MTChat.channel;
      const monoforumId = channel?.linked_monoforum_id;
      if(monoforumId) {
        this.chat.appImManager.setInnerPeer({peerId: monoforumId.toPeerId(true)});
      }
    }, {listenerSetter: this.listenerSetter});

    this.giftControlBtn = this.createButtonIcon('gift hide');
    attachClickEvent(this.giftControlBtn, () => {
      PopupElement.createPopup(PopupSendGift, {peerId: this.chat.peerId});
    }, {listenerSetter: this.listenerSetter});

    // The control container is now a single uniform-width plate:
    // Button.Icon + Button + Button.Icon (see controlPlate.tsx). All the
    // single-button states share the centre slot — only one is ever visible.
    const controlPlate = ChatInputPlate({
      left: this.directControlBtn,
      right: this.giftControlBtn,
      center: [
        this.botStartBtn,
        this.unblockBtn,
        this.joinBtn,
        this.channelMuteBtn,
        this.onlyPremiumBtn,
        this.frozenBtn,
        this.pinnedControlBtn,
        this.openChatBtn
      ].filter(Boolean)
    }) as HTMLElement;

    this.controlContainer.append(...[
      controlPlate,
      this.replyInTopicOverlay
    ].filter(Boolean));
  }

  private setChatListeners() {
    this.listenerSetter.add(rootScope)('global_privacy_update', () => {
      this.updateGiftButtonVisibility();
    });

    this.listenerSetter.add(rootScope)('peer_full_update', (peerId) => {
      if(peerId === this.chat?.peerId) {
        this.updateGiftButtonVisibility();
      }
    });

    this.listenerSetter.add(rootScope)('draft_updated', ({peerId, threadId, monoforumThreadId, draft, force}) => {
      // We don't have draft functionality when in the global monoforum chat, but we still need to clear the input right after sending the message
      if(!draft && force && this.chat.peerId === peerId && this.chat.isMonoforum) {
        this.setDraft(draft, true, force);
        return;
      }

      if(this.chat.threadId !== threadId || this.chat.monoforumThreadId !== monoforumThreadId || this.chat.peerId !== peerId || PEER_EXCEPTIONS.has(this.chat.type)) return;
      if(!draft) {
        // a pending local save means the user is actively typing newer content —
        // let it win and sync normally instead of clobbering it with the remote clear.
        // but a forced clear is our OWN send completing (clearDraft: true), so always
        // honour it — otherwise the input never clears after sending while typing.
        if(!force && this.saveDraftDebounced.isDebounced()) return;
        this.saveDraftDebounced.clearTimeout();
      }
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

    this.listenerSetter.add(rootScope)('auto_delete_period_update', ({peerId, period}) => {
      if(this.chat.peerId !== peerId) return;

      if(period) {
        this.btnAutoDeletePeriod.replaceChildren(createAutoDeleteIcon(period));
        this.btnAutoDeletePeriod.classList.remove('hide');
      } else {
        this.btnAutoDeletePeriod.classList.add('hide');
      }
    });

    // Keep the channel "can't write" plate's Mute/Unmute label in sync.
    this.listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      if(this.chat.peerId === dialog.peerId) {
        this.updateChannelMuteButton();
      }
    });
  }

  public onAttachClick = async(documents?: boolean, photos?: boolean, videos?: boolean) => {
    if(!this.editMessage && await this.showSlowModeTooltipIfNeeded({
      element: this.attachMenu,
      container: this.btnSendContainer.parentElement
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
      const accept = [...new Set([
        ...(photos ? IMAGE_MIME_TYPES_SUPPORTED : []),
        // * .mov is selectable even when not natively playable — the send popup converts it to mp4
        ...(videos ? [...VIDEO_MIME_TYPES_SUPPORTED, 'video/quicktime'] : [])
      ])].join(', ');

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
    // While a peer change is in progress the plate must switch instantly —
    // otherwise an animated centering (e.g. from `dialogs_multiupdate`) races
    // `finishPeerChange` and the control plate flickers on chat switch.
    // Captured before the await so it reflects the moment `center` was called.
    const animated = animate && !this.peerChanging;
    return this._center(await this.getNeededFakeContainer(), animated);
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

    const chat = this.chat.peer;
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

  /**
   * A broadcast channel the user can't post in — whether a plain subscriber or
   * not subscribed at all. Drives the "can't write" plate (join / mute + gift).
   */
  public async isChannelControlNeeded() {
    if(!this.joinBtn || this.chat.type !== ChatType.Chat || this.chat.peerId.isUser() || this.chat.isMonoforum) {
      return false;
    }

    if(!(this.chat.peer as MTChat.channel)?.pFlags?.broadcast) {
      return false;
    }

    return !(await this.chat.canSend('send_messages'));
  }

  // Nobody can write to the Replies chat — official clients replace the
  // composer with the same Mute/Unmute plate as for channels.
  private isRepliesChat(peerId = this.chat.peerId) {
    return peerId === REPLIES_PEER_ID && this.chat.type === ChatType.Chat;
  }

  // Keeps the channel "can't write" plate's centre button labelled Mute/Unmute.
  private updateChannelMuteButton() {
    if(!this.channelMuteBtn) {
      return;
    }

    const peerId = this.chat.peerId;
    this.managers.appNotificationsManager.isPeerLocalMuted({peerId, respectType: false}).then((muted) => {
      if(this.chat.peerId !== peerId) {
        return;
      }

      this.channelMuteBtn.replaceChildren(i18n(muted ? 'ChatList.Context.Unmute' : 'ChatList.Context.Mute'));
    });
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
      await this.isChannelControlNeeded() ||
      this.isRepliesChat() ||
      (this.frozenBtn && this.chat.appConfig.freeze_since_date && !(await this.chat.canSend()))
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

    const user = this.chat.peer as User.user;
    return user.status?._ !== 'userStatusOnline';
  };

  public setScheduleTimestamp(timestamp: number, callback: () => void, repeatPeriod?: number) {
    const middleware = this.getMiddleware();
    const minTimestamp = (Date.now() / 1000 | 0) + 10;
    if(timestamp <= minTimestamp) {
      timestamp = undefined;
    }

    this.scheduleDate = timestamp;
    this.scheduleRepeatPeriod = repeatPeriod;
    callback();

    if(this.chat.type !== ChatType.Scheduled && this.chat.type !== ChatType.Stories && timestamp) {
      setTimeout(() => { // ! need timeout here because .forwardMessages will be called after timeout
        if(!middleware()) {
          return;
        }

        PopupElementTsx.getPopups(STICKERS_POPUP_KIND).forEach((popup) => popup.hide());
        this.appImManager.openScheduled(this.chat.peerId);
      }, 0);
    }
  }

  public getMiddleware(...args: Parameters<Chat['bubbles']['getMiddleware']>) {
    return this.chat.bubbles.getMiddleware(...args);
  }

  public scheduleSending = async(
    callback: () => void = this.sendMessage.bind(this, true),
    initDate?: Date,
    initRepeatPeriod?: number
  ) => {
    const middleware = this.getMiddleware();
    const canSendWhenOnline = await this.canSendWhenOnline();
    if(!middleware()) {
      return;
    }

    showScheduleSendingPopup({
      initDate,
      onPick: (timestamp, repeatPeriod) => {
        if(!middleware()) {
          return;
        }

        this.setScheduleTimestamp(timestamp, callback, repeatPeriod);
      },
      canSendWhenOnline,
      initRepeatPeriod
    });
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
      | 'unread_poll_votes_count'
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

    if(this.goPollVoteUnreadBadge && this.chat.type === ChatType.Chat) {
      const hasPollVotes = !!dialog?.unread_poll_votes_count;
      setBadgeContent(this.goPollVoteUnreadBadge, hasPollVotes ? '' + (dialog.unread_poll_votes_count) : '');
      this.goPollVoteBtn.classList.toggle('is-visible', hasPollVotes);
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
      const isBotforumAllChats = this.chat.isBotforum && !this.chat.threadId;
      draft = {
        _: 'draftMessage',
        date: tsNow(true),
        message: value.trim(),
        entities: entities.length ? entities : undefined,
        pFlags: {
          no_webpage: this.noWebPage,
          invert_media: this.invertMedia || undefined
        },
        reply_to: !isBotforumAllChats && replyTo ? {
          _: 'inputReplyToMessage',
          reply_to_msg_id: replyTo.replyToMsgId,
          top_msg_id: this.chat.threadId,
          reply_to_peer_id: replyTo.replyToPeerId,
          monoforum_peer_id: replyTo.replyToMonoforumPeerId,
          poll_option: replyTo.replyToPollOption,
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
        // * remember guest bots picked from the mention list so the composer treats the inserted
        // * @guestbot as a plain guest-chat message right away, with no inline-preloader flicker
        if((peer as User.user).pFlags?.bot_guestchat) {
          this.knownGuestBots.add(usernames[0].toLowerCase());
        }
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

    this.autocompleteHelperController.destroy();
    this.placeholderParamsMiddlewareHelper.destroy();
    appNavigationController.removeItem(this.inputHelperNavigationItem);
    this.listenerSetter.removeAll();
    this.middlewareHelper.destroy();
    // Tears down the round-video waveform/playback, releases the camera, drops
    // any in-flight recording navigation item, and removes the body-mounted
    // round-preview element.
    this.recordingController?.destroy();
    this.setCurrentHover();

    [
      this.replyElements?.menuContainer,
      this.forwardElements?.container,
      this.webPageElements?.container
    ].forEach((menu) => {
      // matches('body') instead of `=== document.body` so a menu floated into the Document PiP
      // window's body (getOverlayRoot) is still torn down — its parent is the PiP body, not the tab's.
      if(menu?.parentElement?.matches('body')) menu.remove();
    });
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
      (!force && draft && !isInputEmpty(this.messageInput)) ||
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
        } else if(fromUpdate && !this.saveDraftDebounced.isDebounced()) {
          this.clearInput();
          this.clearHelper();
        }

        return fromUpdate;
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
        replyToPollOption: replyTo.poll_option,
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

    this.peerChanging = true;

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
      isBroadcastGroup,
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
      appConfig,
      autoDeletePeriod,
      canManageAutoDelete,
      peerMuted,
      ackedGlobalPrivacy
    ] = await Promise.all([
      this.managers.appPeersManager.isBroadcast(peerId),
      this.managers.appPeersManager.isBroadcastGroup(peerId),
      this.managers.appPeersManager.canPinMessage(peerId),
      this.managers.appPeersManager.isBot(peerId),
      this.chat?.canSend('send_messages') || true,
      this.chat?.canSend('send_plain') || true,
      this.getNeededFakeContainer(startParam),
      modifyAckedPromise(this.managers.acknowledged.appProfileManager.getProfileByPeerId(peerId)),
      btnScheduled && !this.chat.threadId ? modifyAckedPromise(this.managers.acknowledged.appMessagesManager.getScheduledMessages(peerId)) : undefined,
      sendAs ? (sendAs.setPeerId(peerId), sendAs.updateManual(true)) : undefined,
      wrapPeerTitle({peerId, onlyFirstName: true}),
      this.chat.isPremiumRequiredToContact(),
      apiManagerProxy.getAppConfig(),
      modifyAckedPromise(this.chat.getAutoDeletePeriod()),
      this.chat.canManageAutoDelete(),
      this.managers.appNotificationsManager.isPeerLocalMuted({peerId, respectType: false}),
      this.btnSendGift ?
        modifyAckedPromise(this.managers.acknowledged.appPrivacyManager.getGlobalPrivacySettings()) :
        undefined
    ]);

    const placeholderParams = this.messageInput ? await this.getPlaceholderParams(canSendPlain) : undefined;

    return () => {
      const {isMonoforum, canManageDirectMessages, monoforumThreadId} = this.chat;
      // console.warn('[input] finishpeerchange start');

      chatInput.classList.toggle('hide', this.chat.noInput);

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
        const channel = this.chat.peer as MTChat.channel;

        // A broadcast channel OR gigagroup the user can't post in: not subscribed
        // -> Subscribe/Join (primary filled), subscribed -> Mute (transparent).
        // Regular megagroups keep using getJoinButtonType(). The Replies chat
        // always gets Mute.
        const cantPost = (isBroadcast || isBroadcastGroup) && !canSend &&
          this.chat.type === ChatType.Chat && !peerId.isUser() && !this.chat.isMonoforum;
        const showJoin = !!type || (cantPost && !!channel?.pFlags?.left);
        const showMute = (cantPost && !channel?.pFlags?.left) || this.isRepliesChat(peerId);
        const good = !haveSomethingInControl && (showJoin || showMute);
        haveSomethingInControl ||= good;

        this.joinBtn.classList.toggle('hide', !(good && showJoin));
        if(good && showJoin) {
          // "Subscribe" for a broadcast channel; "Join" for a group you must
          // join before you can post (regular group OR gigagroup).
          const joinKey: LangPackKey = isBroadcast ?
            'Chat.Subscribe' :
            type === 'request' ? 'ChannelJoinRequest' : 'ChannelJoin';
          this.joinBtn.replaceChildren(i18n(joinKey));
        }

        this.channelMuteBtn.classList.toggle('hide', !(good && showMute));
        if(good && showMute) {
          // Synchronous initial label (no flash); live toggles are handled by
          // the dialog_notify_settings listener -> updateChannelMuteButton().
          this.channelMuteBtn.replaceChildren(i18n(peerMuted ? 'ChatList.Context.Unmute' : 'ChatList.Context.Mute'));
        }

        // Channel "can't write" plate: write-in-direct (only when the channel
        // has a linked direct-messages chat) on the left, gift on the right.
        // Both are channel-only — a gigagroup or megagroup join just shows the
        // centre button.
        this.directControlBtn.classList.toggle('hide', !(good && channel?.linked_monoforum_id));
        this.giftControlBtn.classList.toggle('hide', !(good && isBroadcast));
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

      if(this.chat) {
        callbackify(autoDeletePeriod.result, (period) => {
          if(canManageAutoDelete && period) this.btnAutoDeletePeriod.replaceChildren(createAutoDeleteIcon(period));
          this.btnAutoDeletePeriod.classList.toggle('hide', !(canManageAutoDelete && period));
        });
      }

      if(this.btnSendGift) {
        // Default to hidden so the previous chat's state never leaks.
        // Cached acked.result → callbackify fires synchronously inside
        // this render closure (same tick as the hide above → no visible
        // flicker, button settles into the correct state immediately).
        // Cold first-load → async toggle once both fetches resolve.
        this.btnSendGift.classList.add('hide');
        if(this.giftButtonBasePeerEligible(peerId) && !isBot) {
          callbackify(ackedPeerFull.result, (peerFull) => {
            if(!middleware()) return;
            callbackify(ackedGlobalPrivacy.result, (globalPrivacy) => {
              if(!middleware()) return;
              this.btnSendGift.classList.toggle('hide', !this.shouldShowGiftButton(peerFull as UserFull.userFull, globalPrivacy));
            });
          });
        }
      }

      haveSomethingInControl ||= this.chat.isBotforum && this.chat.canManageBotforumTopics;

      this.botStartBtn.classList.toggle('hide', haveSomethingInControl);

      if(this.messageInput) {
        this.updateMessageInput(
          canSend || haveSomethingInControl,
          canSendPlain && !this.chat.isTemporaryThread,
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

      this.inputState.set({
        isMonoforumAllChats: isMonoforum && canManageDirectMessages && !monoforumThreadId,
        isReplying: !!this.helperType
      });

      this.peerChanging = false;
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

  private giftButtonBasePeerEligible(peerId: PeerId | undefined) {
    return !!peerId &&
      peerId.isUser() &&
      peerId !== rootScope.myId &&
      peerId !== SERVICE_PEER_ID &&
      peerId !== REPLIES_PEER_ID &&
      peerId !== HIDDEN_PEER_ID &&
      this.chat?.type === ChatType.Chat;
  }

  private shouldShowGiftButton(userFull: UserFull.userFull, globalPrivacy?: GlobalPrivacySettings) {
    if(!userFull) return false;
    const disallowed = userFull.disallowed_gifts?.pFlags;
    const allDisallowed = !!disallowed && !!disallowed.disallow_unlimited_stargifts &&
      !!disallowed.disallow_limited_stargifts &&
      !!disallowed.disallow_unique_stargifts &&
      !!disallowed.disallow_premium_gifts &&
      !!disallowed.disallow_stargifts_from_channels;
    if(allDisallowed) return false;
    const ownDisplay = !!globalPrivacy?.pFlags.display_gifts_button;
    const peerDisplay = !!userFull.pFlags.display_gifts_button;
    return ownDisplay || peerDisplay;
  }

  private async updateGiftButtonVisibility() {
    if(!this.btnSendGift || !this.chat) return;
    const peerId = this.chat.peerId;
    if(!this.giftButtonBasePeerEligible(peerId)) {
      this.btnSendGift.classList.add('hide');
      return;
    }
    const [isBot, userFull, globalPrivacy] = await Promise.all([
      this.managers.appPeersManager.isBot(peerId),
      this.managers.appProfileManager.getProfile(peerId.toUserId()),
      this.managers.appPrivacyManager.getGlobalPrivacySettings()
    ]);
    if(this.chat?.peerId !== peerId) return;
    this.btnSendGift.classList.toggle('hide', isBot || !this.shouldShowGiftButton(userFull, globalPrivacy));
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

  public async getPlaceholderParams(canSend?: boolean): Promise<Parameters<ChatInput['updateMessageInputPlaceholder']>[0]> {
    this.placeholderParamsMiddlewareHelper.clean();
    canSend ??= await this.chat.canSend('send_plain');
    const {peerId, threadId, isForum, type} = this.chat;
    let key: LangPackKey, args: FormatterArguments, inputStarsCountEl: HTMLElement;
    if(!canSend) {
      key = 'Channel.Persmission.MessageBlock';
    } else if(threadId && !isForum && !peerId.isUser()) {
      key = 'Comment';
    } else if(
      await this.managers.appPeersManager.isBroadcast(peerId) ||
      await this.managers.appPeersManager.isBroadcastGroup(peerId)
    ) {
      key = 'ChannelBroadcast';
    } else if(this.chat.isMonoforum && this.chat.canManageDirectMessages) {
      key = this.inputState.store.isSuggestingUneditablePostChange ?
        'ChannelDirectMessages.CantChangeSuggestedPostMessage' :
        this.chat.monoforumThreadId || this.inputState.store.isReplying ?
          'Message' :
          'ChannelDirectMessages.ChooseMessage';
    } else if(this.chat.isBotforum && !this.chat.canManageBotforumTopics && !this.chat.threadId) {
      key = 'OffThreadMessage'
    } else if(
      (this.sendAsPeerId !== undefined && this.sendAsPeerId !== rootScope.myId) ||
      await this.managers.appMessagesManager.isAnonymousSending(peerId)
    ) {
      key = 'SendAnonymously';
    } else if(type === ChatType.Stories) {
      const stealthModeActiveUntilDate = this.chat.stealthMode?.active_until_date || 0;
      if(stealthModeActiveUntilDate > tsNow(true)) {
        const {element, dispose} = slowModeTimer(() => stealthModeActiveUntilDate - tsNow(true));
        key = 'Stories.StealthMode.Placeholder';
        args = [element];
        this.placeholderParamsMiddlewareHelper.get().onClean(dispose);
      } else {
        key = 'Story.ReplyPlaceholder';
      }
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

  public updateMessageInputPlaceholder({
    key,
    args = [],
    inputStarsCountEl
  }: {
    key: LangPackKey,
    args?: FormatterArguments,
    inputStarsCountEl?: HTMLElement
  }) {
    // console.warn('[input] update placeholder');
    // const i = I18n.weakMap.get(this.messageInput) as I18n.IntlElement;
    const i = I18n.weakMap.get(this.messageInputField.placeholder) as I18n.IntlElement;
    if(!i) {
      return;
    }

    const oldKey = i.key;
    const oldArgs = i.args;
    i.compareAndUpdateBool({key, args}) &&
    this.inputState.set({inputStarsCountEl});

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

  private notifyChatInputHeight() {
    const helperPx = this.helperVisible ? 48 : 0;
    this.chat.updateChatInputHeight(this.inputHeightDelta + helperPx);
  }

  // Single source of truth for `.input-message-input` max-height. The same
  // value is pushed to InputFieldAnimated, which writes it as inline
  // style.maxHeight AND uses it to clamp the auto-grow read of
  // `inputFake.scrollHeight` — so `--chat-input-height-surplus` matches
  // what the user actually sees.
  private static MESSAGE_INPUT_MAX_HEIGHT_DEFAULT = 440; // 27.5rem
  private static MESSAGE_INPUT_MAX_HEIGHT_MOBILE = 160; // 10rem
  private static MESSAGE_INPUT_MAX_HEIGHT_MIN = 36;
  private static SHORT_VIEWPORT_HEIGHT = 480; // 30rem
  private static SHORT_VIEWPORT_RESERVED = 160; // 10rem reserved for chrome

  private computeMessageInputMaxHeight() {
    if(mediaSizes.isMobile) return ChatInput.MESSAGE_INPUT_MAX_HEIGHT_MOBILE;
    if(windowSize.height <= ChatInput.SHORT_VIEWPORT_HEIGHT) {
      // Mirror the old `max(36px, calc(--100vh-inset - 10rem))`. Chat-scope
      // page-chats-padding is 16 on non-mobile (mobile is handled above).
      const available = windowSize.height - 2 * 16 - ChatInput.SHORT_VIEWPORT_RESERVED;
      return Math.max(ChatInput.MESSAGE_INPUT_MAX_HEIGHT_MIN, available);
    }
    return ChatInput.MESSAGE_INPUT_MAX_HEIGHT_DEFAULT;
  }

  private syncMessageInputMaxHeight = () => {
    this.messageInputField?.setMaxHeight(this.computeMessageInputMaxHeight());
  };

  private attachMessageInputField() {
    const oldInputField = this.messageInputField;
    this.messageInputField = new InputFieldAnimated({
      placeholder: 'Message',
      // placeholderAsElement: true,
      name: 'message',
      withLinebreaks: true
    });

    const DEFAULT_INPUT_HEIGHT = 37;
    this.messageInputField.onChangeHeight = (newHeight) => {
      this.inputHeightDelta = Math.max(0, newHeight - DEFAULT_INPUT_HEIGHT);
      this.notifyChatInputHeight();
    };

    this.messageInputField.input.tabIndex = -1;
    this.messageInputField.input.classList.replace('input-field-input', 'input-message-input');
    this.messageInputField.inputFake.classList.replace('input-field-input', 'input-message-input');
    this.messageInput = this.messageInputField.input;
    this.attachMessageInputListeners();
    createMarkdownCache(this.messageInput);

    this.syncMessageInputMaxHeight();
    if(!oldInputField) {
      this.listenerSetter.add(mediaSizes)('resize', this.syncMessageInputMaxHeight);
    }

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
    getAppWindow().document.addEventListener('keyup', () => {
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
          langPackKey: this.chat.isTemporaryThread ? 'WaitForTopicCreation' : POSTING_NOT_ALLOWED_MAP['send_plain']
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
    this.listenerSetter.add(this.messageInput)('keyup', (e) => {
      // * a content-changing key already fired an `input` event before this `keyup`, and the
      // * input handler re-parsed + ran checkAutocomplete with the parsed value — re-doing it
      // * here would just re-walk the DOM and bail at the previousQuery guard. Only re-check on
      // * a caret-move key (arrows/Home/End/PageUp/PageDown), which never fires `input`.
      if(classifyInputKeyup(e) !== 'caret-move') {
        return;
      }

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
          // * re-check emptiness: a replace-style IME (e.g. Vietnamese Telex 'dd' -> 'đ') emits the
          // * delete (empty input) and the insert in the same task, so the input is filled again by
          // * the time this fires. wiping it here would eat the just-composed character
          if(document.activeElement === this.messageInput && this.isInputEmpty()) {
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

    processCurrentFormatting(this.messageInput, undefined, (e as InputEvent)?.inputType as any);

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

  public insertAtCaret(insertText: string, insertEntity?: MessageEntity, isHelper = true, replaceText?: string) {
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
      const match = replaceText ?? (matches ? matches[2] : fullValue);
      // const {node, selection} = getCaretPosNew(this.messageInput);

      const selection = document.getSelection();
      // const range = document.createRange();
      // * a typed emoji can be an <img> on platforms without native emoji support, so the
      // * selected text has to be resolved back to its rich value instead of selection.toString()
      const getSelectedValue = replaceText !== undefined ?
        () => getRichValueWithCaret(selection.getRangeAt(0).cloneContents(), false, false).value :
        () => selection.toString();
      let counter = 0;
      while(getSelectedValue() !== match) {
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

  // * insert a chosen quick reply / CRM template. text-only replies are dropped into the input
  // * (token-replacing the typed `/query` when coming from the slash helper). when the reply is a
  // * CRM template with attached images, the images are fetched lazily, turned into Files and
  // * staged in the send-preview — PopupNewMedia lifts the just-inserted text into the album caption
  // * and clears the input, so the agent reviews text + images together before sending.
  public async insertQuickReply(options: {
    text: string,
    crmTemplateId?: number,
    hasImages?: boolean,
    isHelper?: boolean
  }) {
    const {text, crmTemplateId, hasImages, isHelper} = options;

    // * always run for the slash helper (even with empty text) so the typed `/query` token is
    // * cleared — otherwise it would linger and become the album caption for an image-only template
    if(text || isHelper) {
      this.insertAtCaret(text || '', undefined, !!isHelper);
    }

    if(!hasImages || crmTemplateId === undefined) {
      return;
    }

    const middleware = this.middlewareHelper.get();
    const images = await this.managers.appCrmManager.getTemplateImages(crmTemplateId);
    if(!middleware() || !images.length) {
      return;
    }

    const files = (await Promise.all(images.map(async(img, idx) => {
      try {
        // * a data: URI fetch resolves locally — no network / CORS involved
        const blob = await fetch(img.data).then((r) => r.blob());
        const ext = (img.mime.split('/')[1] || 'jpg').split('+')[0];
        return new File([blob], img.name || `template-${crmTemplateId}-${idx}.${ext}`, {type: img.mime || blob.type});
      } catch(err) {
        return undefined;
      }
    }))).filter(Boolean) as File[];

    if(!middleware() || !files.length) {
      return;
    }

    // * ignoreInputValue defaults to false → the popup pulls the input text in as the caption
    const popup = new PopupNewMedia(this.chat, files, 'media');
    popup.show(false);
  }

  public onEmojiSelected = (emoji: ReturnType<typeof getEmojiFromElement>, autocomplete: boolean, replaceText?: string) => {
    const entity: MessageEntity = emoji.docId ? {
      _: 'messageEntityCustomEmoji',
      document_id: emoji.docId,
      length: emoji.emoji.length,
      offset: 0
    } : getEmojiEntityFromEmoji(emoji.emoji);
    // * inserting a custom emoji can leave the rich text identical (same character, different
    // * entity type) — clear previousQuery so checkAutocomplete re-evaluates the new entities
    this.previousQuery = undefined;
    this.insertAtCaret(emoji.emoji, entity, autocomplete, replaceText);
    return true;
  };

  // * finds a regular emoji ending exactly at the caret. for a lone whole-input emoji this fires
  // * alongside the stickers helper (registered as siblings) so both panels can be visible.
  // * skips when the same range is also covered by a custom-emoji entity — that means the user
  // * has already picked a custom variant and re-suggesting would be redundant
  private getCustomEmojiSuggestionEmoticon(value: string, entities: MessageEntity[]) {
    const emojiEntity = entities.find((entity) =>
      entity._ === 'messageEntityEmoji' &&
      (entity.offset + entity.length) === value.length
    );
    if(!emojiEntity) {
      return undefined;
    }
    const overlappingCustom = entities.some((entity) =>
      entity._ === 'messageEntityCustomEmoji' &&
      entity.offset === emojiEntity.offset &&
      entity.length === emojiEntity.length
    );
    if(overlappingCustom) {
      return undefined;
    }
    return value.slice(emojiEntity.offset);
  }

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

    const foundHelpers = new Set<AutocompleteHelper>();

    // * suggest custom emoji for a regular emoji typed right before the caret. this can coexist
    // * with the stickers helper when the input is a lone whole-input emoji (they're siblings)
    const customEmojiEmoticon = this.chat.appSettings.emoji.suggest && this.getCustomEmojiSuggestionEmoticon(value, entities);
    if(customEmojiEmoticon) {
      foundHelpers.add(this.emojiHelper);
      this.emojiHelper.checkEmoticon(customEmojiEmoticon);
    }

    const matches = value.match(ChatInput.AUTO_COMPLETE_REG_EXP);
    if(matches) {
      const entity = entities[0];

      let query = matches[2];
      const firstChar = query[0];

      if(
        this.stickersHelper &&
        this.chat.appSettings.stickers.suggest !== 'none' &&
        await this.chat.canSend('send_stickers') &&
        (entity?._ === 'messageEntityEmoji' || entity?._ === 'messageEntityCustomEmoji') &&
        entity.length === value.length &&
        !entity.offset
      ) {
        foundHelpers.add(this.stickersHelper);
        this.stickersHelper.checkEmoticon(value);
      } else if(!foundHelpers.size && firstChar === '@') { // mentions
        const topMsgId = this.chat.threadId ? getServerMessageId(this.chat.threadId) : undefined;
        // * only offer guest bots (bot_guestchat) when @ is at the very start of the message, like
        // * inline bots, and not in channels/monoforums where guest-chat sending isn't available
        const fromStart = !matches[1];
        const includeGuestBots = fromStart && this.canSendGuestChat();
        const result = this.mentionsHelper.checkQuery(
          query,
          this.chat.peerId.isUser() ? NULL_PEER_ID : this.chat.peerId,
          topMsgId,
          this.globalMentions,
          includeGuestBots
        );
        if(result) {
          foundHelpers.add(this.mentionsHelper);
        }
      } else if(!foundHelpers.size && !matches[1] && firstChar === '/') { // commands / quick replies
        if(this.commandsHelper && await this.commandsHelper.checkQuery(query, this.chat.peerId)) {
          foundHelpers.add(this.commandsHelper);
        } else if(this.quickRepliesHelper && this.quickRepliesHelper.checkQuery(query)) {
          foundHelpers.add(this.quickRepliesHelper);
        }
      } else if(!foundHelpers.size && this.chat.appSettings.emoji.suggest) { // emoji
        query = query.replace(/^\s*/, '');
        // * skip when the input ends with an emoji entity — regular emoji is handled by the
        // * emoticon-suggestion path above, custom emoji needs no suggestions at all
        const hasEmojiEntityAtEnd = entities.some((e) =>
          (e._ === 'messageEntityEmoji' || e._ === 'messageEntityCustomEmoji') &&
          (e.offset + e.length) === value.length
        );
        // * gate the SharedWorker emoji search: an explicit `:foo` query always searches, but a
        // * bare-word query (typing prose) is only searched once it can match the keyword index
        // * (minChars=2) — a 1-char bare token can never yield a result, so skip the round-trip.
        if(!hasEmojiEntityAtEnd && !value.match(/^\s*:(.+):\s*$/) && !value.match(/:[;!@#$%^&*()\-=|]/) && isPlausibleEmojiQuery(query, firstChar)) {
          foundHelpers.add(this.emojiHelper);
          this.emojiHelper.checkQuery(query, firstChar);
        }
      }
    }

    let canSendInline: boolean;
    if(!foundHelpers.size) {
      canSendInline = await this.chat.canSend('send_inline');
    }

    const inlineResult = this.checkInlineAutocomplete(value, canSendInline, foundHelpers.values().next().value);
    if(inlineResult === this.inlineHelper) {
      foundHelpers.add(this.inlineHelper);
    }

    this.autocompleteHelperController.hideOtherHelpers(foundHelpers);
  }

  // * guest-chat messages (a message that begins with a guest bot's @username) can be sent
  // * everywhere except broadcast channels and monoforums
  private canSendGuestChat() {
    return !this.chat.isBroadcast && !this.chat.isMonoforum;
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

    const allowGuestChat = this.canSendGuestChat();
    if(!foundHelper) {
      const inlineMatch = value.match(/^@([a-zA-Z\\d_]{3,32})\s/);
      // * a leading @guestbot is not an inline query — it's a plain, sendable guest-chat message,
      // * so keep the composer in normal send mode instead of opening the inline results panel
      if(inlineMatch && !(allowGuestChat && this.knownGuestBots.has(inlineMatch[1].toLowerCase()))) {
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

        this.inlineHelper.checkQuery(this.chat.peerId, username, query, canSendInline, allowGuestChat).then(({user, renderPromise, guestChat}) => {
          if(guestChat) {
            // * a guest bot was resolved for the first time — remember it so the next keystroke
            // * skips the inline path entirely, and drop back to normal send mode
            this.knownGuestBots.add(username.toLowerCase());
            needPlaceholder = false;
            delete this.messageInput.dataset.inlinePlaceholder;
            setPreloaderShow(false);
            return;
          }

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

  public static async showSlowModeTooltipIfNeeded({
    peerId,
    managers,
    element,
    container,
    sendingFew,
    textOverflow,
    emoticonsDropdown: _emoticonsDropdown
  }: {
    peerId: PeerId,
    managers: AppManagers,
    element: HTMLElement,
    container?: HTMLElement,
    sendingFew?: boolean,
    textOverflow?: boolean,
    emoticonsDropdown?: EmoticonsDropdown
  }) {
    if(peerId.isUser()) {
      return false;
    }

    _emoticonsDropdown ??= emoticonsDropdown;
    const chatId = peerId.toChatId();
    const chat = await managers.appChatsManager.getChat(chatId) as MTChat.channel;

    if(!chat.pFlags.slowmode_enabled) {
      return false;
    }

    let textElement: HTMLElement, onClose: () => void;
    if(textOverflow) {
      textElement = i18n('SlowmodeSendErrorTooLong');
    } else if(sendingFew) {
      textElement = i18n('SlowmodeSendError');
    } else if(await managers.appMessagesManager.hasOutgoingMessage(peerId)) {
      textElement = i18n('SlowmodeSendError');
    } else {
      const chatFull = await managers.appProfileManager.getChatFull(chatId) as ChatFull.channelFull;

      const getLeftDuration = () => Math.max(0, (chatFull.slowmode_next_send_date || 0) - tsNow(true));
      if(!getLeftDuration()) {
        return false;
      }

      const {element: timerElement, dispose} = slowModeTimer(getLeftDuration);
      onClose = dispose;
      textElement = i18n('SlowModeHint', [timerElement]);
    }

    showTooltip({
      element,
      vertical: 'top',
      container: container || element.parentElement,
      textElement,
      onClose: () => {
        onClose?.();
        _emoticonsDropdown.setIgnoreMouseOut('tooltip', false);
      },
      auto: true
    });

    _emoticonsDropdown.setIgnoreMouseOut('tooltip', true);

    return true;
  }

  public getDefaultParamsForSlowModeTooltip(): Parameters<typeof ChatInput['showSlowModeTooltipIfNeeded']>[0] {
    return {
      element: this.btnSendContainer,
      peerId: this.chat.peerId,
      managers: this.managers
    };
  }

  public showSlowModeTooltipIfNeeded(options: Partial<Parameters<typeof ChatInput['showSlowModeTooltipIfNeeded']>[0]> = {}) {
    return ChatInput.showSlowModeTooltipIfNeeded({
      ...this.getDefaultParamsForSlowModeTooltip(),
      ...options
    });
  }

  private onBtnSendClick = async(e: Event) => {
    cancelEvent(e);

    // This click is the release of a long-press that already opened the
    // record-mode menu — swallow it so it doesn't also start a recording.
    if(this.recordingController.consumeLongPressSuppression()) {
      return;
    }

    const isInputEmpty = this.isInputEmpty();
    const hasAnyRecorder = this.recordingController.hasAnyRecorder();
    if(this.chat.type === ChatType.Stories && isInputEmpty && !this.freezedFocused && this.canForwardStory) {
      this.forwardStoryCallback?.(e as MouseEvent);
      return;
    } else if(!hasAnyRecorder || this.recording || !isInputEmpty || this.forwarding || this.editMsgId || this.suggestedPost?.hasMedia) {
      if(this.recording) {
        this.recordingController.handleSendButtonClick();
      } else {
        this.sendMessage();
      }
    } else {
      // Empty input + not recording: LMB starts recording in the active media
      // type. Switching voice ↔ video is done via the button's context menu
      // (right-click / long-press), not by clicking.
      this.recordingController.startActive();
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
      this.chat.setMessageId({lastMsgId: this.replyToMsgId, pollOption: this.replyToPollOption});
      possibleBtnMenuContainer = this.replyElements?.menuContainer;
    } else if(this.helperType === 'edit') {
      this.chat.setMessageId({lastMsgId: this.editMsgId});
    } else if(this.helperType === 'suggested') {
      this.openSuggestPostPopup(this.suggestedPost);
    } else if(!this.helperType) {
      possibleBtnMenuContainer = this.webPageElements?.container;
    }

    if(IS_TOUCH_SUPPORTED && possibleBtnMenuContainer && !possibleBtnMenuContainer.classList.contains('active')) {
      this.openReplyLineMenuTouch(possibleBtnMenuContainer);
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
    showForwardPopup(
      forwarding,
      () => {
        selected = true;
      },
      undefined,
      () => {
        this.helperWaitingForward = false;

        if(!selected) {
          helperFunc();
        }
      }
    );
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
    const {peerId, threadId, monoforumThreadId} = await showReplyPickerPopup({
      excludeBotforums: true,
      ...(this.chat.isMonoforum ? {excludeMonoforums: true} : undefined)
    });
    this.appImManager.setInnerPeer({peerId, threadId, monoforumThreadId}).then(() => {
      replyTo.replyToMonoforumPeerId = monoforumThreadId;
      this.appImManager.chat.input.initMessageReply(replyTo);
    });
  }

  public getReplyTo(): ChatInputReplyTo {
    if(!this.replyToMsgId && !this.replyToStoryId) {
      return;
    }

    const {replyToMsgId, replyToStoryId, replyToQuote, replyToPollOption, replyToPeerId, replyToMonoforumPeerId} = this;
    return {replyToMsgId, replyToStoryId, replyToQuote, replyToPollOption, replyToPeerId, replyToMonoforumPeerId};
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
    else if(!this.recordingController?.hasVoiceRecorder() || this.recording || !isInputEmpty || this.forwarding || this.suggestedPost?.hasMedia) icon = this.chat.type === ChatType.Scheduled ? 'schedule' : 'send';
    else icon = this.recordingController.getActiveRecordingMediaType() === 'video' ? 'record-video' : 'record';

    ['send', 'record', 'record-video', 'edit', 'schedule', 'forward'].forEach((i) => {
      this.btnSend.classList.toggle(i, icon === i);
    });

    this.inputState.set({
      hasSendButton: icon === 'send',
      forwarding: accumulate(Object.values(this.forwarding || {}).map(messages => messages.length), 0)
    });

    if(this.btnScheduled) {
      this.btnScheduled.classList.toggle('show', isInputEmpty && this.chat.type !== ChatType.Scheduled);
    }

    if(this.btnToggleReplyMarkup) {
      this.btnToggleReplyMarkup.classList.toggle('show', isInputEmpty && this.chat.type !== ChatType.Scheduled);
    }

    if(this.btnSendGift) {
      this.btnSendGift.classList.toggle('show', isInputEmpty);
    }

    // External listeners (e.g. star badge animation) want the icon family, not
    // the audio/video sub-mode — collapse to 'record' so they don't need to
    // learn the new variant.
    this.onUpdateSendBtn?.(icon === 'record-video' ? 'record' : icon);
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

    this.inputState.set({starsBadgeInited: true});
  }

  public async setStarsAmount(starsAmount: number | undefined) {
    this.inputState.set({starsAmount});

    // TODO: review this `|| true` WTF?
    const params = await this.getPlaceholderParams(await this.chat?.canSend('send_plain') || true);
    this.updateMessageInputPlaceholder(params);
  }

  private throttledSetMessageCountToBadgeState = asyncThrottle(async(value: string) => {
    if(!value?.trim()) {
      this.inputState.set({messageCount: 0});
      return;
    }

    const config = await this.managers.apiManager.getConfig();
    const splitted = splitStringByLength(value, config.message_length_max);

    this.inputState.set({messageCount: splitted.length});
  }, 120);

  private getValueAndEntities(input: HTMLElement) {
    const {entities: apiEntities, value} = getRichValueWithCaret(input, true, false);
    const myEntities = parseEntities(value);
    const totalEntities = mergeEntities(apiEntities, myEntities);

    return {value, totalEntities};
  }

  public canPaste() {
    return this.inputState.canPaste();
  }

  public onMessageSent(clearInput = true, clearReply?: boolean) {
    if(!PEER_EXCEPTIONS.has(this.chat.type)) {
      this.managers.appMessagesManager.readAllHistory(this.chat.peerId, this.chat.threadId, true);
    }

    this.scheduleDate = undefined;
    this.scheduleRepeatPeriod = undefined;
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

  public static async sendMessageWithForward({
    sendingParams,
    inputField,
    chatType,
    forwarding,
    sendTextParams = {},
    forwardParams = {},
    slowModeParams,
    paidMessageInterceptor,
    text
  }: {
    sendingParams: MessageSendingParams,
    inputField?: InputFieldAnimated,
    chatType?: ChatType,
    forwarding?: ChatInput['forwarding'],
    sendTextParams?: Parameters<AppMessagesManager['sendText']>[0],
    forwardParams?: Pick<Parameters<AppMessagesManager['forwardMessages']>[0], 'dropAuthor' | 'dropCaptions'>,
    slowModeParams: Pick<Parameters<typeof ChatInput['showSlowModeTooltipIfNeeded']>[0], 'peerId' | 'managers' | 'element'>,
    paidMessageInterceptor?: PaidMessagesInterceptor,
    text?: LocalTextWithOptionalEntities
  }) {
    const {value, entities} = inputField ?
      getRichValueWithCaret(inputField.input, true, false) :
      text ?
        {value: text.text, entities: text.entities || []} :
        {value: '', entities: [] as MessageEntity[]};

    const trimmedValue = value.trim();

    let messageCount = 0;
    if(chatType !== ChatType.Scheduled) {
      if(forwarding) {
        for(const fromPeerId in forwarding) {
          messageCount += forwarding[fromPeerId].length;
        }
      }

      const config = await rootScope.managers.apiManager.getConfig();
      const MAX_LENGTH = config.message_length_max;
      const textOverflow = value.length > MAX_LENGTH;

      messageCount += trimmedValue ?
        splitStringByLength(value, MAX_LENGTH).length :
        0;

      if(await this.showSlowModeTooltipIfNeeded({
        ...slowModeParams,
        sendingFew: messageCount > 1,
        textOverflow
      })) {
        return false;
      }
    }

    let preparedPaymentResult: Awaited<ReturnType<PaidMessagesInterceptor['prepareStarsForPayment']>>;
    if(messageCount) {
      const promise = paidMessageInterceptor ?
        paidMessageInterceptor.prepareStarsForPayment(messageCount) :
        PaidMessagesInterceptor.prepareStarsForPayment({peerId: sendingParams.peerId, messageCount});
      preparedPaymentResult = await promise;
    }

    if(preparedPaymentResult === PAYMENT_REJECTED) return false;
    sendingParams.confirmedPaymentResult = preparedPaymentResult;

    if(trimmedValue || sendingParams.suggestedPost?.hasMedia) {
      rootScope.managers.appMessagesManager.sendText({
        ...sendTextParams,
        ...sendingParams,
        text: value,
        entities
      });
    }

    forwarding = copy(forwarding);
    for(const fromPeerId in forwarding) {
      const mids = forwarding[fromPeerId];
      if(mids.length === 1) {
        const msg = await rootScope.managers.appMessagesManager.getMessageByPeer(
          fromPeerId.toPeerId(),
          mids[0]
        ) as Message.message;
        if(msg?.pFlags?.fakeForSavedMusic) {
          const doc = (msg.media as MessageMedia.messageMediaDocument).document as MyDocument;
          rootScope.managers.appMessagesManager.sendOther({
            ...sendingParams,
            inputMedia: {_: 'inputMediaDocument', id: getDocumentInput(doc), pFlags: {}}
          });
          rootScope.managers.appMessagesManager.deleteMessageFromHistoryStorage(
            fromPeerId.toPeerId(),
            mids[0]
          );
          continue;
        }
      }

      rootScope.managers.appMessagesManager.forwardMessages({
        ...forwardParams,
        ...sendingParams,
        fromPeerId: fromPeerId.toPeerId(),
        mids
      }).catch(async(err: ApiError) => {
        if(err.type === 'VOICE_MESSAGES_FORBIDDEN') {
          toastNew({
            langPackKey: 'Chat.SendVoice.PrivacyError',
            langPackArguments: [await wrapPeerTitle({peerId: sendingParams.peerId})]
          });
        }
      });
    }

    return {value, messageCount};
  }

  public async sendMessage(force = false) {
    const {editMsgId, chat} = this;

    // Support-fork fallback: typing "/close" closes the customer's open CRM ticket
    // instead of sending a literal message. Reliable when the floating CRM plate is
    // crowded out by other topbar plates (pinned message / translate). Never leak the
    // raw "/close" text to the customer — return early in every branch below.
    if(!editMsgId && chat.peerId?.isUser()) {
      const {value} = getRichValueWithCaret(this.messageInputField.input, true, false);
      if(value.trim().toLowerCase() === '/close') {
        const crmTicket = chat.topbar?.plates?.crmTicket;
        if(crmTicket?.getTicket()?.status === 'open') {
          this.clearInput();
          crmTicket.close();
        } else {
          toastNew({langPackKey: 'Crm.Ticket.NoOpen'});
        }
        return;
      }
    }

    if(chat.type === ChatType.Scheduled && !force && !editMsgId) {
      this.scheduleSending();
      return;
    }

    const {peerId} = chat;
    const {noWebPage} = this;
    const sendingParams = this.chat.getMessageSendingParams();

    if(!editMsgId) {
      const result = await ChatInput.sendMessageWithForward({
        inputField: this.messageInputField,
        sendingParams,
        chatType: chat.type,
        forwarding: this.forwarding,
        forwardParams: this.forwarding ? {
          dropAuthor: this.forwardElements && this.forwardElements.hideSender.checkboxField.checked,
          dropCaptions: this.isDroppingCaptions()
        } : undefined,
        sendTextParams: {
          noWebPage,
          webPage: this.getWebPagePromise ? undefined : this.willSendWebPage,
          webPageOptions: this.webPageOptions,
          invertMedia: this.willSendWebPage ? this.invertMedia : undefined,
          clearDraft: true
        },
        slowModeParams: this.getDefaultParamsForSlowModeTooltip(),
        paidMessageInterceptor: this.paidMessageInterceptor
      });

      if(!result || !result.messageCount) {
        return;
      }

      if(PEER_EXCEPTIONS.has(this.chat.type)) {
        this.onMessageSent(true);
      } else {
        this.onMessageSent(false, false);
      }
      if(this.suggestedPost) this.clearHelper();
      // this.onMessageSent();

      if(!result.value) {
        this.onMessageSent();
      }

      return;
    }

    const {value, entities} = getRichValueWithCaret(this.messageInputField.input, true, false);
    const trimmedValue = value.trim();
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
          invertMedia: this.willSendWebPage ? this.invertMedia : this.editMessage?.pFlags?.invert_media
        }
      );

      this.onMessageSent();
    } else {
      PopupElement.createPopup(PopupDeleteMessages, peerId, [editMsgId], chat.type);
      return;
    }
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

    if(await this.showSlowModeTooltipIfNeeded({
      peerId: this.chat.peerId,
      managers: this.managers,
      element: target,
      container: this.btnSendContainer.parentElement
    })) {
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
    this.inputState.set({isSuggestingUneditablePostChange});
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

    let {replyToMsgId, replyToQuote, replyToPeerId, replyToPollOption} = replyTo;
    replyToPeerId ??= this.chat.peerId;
    let message = await (
      replyToPeerId ?
        this.managers.appMessagesManager.getMessageByPeer(replyToPeerId, replyToMsgId) :
        this.chat.getMessage(replyToMsgId)
    );

    this.setSavedReplyToPollOption(replyToMsgId, replyToPollOption, message);

    const f = () => {
      let title: HTMLElement, subtitle: string | HTMLElement;
      if(!message) { // load missing replying message
        title = i18n('Loading');

        this.managers.appMessagesManager.reloadMessage(replyToPeerId, replyToMsgId).then((_message) => {
          if(!deepEqual(this.getReplyTo(), replyTo)) {
            return;
          }

          message = _message;

          if(!message) {
            this.clearHelper('reply');
          } else {
            this.setSavedReplyToPollOption(replyToMsgId, replyToPollOption, message);

            f();
          }
        });
      } else if(replyToPollOption && this.savedReplyToPollOption) {
        title = i18n('Chat.Poll.ReplyToOption');
      } else {
        const peerId = message.fromId;
        title = new PeerTitle({
          peerId: message.fromId,
          dialog: false,
          fromName: !peerId ? getFwdFromName((message as Message.message).fwd_from) : undefined
        }).element;

        title = i18n(replyToQuote ? 'ReplyToQuote' : 'ReplyTo', [title]);
      }

      let quote: LocalTextWithOptionalEntities;

      if(replyToPollOption && this.savedReplyToPollOption) {
        quote = this.savedReplyToPollOption.text;
      } else if(message) {
        quote = replyToQuote;
      }

      const newReply = this.setTopInfo({
        type: 'reply',
        callerFunc: f,
        title,
        subtitle,
        message,
        setColorPeerId: message?.fromId,
        quote
      });
      this.setReplyTo(replyTo);

      this.replyElements.replyInAnother.element.classList.toggle('hide', !this.chat.bubbles.canForward(message as Message.message));
      this.replyElements.doNotReply.element.classList.toggle('hide', !!replyToQuote);
      this.replyElements.doNotQuote.element.classList.toggle('hide', !replyToQuote);
      this.setCurrentHover(this.replyHover, newReply);
    };
    f();
  }

  private async setSavedReplyToPollOption(msgId?: number, option?: Uint8Array, message?: Message) {
    if(!msgId || !option || message?._ !== 'message' || message?.media?._ !== 'messageMediaPoll') {
      this.savedReplyToPollOption = undefined;
      return;
    }

    const pollOption = message.media.poll.answers.find(answer => answer._ === 'pollAnswer' && compareUint8Arrays(option, answer.option));

    if(!pollOption) {
      this.savedReplyToPollOption = undefined;
      return;
    }

    this.savedReplyToPollOption = {msgId, option, text: pollOption.text};
  }

  private setCurrentHover(dropdownHover?: DropdownHover, newReply?: HTMLElement) {
    if(this.currentHover) {
      this.currentHover.toggle(false);
    }

    this.hoverListenerSetter.removeAll();
    this.currentHover = dropdownHover;
    dropdownHover?.attachButtonListener(newReply, this.listenerSetter);
  }

  private createReplyLineHover(menu: HTMLElement) {
    const hover = new DropdownHover({element: menu});

    hover.addEventListener('open', () => {
      if(!menu.parentElement) {
        getOverlayRoot().append(menu);
      }
      this.positionReplyLineMenu(menu);
    });

    hover.addEventListener('closed', () => {
      menu.remove();
    });

    return hover;
  }

  private positionReplyLineMenu(menu: HTMLElement) {
    const trigger = this.replyElements.content?.querySelector('.reply') as HTMLElement || this.replyElements.iconBtn;
    if(!trigger) return;
    positionMenuTrigger(trigger, menu, 'top-right', {top: 8, bottom: 8, left: 8, right: 8});
  }

  private openReplyLineMenuTouch(menu: HTMLElement) {
    if(!menu.parentElement) {
      getOverlayRoot().append(menu);
    }
    this.positionReplyLineMenu(menu);
    contextMenuController.openBtnMenu(menu, () => {
      setTimeout(() => {
        if(!menu.classList.contains('active')) menu.remove();
      }, 300);
    });
  }

  public setReplyTo(replyTo: ChatInputReplyTo) {
    const {replyToMsgId, replyToQuote, replyToPollOption, replyToPeerId, replyToStoryId, replyToMonoforumPeerId} = replyTo || {};
    this.replyToMsgId = replyToMsgId;
    this.replyToStoryId = replyToStoryId;
    this.replyToQuote = replyToQuote;
    this.replyToPollOption = replyToPollOption;
    this.replyToPeerId = replyToPeerId;
    this.replyToMonoforumPeerId = replyToMonoforumPeerId;
    this.center(true);
  }

  public clearHelper(type?: ChatInputHelperType, willHaveHelper?: boolean) {
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
      this.inputState.set({isSuggestingUneditablePostChange: false});
    }

    this.inputState.set({
      isEditing: false,
      isSuggesting: false
    });

    this.editMsgId = this.editMessage = undefined;
    this.helperType = this.helperFunc = undefined;
    this.setCurrentHover();
    this.saveDraftDebounced();

    if(this.restoreInputLock) {
      this.restoreInputLock();
      this.restoreInputLock = undefined;
    }

    if(
      this.chat.container &&
      this.chat.container.classList.contains('is-helper-active') &&
      !willHaveHelper
    ) {
      appNavigationController.removeByType('input-helper');
      this.chat.container.classList.remove('is-helper-active');
      this.helperVisible = false;
      this.notifyChatInputHeight();
      this.t();
    }

    if(!type) this.inputState.set({isReplying: false});
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
      this.clearHelper(type, true);
      this.helperType = type;
      this.helperFunc = callerFunc;
    }

    this.inputState.set({
      isEditing: type === 'edit',
      isSuggesting: type === 'suggested'
    });

    this.btnSuggestPost?.classList.toggle('hide', !this.canShowSuggestPostButton(true));

    const replyParent = this.replyElements.content;
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

    setPeerColorToElement({peerId: setColorPeerId, element: replyParent});

    if(haveReply) {
      oldReply.replaceWith(container);
    } else {
      replyParent.lastElementChild.before(container);
    }

    if(!this.chat.container.classList.contains('is-helper-active')) {
      this.chat.container.classList.add('is-helper-active');
      this.helperVisible = true;
      this.notifyChatInputHeight();
      this.t();
    }

    if(!IS_MOBILE) {
      appNavigationController.pushItem(this.inputHelperNavigationItem = {
        type: 'input-helper',
        onPop: () => {
          this.onHelperCancel();
        },
        context: this.chat
      });
    }

    if(input !== undefined) {
      this.setInputValue(input);
    }

    setTimeout(() => {
      this.updateSendBtn();
    }, 0);

    this.inputState.set({isReplying: true});

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

      if(this.inputState.store.isSuggestingUneditablePostChange) {
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

  private async tryGetEditMediaElementFromChat() {
    const groupedId = this.editMessage?.grouped_id;
    const groupedMessages = groupedId ? await this.managers.appMessagesManager.getMessagesByGroupedId(groupedId) : undefined;

    const mainMessage = groupedId ? getMainGroupedMessage(groupedMessages) : this.editMessage;
    const mainMessageMid = mainMessage?.mid;

    if(!mainMessage) return;
    const bubble = this.chat.bubbles.getBubble(mainMessage.peerId, mainMessageMid);
    if(!bubble) return;

    let mediaElement: Element;
    const mediaSelectors = ['.media-video', '.media-container-aspecter .media-photo', '.media-photo']; // Prioritize video over photo, as there might be both (probably the photo is the thumbnail)
    const getMedia = (element: Element) => mediaSelectors.map(selector => element.querySelector(selector)).filter(Boolean)[0];
    if(groupedId) {
      const groupedItem = bubble.querySelector(`.grouped-item[data-mid="${this.editMessage.mid}"]`);
      mediaElement = getMedia(groupedItem);
    } else {
      mediaElement = getMedia(bubble);
    }

    if(!(mediaElement instanceof HTMLImageElement || mediaElement instanceof HTMLVideoElement)) return;

    const bcr = mediaElement.getBoundingClientRect();
    if(!bcr.width || !bcr.height) return;

    const bubblesBcr = this.chat.bubbles.container.getBoundingClientRect();

    if(bcr.top < bubblesBcr.top || bcr.bottom > bubblesBcr.bottom) return;

    return mediaElement;
  }

  private async editMediaWithEditor(): Promise<void> {
    if(!this.editMessage) return;

    const media = this.editMessage.media;

    const mediaElement = await this.tryGetEditMediaElementFromChat();

    const payload = getOpenMediaPayload(media);
    if(!payload) return;

    const middlewareHelper = this.getMiddleware().create();
    const middleware = middlewareHelper.get();

    let downloadPromise: DownloadBlob;
    const {result, waitBeforeCleanup} = await this.watchDownloadProgress({
      getDownloadPromise: () => (downloadPromise = payload.downloadMediaBlob()),
      getResult: async() => {
        const mediaBlob = await downloadPromise;
        const mediaUrl = await apiManagerProxy.invoke('createObjectURL', mediaBlob);
        let createdMediaElement: HTMLVideoElement | HTMLImageElement;
        try {
          createdMediaElement = !mediaElement ? await payload.createCanvasSource(mediaUrl, middleware) : undefined;
        } catch{}

        return {mediaBlob, mediaUrl, createdMediaElement};
      },
      middleware,
      cancel: () => middlewareHelper.destroy()
    });

    if(!result) return;

    if(!middleware()) return;

    const {mediaBlob, mediaUrl, createdMediaElement} = result;

    if(!mediaElement && !createdMediaElement) return;

    const {openMediaEditorFromMedia, openMediaEditorFromMediaNoAnimation} = await import('@components/mediaEditor');

    if(!middleware()) return;

    const openEditor = mediaElement ? openMediaEditorFromMedia : openMediaEditorFromMediaNoAnimation;
    const usedMediaElement = mediaElement || createdMediaElement;

    waitBeforeCleanup().then(() => {
      middlewareHelper.destroy();
    });

    openEditor({
      managers: this.managers,
      mediaSrc: mediaUrl,
      mediaType: payload.mediaType,
      getMediaBlob: () => Promise.resolve(mediaBlob),
      rect: usedMediaElement.getBoundingClientRect(),
      animatedCanvasSize: getSourceSize(usedMediaElement),
      source: usedMediaElement,
      onClose: () => { },
      onEditFinish: async(result) => {
        const popup = new PopupNewMedia(this.chat, [
          {
            file: new File([mediaBlob], payload.fileName, {type: mediaBlob.type}),
            editResult: result
          }
        ], 'media');

        popup.show(false);
      },
      canImageResultInGIF: !this.isEditingMediaFromAlbum()
    });
  }

  private async watchDownloadProgress<T>({getDownloadPromise, getResult, middleware, cancel}: WatchDownloadProgressArgs<T>) {
    const minProgress = 0.1;

    let result: T, wasLoading = false, timeout: number, waitBeforeCleanup: () => Promise<void> = async() => {};

    try {
      const downloadPromise = getDownloadPromise();

      middleware.onDestroy(() => {
        downloadPromise.cancel?.();

        if(!wasLoading) return;
        this.attachMenu.feedProps({
          isLoading: false,
          loadingProgress: undefined,
          onCancel: undefined
        });
      });

      downloadPromise.addNotifyListener((details: {done: number, total: number}) => {
        if(!middleware()) return;

        this.attachMenu.feedProps({
          loadingProgress: Math.max(minProgress, details.done / details.total) || minProgress
        });
      });

      // Late start in case the media is cached
      timeout = self.setTimeout(() => {
        wasLoading = true;
        this.attachMenu.feedProps({
          isLoading: true,
          loadingProgress: minProgress,
          onCancel: () => {
            cancel();
          }
        });
      }, 120);

      result = await getResult();
    } finally {
      self.clearTimeout(timeout);

      if(wasLoading) {
        this.attachMenu.feedProps({
          loadingProgress: 1
        });

        await pause(150); // wait for the loading animation to animate to full

        waitBeforeCleanup = () => pause(400);
      }
    }

    return {result, waitBeforeCleanup};
  }

  private isEditingMediaFromAlbum() {
    return !!this.editMessage?.grouped_id;
  }
}

function getOpenMediaPayload(media: MessageMedia | null | undefined) {
  if(!media) return;
  if(media._ === 'messageMediaPhoto' && media.photo?._ === 'photo') return getOpenMediaPhotoPayload(media.photo);
  if(media._ === 'messageMediaDocument' && media.document?._ === 'document') return getOpenMediaVideoPayload(media.document);
}

function canEditMediaWithEditor(media: MessageMedia) {
  return !!getOpenMediaPayload(media);
}

type OpenMediaPayload = {
  fileName: string;
  mediaType: MediaEditorProps['mediaType']
  createCanvasSource: (url: string, middleware: Middleware) => Promise<HTMLImageElement | HTMLVideoElement>;
  downloadMediaBlob: () => DownloadBlob;
};

function getOpenMediaPhotoPayload(photo: Photo.photo): OpenMediaPayload {
  const photoSizes = photo.sizes.slice().filter((size) => (size as PhotoSize.photoSize).w) as PhotoSize.photoSize[];
  photoSizes.sort((a, b) => b.size - a.size);
  const fullPhotoSize = photoSizes?.[0];

  if(!fullPhotoSize?.w || !fullPhotoSize?.h) return;

  return {
    fileName: tryGetFileName(() => getFileNameByLocation(getPhotoDownloadOptions(photo, fullPhotoSize).location)),
    mediaType: 'image',
    createCanvasSource: createImageSource,
    downloadMediaBlob: () =>
      appDownloadManager.downloadMedia({
        media: photo,
        thumb: fullPhotoSize
      })
  };
}

function getOpenMediaVideoPayload(document: Document.document): OpenMediaPayload {
  if(!document.size || document.size > MAX_EDITABLE_VIDEO_SIZE) return;

  return {
    fileName: tryGetFileName(() => document.file_name || getFileNameByLocation(getDocumentDownloadOptions(document).location)),
    mediaType: 'video',
    createCanvasSource: createVideoSource,
    downloadMediaBlob: () =>
      appDownloadManager.downloadMedia({
        media: document,
        thumb: undefined
      })
  };
}

async function createImageSource(url: string) {
  const img = new Image();
  await renderImageFromUrlPromise(img, url);
  return img;
}

async function createVideoSource(url: string, middleware: Middleware) {
  const video = createVideo({middleware});

  video.playsInline = true;
  video.src = url;
  video.controls = false;
  video.muted = true;
  video.preload = 'auto';

  const deferred = deferredPromise<void>();
  video.requestVideoFrameCallback(() => {
    deferred.resolve();
  });

  await onMediaLoad(video);

  await deferred;

  return video;
}

function getSourceSize(source: HTMLVideoElement | HTMLImageElement): NumberPair {
  return source instanceof HTMLVideoElement ? [source.videoWidth, source.videoHeight] : [source.naturalWidth, source.naturalHeight];
}

function tryGetFileName(fn: () => string) {
  const defaultFileName = 'edited-media';
  try {
    return fn() || defaultFileName;
  } catch{
    return 'edited-media';
  }
}
