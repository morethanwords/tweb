/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppNotificationsManager } from '../../lib/appManagers/appNotificationsManager';
import type { AppChatsManager } from '../../lib/appManagers/appChatsManager';
import type { AppDocsManager, MyDocument } from "../../lib/appManagers/appDocsManager";
import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type { AppPeersManager } from '../../lib/appManagers/appPeersManager';
import type { AppWebPagesManager } from "../../lib/appManagers/appWebPagesManager";
import type { AppImManager } from '../../lib/appManagers/appImManager';
import type { AppDraftsManager, MyDraftMessage } from '../../lib/appManagers/appDraftsManager';
import type { AppEmojiManager } from '../../lib/appManagers/appEmojiManager';
import type { ServerTimeManager } from '../../lib/mtproto/serverTimeManager';
import type { AppUsersManager } from '../../lib/appManagers/appUsersManager';
import type { AppInlineBotsManager } from '../../lib/appManagers/appInlineBotsManager';
import type { AppMessagesIdsManager } from '../../lib/appManagers/appMessagesIdsManager';
import type Chat from './chat';
import Recorder from '../../../public/recorder.min';
import { isTouchSupported } from "../../helpers/touchSupport";
import apiManager from "../../lib/mtproto/mtprotoworker";
//import Recorder from '../opus-recorder/dist/recorder.min';
import opusDecodeController from "../../lib/opusDecodeController";
import RichTextProcessor from "../../lib/richtextprocessor";
import { ButtonMenuItemOptions } from '../buttonMenu';
import emoticonsDropdown from "../emoticonsDropdown";
import PopupCreatePoll from "../popups/createPoll";
import PopupForward from '../popups/forward';
import PopupNewMedia from '../popups/newMedia';
import { toast } from "../toast";
import { wrapReply } from "../wrappers";
import InputField from '../inputField';
import { MessageEntity, DraftMessage, WebPage, Message } from '../../layer';
import StickersHelper from './stickersHelper';
import ButtonIcon from '../buttonIcon';
import ButtonMenuToggle from '../buttonMenuToggle';
import ListenerSetter from '../../helpers/listenerSetter';
import Button from '../button';
import PopupSchedule from '../popups/schedule';
import SendMenu from './sendContextMenu';
import rootScope from '../../lib/rootScope';
import PopupPinMessage from '../popups/unpinMessage';
import { tsNow } from '../../helpers/date';
import appNavigationController from '../appNavigationController';
import { isMobile, isMobileSafari } from '../../helpers/userAgent';
import { i18n, join } from '../../lib/langPack';
import { generateTail } from './bubbles';
import findUpClassName from '../../helpers/dom/findUpClassName';
import ButtonCorner from '../buttonCorner';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import { cancelEvent } from '../../helpers/dom/cancelEvent';
import cancelSelection from '../../helpers/dom/cancelSelection';
import { attachClickEvent } from '../../helpers/dom/clickEvent';
import getRichValue from '../../helpers/dom/getRichValue';
import isInputEmpty from '../../helpers/dom/isInputEmpty';
import isSendShortcutPressed from '../../helpers/dom/isSendShortcutPressed';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import { MarkdownType, markdownTags } from '../../helpers/dom/getRichElementValue';
import getRichValueWithCaret from '../../helpers/dom/getRichValueWithCaret';
import EmojiHelper from './emojiHelper';
import setRichFocus from '../../helpers/dom/setRichFocus';
import CommandsHelper from './commandsHelper';
import AutocompleteHelperController from './autocompleteHelperController';
import AutocompleteHelper from './autocompleteHelper';
import MentionsHelper from './mentionsHelper';
import fixSafariStickyInput from '../../helpers/dom/fixSafariStickyInput';
import { emojiFromCodePoints } from '../../vendor/emoji';
import ReplyKeyboard from './replyKeyboard';
import InlineHelper from './inlineHelper';
import debounce from '../../helpers/schedulers/debounce';
import noop from '../../helpers/noop';
import { putPreloader } from '../misc';
import SetTransition from '../singleTransition';
import PeerTitle from '../peerTitle';
import { fastRaf } from '../../helpers/schedulers';
import PopupDeleteMessages from '../popups/deleteMessages';
import fixSafariStickyInputFocusing, { IS_STICKY_INPUT_BUGGED } from '../../helpers/dom/fixSafariStickyInputFocusing';
import { copy } from '../../helpers/object';

const RECORD_MIN_TIME = 500;
const POSTING_MEDIA_NOT_ALLOWED = 'Posting media content isn\'t allowed in this group.';

type ChatInputHelperType = 'edit' | 'webpage' | 'forward' | 'reply';

export default class ChatInput {
  // private static AUTO_COMPLETE_REG_EXP = /(\s|^)((?::|.)(?!.*[:@]).*|(?:[@\/]\S*))$/;
  private static AUTO_COMPLETE_REG_EXP = /(\s|^)((?:(?:@|^\/)\S*)|(?::|^[^:@\/])(?!.*[:@\/]).*)$/;
  public messageInput: HTMLElement;
  public messageInputField: InputField;
  private fileInput: HTMLInputElement;
  private inputMessageContainer: HTMLDivElement;
  private btnSend: HTMLButtonElement;
  private btnCancelRecord: HTMLButtonElement;
  private lastUrl = '';
  private lastTimeType = 0;

  public chatInput: HTMLElement;
  private inputContainer: HTMLElement;
  public rowsWrapper: HTMLDivElement;
  private newMessageWrapper: HTMLDivElement;
  private btnToggleEmoticons: HTMLButtonElement;
  private btnToggleReplyMarkup: HTMLButtonElement;
  private btnSendContainer: HTMLDivElement;

  private replyKeyboard: ReplyKeyboard;

  private attachMenu: HTMLButtonElement;
  private attachMenuButtons: (ButtonMenuItemOptions & {verify: (peerId: number) => boolean})[];

  private sendMenu: SendMenu;

  private replyElements: {
    container: HTMLElement,
    cancelBtn: HTMLButtonElement
  } = {} as any;

  private getWebPagePromise: Promise<void>;
  private willSendWebPage: WebPage = null;
  private forwarding: {[fromPeerId: number]: number[]};
  public replyToMsgId: number;
  public editMsgId: number;
  private noWebPage: true;
  public scheduleDate: number;
  public sendSilent: true;

  private recorder: any;
  public recording = false;
  private recordCanceled = false;
  private recordTimeEl: HTMLElement;
  private recordRippleEl: HTMLElement;
  private recordStartTime = 0;

  // private scrollTop = 0;
  // private scrollOffsetTop = 0;
  // private scrollDiff = 0;

  public helperType: Exclude<ChatInputHelperType, 'webpage'>;
  private helperFunc: () => void;
  private helperWaitingForward: boolean;

  public willAttachType: 'document' | 'media';

  private lockRedo = false;
  private canRedoFromHTML = '';
  private readonly undoHistory: string[] = [];
  private readonly executedHistory: string[] = [];
  private canUndoFromHTML = '';

  private autocompleteHelperController: AutocompleteHelperController;
  private stickersHelper: StickersHelper;
  private emojiHelper: EmojiHelper;
  private commandsHelper: CommandsHelper;
  private mentionsHelper: MentionsHelper;
  private inlineHelper: InlineHelper;
  private listenerSetter: ListenerSetter;

  private pinnedControlBtn: HTMLButtonElement;

  private goDownBtn: HTMLButtonElement;
  private goDownUnreadBadge: HTMLElement;
  private goMentionBtn: HTMLButtonElement;
  private goMentionUnreadBadge: HTMLSpanElement;
  private btnScheduled: HTMLButtonElement;

  private btnPreloader: HTMLButtonElement;

  private saveDraftDebounced: () => void;

  private fakeRowsWrapper: HTMLDivElement;
  private fakePinnedControlBtn: HTMLElement;

  private previousQuery: string;

  constructor(private chat: Chat, 
    private appMessagesManager: AppMessagesManager, 
    private appMessagesIdsManager: AppMessagesIdsManager, 
    private appDocsManager: AppDocsManager, 
    private appChatsManager: AppChatsManager, 
    private appPeersManager: AppPeersManager, 
    private appWebPagesManager: AppWebPagesManager, 
    private appImManager: AppImManager, 
    private appDraftsManager: AppDraftsManager, 
    private serverTimeManager: ServerTimeManager, 
    private appNotificationsManager: AppNotificationsManager,
    private appEmojiManager: AppEmojiManager,
    private appUsersManager: AppUsersManager,
    private appInlineBotsManager: AppInlineBotsManager
  ) {
    this.listenerSetter = new ListenerSetter();
  }

  public construct() {
    this.chatInput = document.createElement('div');
    this.chatInput.classList.add('chat-input');
    this.chatInput.style.display = 'none';

    this.inputContainer = document.createElement('div');
    this.inputContainer.classList.add('chat-input-container');

    this.rowsWrapper = document.createElement('div');
    this.rowsWrapper.classList.add('rows-wrapper', 'chat-input-wrapper');

    const tail = generateTail();
    this.rowsWrapper.append(tail);

    const fakeRowsWrapper = this.fakeRowsWrapper = document.createElement('div');
    fakeRowsWrapper.classList.add('fake-wrapper', 'fake-rows-wrapper');

    const fakeSelectionWrapper = document.createElement('div');
    fakeSelectionWrapper.classList.add('fake-wrapper', 'fake-selection-wrapper');

    this.inputContainer.append(this.rowsWrapper, fakeRowsWrapper, fakeSelectionWrapper);
    this.chatInput.append(this.inputContainer);

    this.goDownBtn = ButtonCorner({icon: 'arrow_down', className: 'bubbles-corner-button bubbles-go-down hide'});
    this.inputContainer.append(this.goDownBtn);

    attachClickEvent(this.goDownBtn, (e) => {
      cancelEvent(e);
      this.chat.bubbles.onGoDownClick();
    }, {listenerSetter: this.listenerSetter});

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
  }

  public constructPeerHelpers() {
    this.replyElements.container = document.createElement('div');
    this.replyElements.container.classList.add('reply-wrapper');

    this.replyElements.cancelBtn = ButtonIcon('close reply-cancel');

    this.replyElements.container.append(this.replyElements.cancelBtn);

    this.newMessageWrapper = document.createElement('div');
    this.newMessageWrapper.classList.add('new-message-wrapper');

    this.btnToggleEmoticons = ButtonIcon('none toggle-emoticons', {noRipple: true});

    this.inputMessageContainer = document.createElement('div');
    this.inputMessageContainer.classList.add('input-message-container');

    if(this.chat.type === 'chat') {
      this.goDownUnreadBadge = document.createElement('span');
      this.goDownUnreadBadge.classList.add('badge', 'badge-24', 'badge-primary');
      this.goDownBtn.append(this.goDownUnreadBadge);

      this.goMentionBtn = ButtonCorner({icon: 'mention', className: 'bubbles-corner-button bubbles-go-mention'});
      this.goMentionUnreadBadge = document.createElement('span');
      this.goMentionUnreadBadge.classList.add('badge', 'badge-24', 'badge-primary');
      this.goMentionBtn.append(this.goMentionUnreadBadge);
      this.inputContainer.append(this.goMentionBtn);

      attachClickEvent(this.goMentionBtn, (e) => {
        cancelEvent(e);
        this.appMessagesManager.goToNextMention(this.chat.peerId);
      }, {listenerSetter: this.listenerSetter});

      this.btnScheduled = ButtonIcon('scheduled btn-scheduled float hide', {noRipple: true});

      attachClickEvent(this.btnScheduled, (e) => {
        this.appImManager.openScheduled(this.chat.peerId);
      }, {listenerSetter: this.listenerSetter});

      this.listenerSetter.add(rootScope)('scheduled_new', (e) => {
        const peerId = e.peerId;

        if(this.chat.peerId !== peerId) {
          return;
        }

        this.btnScheduled.classList.remove('hide');
      });

      this.listenerSetter.add(rootScope)('scheduled_delete', (e) => {
        const peerId = e.peerId;

        if(this.chat.peerId !== peerId) {
          return;
        }

        this.appMessagesManager.getScheduledMessages(this.chat.peerId).then(value => {
          this.btnScheduled.classList.toggle('hide', !value.length);
        });
      });

      this.btnToggleReplyMarkup = ButtonIcon('botcom toggle-reply-markup float hide', {noRipple: true});
      this.replyKeyboard = new ReplyKeyboard({
        appendTo: this.rowsWrapper,
        listenerSetter: this.listenerSetter,
        appMessagesManager: this.appMessagesManager,
        btnHover: this.btnToggleReplyMarkup
      });
      this.listenerSetter.add(this.replyKeyboard)('open', () => this.btnToggleReplyMarkup.classList.add('active'));
      this.listenerSetter.add(this.replyKeyboard)('close', () => this.btnToggleReplyMarkup.classList.remove('active'));
    }

    this.attachMenuButtons = [{
      icon: 'image',
      text: 'Chat.Input.Attach.PhotoOrVideo',
      onClick: () => {
        this.fileInput.value = '';
        this.fileInput.setAttribute('accept', 'image/*, video/*');
        this.willAttachType = 'media';
        this.fileInput.click();
      },
      verify: (peerId: number) => peerId > 0 || this.appChatsManager.hasRights(peerId, 'send_media')
    }, {
      icon: 'document',
      text: 'Chat.Input.Attach.Document',
      onClick: () => {
        this.fileInput.value = '';
        this.fileInput.removeAttribute('accept');
        this.willAttachType = 'document';
        this.fileInput.click();
      },
      verify: (peerId: number) => peerId > 0 || this.appChatsManager.hasRights(peerId, 'send_media')
    }, {
      icon: 'poll',
      text: 'Poll',
      onClick: () => {
        new PopupCreatePoll(this.chat).show();
      },
      verify: (peerId: number) => peerId < 0 && this.appChatsManager.hasRights(peerId, 'send_polls')
    }];

    this.attachMenu = ButtonMenuToggle({noRipple: true, listenerSetter: this.listenerSetter}, 'top-left', this.attachMenuButtons);
    this.attachMenu.classList.add('attach-file', 'tgico-attach');
    this.attachMenu.classList.remove('tgico-more');

    //this.inputContainer.append(this.sendMenu);

    this.recordTimeEl = document.createElement('div');
    this.recordTimeEl.classList.add('record-time');

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';

    this.newMessageWrapper.append(...[this.btnToggleEmoticons, this.inputMessageContainer, this.btnScheduled, this.btnToggleReplyMarkup, this.attachMenu, this.recordTimeEl, this.fileInput].filter(Boolean));

    this.rowsWrapper.append(this.replyElements.container);
    this.autocompleteHelperController = new AutocompleteHelperController();
    this.stickersHelper = new StickersHelper(this.rowsWrapper, this.autocompleteHelperController);
    this.emojiHelper = new EmojiHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.appEmojiManager);
    this.commandsHelper = new CommandsHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.chat.appProfileManager, this.chat.appUsersManager);
    this.mentionsHelper = new MentionsHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.chat.appProfileManager, this.chat.appUsersManager);
    this.inlineHelper = new InlineHelper(this.rowsWrapper, this.autocompleteHelperController, this.chat, this.appUsersManager, this.appInlineBotsManager);
    this.rowsWrapper.append(this.newMessageWrapper);

    this.btnCancelRecord = ButtonIcon('delete danger btn-circle z-depth-1 btn-record-cancel');

    this.btnSendContainer = document.createElement('div');
    this.btnSendContainer.classList.add('btn-send-container');

    this.recordRippleEl = document.createElement('div');
    this.recordRippleEl.classList.add('record-ripple');

    this.btnSend = ButtonIcon('none btn-circle z-depth-1 btn-send animated-button-icon');
    this.btnSend.insertAdjacentHTML('afterbegin', `
    <span class="tgico tgico-send"></span>
    <span class="tgico tgico-schedule"></span>
    <span class="tgico tgico-check"></span>
    <span class="tgico tgico-microphone"></span>
    `);

    this.btnSendContainer.append(this.recordRippleEl, this.btnSend);

    if(this.chat.type !== 'scheduled') {
      this.sendMenu = new SendMenu({
        onSilentClick: () => {
          this.sendSilent = true;
          this.sendMessage();
        },
        onScheduleClick: () => {
          this.scheduleSending(undefined);
        },
        listenerSetter: this.listenerSetter,
        openSide: 'top-left',
        onContextElement: this.btnSend,
        onOpen: () => {
          return !this.isInputEmpty();
        }
      });
      
      this.btnSendContainer.append(this.sendMenu.sendMenu);
    }

    this.inputContainer.append(this.btnCancelRecord, this.btnSendContainer);

    emoticonsDropdown.attachButtonListener(this.btnToggleEmoticons, this.listenerSetter);
    this.listenerSetter.add(emoticonsDropdown)('open', this.onEmoticonsOpen);
    this.listenerSetter.add(emoticonsDropdown)('close', this.onEmoticonsClose);

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

      if(this.messageInputField) {
        this.messageInputField.onFakeInput();
      }
    });

    this.listenerSetter.add(rootScope)('draft_updated', (e) => {
      const {peerId, threadId, draft, force} = e;
      if(this.chat.threadId !== threadId || this.chat.peerId !== peerId) return;
      this.setDraft(draft, true, force);
    });

    this.listenerSetter.add(rootScope)('peer_changing', (chat) => {
      if(this.chat === chat) {
        this.saveDraft();
      }
    });

    if(this.chat.type === 'scheduled') {
      this.listenerSetter.add(rootScope)('scheduled_delete', ({peerId, mids}) => {
        if(this.chat.peerId === peerId && mids.includes(this.editMsgId)) {
          this.onMessageSent();
        }
      });
    } else {
      this.listenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
        if(this.chat.peerId === peerId) {
          if(msgs.has(this.editMsgId)) {
            this.onMessageSent();
          }

          if(this.replyToMsgId && msgs.has(this.replyToMsgId)) {
            this.clearHelper('reply');
          }
        }
      });
    }

    try {
      this.recorder = new Recorder({
        //encoderBitRate: 32,
        //encoderPath: "../dist/encoderWorker.min.js",
        encoderSampleRate: 48000,
        monitorGain: 0,
        numberOfChannels: 1,
        recordingGain: 1,
        reuseWorker: true
      });
    } catch(err) {
      console.error('Recorder constructor error:', err);
    }

    this.updateSendBtn();

    this.listenerSetter.add(this.fileInput)('change', (e) => {
      let files = (e.target as HTMLInputElement & EventTarget).files;
      if(!files.length) {
        return;
      }
      
      new PopupNewMedia(this.chat, Array.from(files).slice(), this.willAttachType);
      this.fileInput.value = '';
    }, false);

    /* let time = Date.now();
    this.btnSend.addEventListener('touchstart', (e) => {
      time = Date.now();
    });

    let eventName1 = 'touchend';
    this.btnSend.addEventListener(eventName1, (e: Event) => {
      //cancelEvent(e);
      console.log(eventName1 + ', time: ' + (Date.now() - time));
    });

    let eventName = 'mousedown';
    this.btnSend.addEventListener(eventName, (e: Event) => {
      cancelEvent(e);
      console.log(eventName + ', time: ' + (Date.now() - time));
    }); */
    attachClickEvent(this.btnSend, this.onBtnSendClick, {listenerSetter: this.listenerSetter, touchMouseDown: true});

    if(this.recorder) {
      attachClickEvent(this.btnCancelRecord, this.onCancelRecordClick, {listenerSetter: this.listenerSetter});

      this.recorder.onstop = () => {
        this.recording = false;
        this.chatInput.classList.remove('is-recording', 'is-locked');
        this.updateSendBtn();
        this.recordRippleEl.style.transform = '';
      };
  
      this.recorder.ondataavailable = (typedArray: Uint8Array) => {
        if(this.recordCanceled) return;
  
        const duration = (Date.now() - this.recordStartTime) / 1000 | 0;
        const dataBlob = new Blob([typedArray], {type: 'audio/ogg'});
        /* const fileName = new Date().toISOString() + ".opus";
        console.log('Recorder data received', typedArray, dataBlob); */

        //let perf = performance.now();
        opusDecodeController.decode(typedArray, true).then(result => {
          //console.log('WAVEFORM!:', /* waveform,  */performance.now() - perf);
  
          opusDecodeController.setKeepAlive(false);
  
          let peerId = this.chat.peerId;
          // тут objectURL ставится уже с audio/wav
          this.appMessagesManager.sendFile(peerId, dataBlob, {
            isVoiceMessage: true,
            isMedia: true,
            duration,
            waveform: result.waveform,
            objectURL: result.url,
            replyToMsgId: this.replyToMsgId,
            threadId: this.chat.threadId,
            clearDraft: true
          });

          this.onMessageSent(false, true);
        });
      };
    }

    attachClickEvent(this.replyElements.cancelBtn, this.onHelperCancel, {listenerSetter: this.listenerSetter});
    attachClickEvent(this.replyElements.container, this.onHelperClick, {listenerSetter: this.listenerSetter});

    this.saveDraftDebounced = debounce(() => this.saveDraft(), 2500, false, true);
  }

  public constructPinnedHelpers() {
    const container = document.createElement('div');
    container.classList.add('pinned-container');

    this.pinnedControlBtn = Button('btn-primary btn-transparent text-bold pinned-container-button', {icon: 'unpin'});
    container.append(this.pinnedControlBtn);

    const fakeContainer = container.cloneNode(true);
    this.fakePinnedControlBtn = fakeContainer.firstChild as HTMLElement;
    this.fakeRowsWrapper.append(fakeContainer);

    this.listenerSetter.add(this.pinnedControlBtn)('click', () => {
      const peerId = this.chat.peerId;

      new PopupPinMessage(peerId, 0, true, () => {
        this.chat.appImManager.setPeer(0); // * close tab

        // ! костыль, это скроет закреплённые сообщения сразу, вместо того, чтобы ждать пока анимация перехода закончится
        const originalChat = this.chat.appImManager.chat;
        if(originalChat.topbar.pinnedMessage) {
          originalChat.topbar.pinnedMessage.pinnedMessageContainer.toggle(true);
        }
      });
    });

    this.rowsWrapper.append(container);

    this.chatInput.classList.add('type-pinned');
    this.rowsWrapper.classList.add('is-centered');
  }

  private onCancelRecordClick = (e?: Event) => {
    if(e) {
      cancelEvent(e);
    }
    
    this.recordCanceled = true;
    this.recorder.stop();
    opusDecodeController.setKeepAlive(false);
  };

  private onEmoticonsOpen = () => {
    const toggleClass = isTouchSupported ? 'flip-icon' : 'active';
    this.btnToggleEmoticons.classList.toggle(toggleClass, true);
  };

  private onEmoticonsClose = () => {
    const toggleClass = isTouchSupported ? 'flip-icon' : 'active';
    this.btnToggleEmoticons.classList.toggle(toggleClass, false);
  };

  public getReadyToSend(callback: () => void) {
    return this.chat.type === 'scheduled' ? (this.scheduleSending(callback), true) : (callback(), false);
  }

  public scheduleSending = (callback: () => void = this.sendMessage.bind(this, true), initDate = new Date()) => {
    const canSendWhenOnline = this.chat.peerId > 0 && this.appUsersManager.isUserOnlineVisible(this.chat.peerId);

    new PopupSchedule(initDate, (timestamp) => {
      const minTimestamp = (Date.now() / 1000 | 0) + 10;
      if(timestamp <= minTimestamp) {
        timestamp = undefined;
      }

      this.scheduleDate = timestamp;
      callback();

      if(this.chat.type !== 'scheduled' && timestamp) {
        this.appImManager.openScheduled(this.chat.peerId);
      }
    }, canSendWhenOnline).show();
  };

  public setUnreadCount() {
    const dialog = this.appMessagesManager.getDialogOnly(this.chat.peerId);
    const count = dialog?.unread_count;
    this.goDownUnreadBadge.innerText = '' + (count || '');
    this.goDownUnreadBadge.classList.toggle('badge-gray', this.appNotificationsManager.isPeerLocalMuted(this.chat.peerId, true));

    if(this.goMentionUnreadBadge && this.chat.type === 'chat') {
      const hasMentions = !!dialog?.unread_mentions_count;
      this.goMentionUnreadBadge.innerText = hasMentions ? '' + (dialog.unread_mentions_count) : '';
      this.goMentionBtn.classList.toggle('is-visible', hasMentions);
    }
  }

  public saveDraft() {
    if(!this.chat.peerId || this.editMsgId || this.chat.type === 'scheduled') return;
    
    const {value, entities} = getRichValue(this.messageInputField.input);

    let draft: DraftMessage.draftMessage;
    if(value.length || this.replyToMsgId) {
      draft = {
        _: 'draftMessage',
        date: tsNow(true) + this.serverTimeManager.serverTimeOffset,
        message: value,
        entities: entities.length ? entities : undefined,
        pFlags: {
          no_webpage: this.noWebPage
        },
        reply_to_msg_id: this.replyToMsgId
      };
    }

    this.appDraftsManager.syncDraft(this.chat.peerId, this.chat.threadId, draft);
  }

  public destroy() {
    //this.chat.log.error('Input destroying');

    this.listenerSetter.removeAll();
  }

  public cleanup(helperToo = true) {
    if(!this.chat.peerId) {
      this.chatInput.style.display = 'none';
      this.goDownBtn.classList.add('hide');
    }

    cancelSelection();

    this.lastTimeType = 0;

    if(this.messageInput) {
      this.clearInput();
      helperToo && this.clearHelper();
    }
  }

  public setDraft(draft?: MyDraftMessage, fromUpdate = true, force = false) {
    if((!force && !isInputEmpty(this.messageInput)) || this.chat.type === 'scheduled') return false;
    
    if(!draft) {
      draft = this.appDraftsManager.getDraft(this.chat.peerId, this.chat.threadId);

      if(!draft) {
        return false;
      }
    }

    if(this.messageInputField.value === draft.rMessage && this.replyToMsgId === draft.reply_to_msg_id) return false;

    this.clearHelper();
    this.noWebPage = draft.pFlags.no_webpage;
    if(draft.reply_to_msg_id) {
      this.initMessageReply(draft.reply_to_msg_id);
    }

    this.setInputValue(draft.rMessage, fromUpdate, fromUpdate);
    return true;
  }

  public finishPeerChange() {
    const peerId = this.chat.peerId;

    this.chatInput.style.display = '';
    
    const isBroadcast = this.appPeersManager.isBroadcast(peerId);
    this.goDownBtn.classList.toggle('is-broadcast', isBroadcast);
    this.goDownBtn.classList.remove('hide');

    if(this.goDownUnreadBadge) {
      this.setUnreadCount();
    }

    if(this.chat.type === 'pinned') {
      this.chatInput.classList.toggle('can-pin', this.appPeersManager.canPinMessage(peerId));
    }/*  else if(this.chat.type === 'chat') {
    } */

    if(this.btnScheduled) {
      this.btnScheduled.classList.add('hide');
      const middleware = this.chat.bubbles.getMiddleware();
      this.appMessagesManager.getScheduledMessages(peerId).then(mids => {
        if(!middleware()) return;
        this.btnScheduled.classList.toggle('hide', !mids.length);
      });
    }

    if(this.replyKeyboard) {
      this.replyKeyboard.setPeer(peerId);
    }

    if(this.sendMenu) {
      this.sendMenu.setPeerId(peerId);
    }

    if(this.messageInput) {
      this.updateMessageInput();
    } else if(this.pinnedControlBtn) {
      if(this.appPeersManager.canPinMessage(this.chat.peerId)) {
        this.pinnedControlBtn.append(i18n('Chat.Input.UnpinAll'));
        this.fakePinnedControlBtn.append(i18n('Chat.Input.UnpinAll'));
      } else {
        this.pinnedControlBtn.append(i18n('Chat.Pinned.DontShow'));
        this.fakePinnedControlBtn.append(i18n('Chat.Pinned.DontShow'));
      }
    }
  }

  public updateMessageInput() {
    const canWrite = this.appMessagesManager.canWriteToPeer(this.chat.peerId, this.chat.threadId);
    this.chatInput.classList.add('no-transition');
    this.chatInput.classList.toggle('is-hidden', !canWrite);
    void this.chatInput.offsetLeft; // reflow
    this.chatInput.classList.remove('no-transition');

    const visible = this.attachMenuButtons.filter(button => {
      const good = button.verify(this.chat.peerId);
      button.element.classList.toggle('hide', !good);
      return good;
    });

    if(!canWrite) {
      this.messageInput.removeAttribute('contenteditable');
    } else {
      this.messageInput.setAttribute('contenteditable', 'true');
      this.setDraft(undefined, false);

      if(!this.messageInput.innerHTML) {
        this.messageInputField.onFakeInput();
      }
    }
    
    this.attachMenu.toggleAttribute('disabled', !visible.length);
    this.attachMenu.classList.toggle('btn-disabled', !visible.length);
    this.updateSendBtn();
  }

  private attachMessageInputField() {
    const oldInputField = this.messageInputField;
    this.messageInputField = new InputField({
      placeholder: 'Message',
      name: 'message',
      animate: true
    });

    this.messageInputField.input.classList.replace('input-field-input', 'input-message-input');
    this.messageInputField.inputFake.classList.replace('input-field-input', 'input-message-input');
    this.messageInput = this.messageInputField.input;
    this.messageInput.classList.add('no-scrollbar');
    this.attachMessageInputListeners();
    
    if(IS_STICKY_INPUT_BUGGED) {
      fixSafariStickyInputFocusing(this.messageInput);
    }

    if(oldInputField) {
      oldInputField.input.replaceWith(this.messageInputField.input);
      oldInputField.inputFake.replaceWith(this.messageInputField.inputFake);
    } else {
      this.inputMessageContainer.append(this.messageInputField.input, this.messageInputField.inputFake);
    }
  }

  private attachMessageInputListeners() {
    this.listenerSetter.add(this.messageInput)('keydown', (e: KeyboardEvent) => {
      if(isSendShortcutPressed(e)) {
        this.sendMessage();
      } else if(e.ctrlKey || e.metaKey) {
        this.handleMarkdownShortcut(e);
      } else if((e.key === 'PageUp' || e.key === 'PageDown') && !e.shiftKey) { // * fix pushing page to left (Chrome Windows)
        e.preventDefault();

        if(e.key === 'PageUp') {
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

    if(isTouchSupported) {
      attachClickEvent(this.messageInput, (e) => {
        this.appImManager.selectTab(1); // * set chat tab for album orientation
        //this.saveScroll();
        emoticonsDropdown.toggle(false);
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

    if(this.chat.type === 'chat' || this.chat.type === 'discussion') {
      this.listenerSetter.add(this.messageInput)('focusin', () => {
        if(this.chat.bubbles.scrollable.loadedAll.bottom) {
          this.appMessagesManager.readAllHistory(this.chat.peerId, this.chat.threadId);
        }
      }); 
    }
  }

  private prepareDocumentExecute = () => {
    this.executedHistory.push(this.messageInput.innerHTML);
    return () => this.canUndoFromHTML = this.messageInput.innerHTML;
  };

  private undoRedo = (e: Event, type: 'undo' | 'redo', needHTML: string) => {
    cancelEvent(e); // cancel legacy event

    let html = this.messageInput.innerHTML;
    if(html && html !== needHTML) {
      this.lockRedo = true;

      let sameHTMLTimes = 0;
      do {
        document.execCommand(type, false, null);
        const currentHTML = this.messageInput.innerHTML;
        if(html === currentHTML) {
          if(++sameHTMLTimes > 2) { // * unlink, removeFormat (а может и нет, случай: заболдить подчёркнутый текст (выделить ровно его), попробовать отменить)
            break;
          }
        } else {
          sameHTMLTimes = 0;
        }

        html = currentHTML;
      } while(html !== needHTML);

      this.lockRedo = false;
    }
  };

  public applyMarkdown(type: MarkdownType, href?: string) {
    const commandsMap: Partial<{[key in typeof type]: string | (() => void)}> = {
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      strikethrough: 'Strikethrough',
      monospace: () => document.execCommand('fontName', false, 'monospace'),
      link: href ? () => document.execCommand('createLink', false, href) : () => document.execCommand('unlink', false, null)
    };

    if(!commandsMap[type]) {
      return false;
    }

    const command = commandsMap[type];

    //type = 'monospace';

    const saveExecuted = this.prepareDocumentExecute();
    const executed: any[] = [];
    /**
     * * clear previous formatting, due to Telegram's inability to handle several entities
     */
    /* const checkForSingle = () => {
      const nodes = getSelectedNodes();
      //console.log('Using formatting:', commandsMap[type], nodes, this.executedHistory);

      const parents = [...new Set(nodes.map(node => node.parentNode))];
      //const differentParents = !!nodes.find(node => node.parentNode !== firstParent);
      const differentParents = parents.length > 1;

      let notSingle = false;
      if(differentParents) {
        notSingle = true;
      } else {
        const node = nodes[0];
        if(node && (node.parentNode as HTMLElement) !== this.messageInput && (node.parentNode.parentNode as HTMLElement) !== this.messageInput) {
          notSingle = true;
        }
      }

      if(notSingle) {
        //if(type === 'monospace') {
          executed.push(document.execCommand('styleWithCSS', false, 'true'));
        //}

        executed.push(document.execCommand('unlink', false, null));
        executed.push(document.execCommand('removeFormat', false, null));
        executed.push(typeof(command) === 'function' ? command() : document.execCommand(command, false, null));

        //if(type === 'monospace') {
          executed.push(document.execCommand('styleWithCSS', false, 'false'));
        //}
      }
    }; */

    executed.push(document.execCommand('styleWithCSS', false, 'true'));
    
    if(type === 'monospace') {
      let haveThisType = false;
      //executed.push(document.execCommand('styleWithCSS', false, 'true'));

      const selection = window.getSelection();
      if(!selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const tag = markdownTags[type];

        const node = range.commonAncestorContainer;
        if((node.parentNode as HTMLElement).matches(tag.match) || (node instanceof HTMLElement && node.matches(tag.match))) {
          haveThisType = true;
        }
      }

      //executed.push(document.execCommand('removeFormat', false, null));

      if(haveThisType) {
        executed.push(document.execCommand('fontName', false, 'Roboto'));
      } else {
        executed.push(typeof(command) === 'function' ? command() : document.execCommand(command, false, null));
      }
    } else {
      executed.push(typeof(command) === 'function' ? command() : document.execCommand(command, false, null));
    }

    executed.push(document.execCommand('styleWithCSS', false, 'false'));

    //checkForSingle();
    saveExecuted();
    if(this.appImManager.markupTooltip) {
      this.appImManager.markupTooltip.setActiveMarkupButton();
    }

    return true;
  }

  private handleMarkdownShortcut = (e: KeyboardEvent) => {
    // console.log('handleMarkdownShortcut', e);
    const formatKeys: {[key: string]: MarkdownType} = {
      'B': 'bold',
      'I': 'italic',
      'U': 'underline',
      'S': 'strikethrough',
      'M': 'monospace',
      'K': 'link'
    };

    const selection = document.getSelection();
    if(selection.toString().trim().length) {
      for(const key in formatKeys) {
        const good = e.code === ('Key' + key);
  
        if(good) {
          // * костыльчик
          if(key === 'K' && this.appImManager.markupTooltip) {
            this.appImManager.markupTooltip.showLinkEditor();
            cancelEvent(e);
            break;
          }
  
          this.applyMarkdown(formatKeys[key]);
          cancelEvent(e); // cancel legacy event
          break;
        }
      }
    }

    //return;
    if(e.code === 'KeyZ') {
      let html = this.messageInput.innerHTML;

      if(e.shiftKey) {
        if(this.undoHistory.length) {
          this.executedHistory.push(html);
          html = this.undoHistory.pop();
          this.undoRedo(e, 'redo', html);
          html = this.messageInput.innerHTML;
          this.canRedoFromHTML = this.undoHistory.length ? html : '';
          this.canUndoFromHTML = html;
        }
      } else {
        // * подождём, когда пользователь сам восстановит поле до нужного состояния, которое стало сразу после saveExecuted
        if(this.executedHistory.length && (!this.canUndoFromHTML || html === this.canUndoFromHTML)) {
          this.undoHistory.push(html);
          html = this.executedHistory.pop();
          this.undoRedo(e, 'undo', html);

          // * поставим новое состояние чтобы снова подождать, если пользователь изменит что-то, и потом попробует откатить до предыдущего состояния
          this.canUndoFromHTML = this.canRedoFromHTML = this.messageInput.innerHTML;
        }
      }
    }
  };

  private onMessageInput = (e?: Event) => {
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

    //console.log('messageInput input', this.messageInput.innerText);
    //const value = this.messageInput.innerText;
    const {value: richValue, entities: markdownEntities, caretPos} = getRichValueWithCaret(this.messageInputField.input);
      
    //const entities = RichTextProcessor.parseEntities(value);
    const value = RichTextProcessor.parseMarkdown(richValue, markdownEntities, true);
    const entities = RichTextProcessor.mergeEntities(markdownEntities, RichTextProcessor.parseEntities(value));

    //this.chat.log('messageInput entities', richValue, value, markdownEntities, caretPos);

    if(this.canRedoFromHTML && !this.lockRedo && this.messageInput.innerHTML !== this.canRedoFromHTML) {
      this.canRedoFromHTML = '';
      this.undoHistory.length = 0;
    }

    const urlEntities: Array<MessageEntity.messageEntityUrl | MessageEntity.messageEntityTextUrl> = entities.filter(e => e._ === 'messageEntityUrl' || e._ === 'messageEntityTextUrl') as any;
    if(urlEntities.length) {
      for(const entity of urlEntities) {
        let url: string;
        if(entity._ === 'messageEntityTextUrl') {
          url = entity.url;
        } else {
          url = richValue.slice(entity.offset, entity.offset + entity.length);

          if(!(url.includes('http://') || url.includes('https://'))) {
            continue;
          }
        }

        //console.log('messageInput url:', url);

        if(this.lastUrl !== url) {
          this.lastUrl = url;
          // this.willSendWebPage = null;
          const promise = this.getWebPagePromise = apiManager.invokeApiHashable('messages.getWebPage', {
            url,
          }).then((webpage) => {
            webpage = this.appWebPagesManager.saveWebPage(webpage);
            if(this.getWebPagePromise === promise) this.getWebPagePromise = undefined;
            if(this.lastUrl !== url) return;
            if(webpage._  === 'webPage') {
              //console.log('got webpage: ', webpage);

              this.setTopInfo('webpage', () => {}, webpage.site_name || webpage.title || 'Webpage', webpage.description || webpage.url || '');
              delete this.noWebPage;
              this.willSendWebPage = webpage;
            } else if(this.willSendWebPage) {
              this.onHelperCancel();
            }
          });
        }

        break;
      }
    } else if(this.lastUrl) {
      this.lastUrl = '';
      delete this.noWebPage;
      this.willSendWebPage = null;
      
      if(this.helperType) {
        this.helperFunc();
      } else {
        this.clearHelper();
      }
    }

    if(!richValue.trim()) {
      if(this.lastTimeType) {
        this.appMessagesManager.setTyping(this.chat.peerId, {_: 'sendMessageCancelAction'});
      }

      if(this.appImManager.markupTooltip) {
        this.appImManager.markupTooltip.hide();
      }
    } else {
      const time = Date.now();
      if(time - this.lastTimeType >= 6000) {
        this.lastTimeType = time;
        this.appMessagesManager.setTyping(this.chat.peerId, {_: 'sendMessageTypingAction'});
      }
    }

    if(!this.editMsgId) {
      this.saveDraftDebounced();
    }

    this.checkAutocomplete(richValue, caretPos, entities);

    this.updateSendBtn();
  };

  public insertAtCaret(insertText: string, insertEntity?: MessageEntity, isHelper = true) {
    const {value: fullValue, caretPos, entities} = getRichValueWithCaret(this.messageInput);
    const pos = caretPos >= 0 ? caretPos : fullValue.length;
    const prefix = fullValue.substr(0, pos);
    const suffix = fullValue.substr(pos);

    const matches = isHelper ? prefix.match(ChatInput.AUTO_COMPLETE_REG_EXP) : null;

    const matchIndex = matches ? matches.index + (matches[0].length - matches[2].length) : prefix.length;
    const newPrefix = prefix.slice(0, matchIndex);
    const newValue = newPrefix + insertText + suffix;

    // merge emojis
    const hadEntities = RichTextProcessor.parseEntities(fullValue);
    RichTextProcessor.mergeEntities(entities, hadEntities);

    // max for additional whitespace
    const insertLength = insertEntity ? Math.max(insertEntity.length, insertText.length) : insertText.length;
    const addEntities: MessageEntity[] = [];
    if(insertEntity) {
      addEntities.push(insertEntity);
      insertEntity.offset = matchIndex;
    }

    addEntities.push({
      _: 'messageEntityCaret',
      length: 0,
      offset: matchIndex + insertLength
    });
    
    // add offset to entities next to emoji
    const diff = insertLength - (matches ? matches[2].length : prefix.length);
    entities.forEach(entity => {
      if(entity.offset >= matchIndex) {
        entity.offset += diff;
      }
    });

    RichTextProcessor.mergeEntities(entities, addEntities);

    //const saveExecuted = this.prepareDocumentExecute();
    // can't exec .value here because it will instantly check for autocomplete
    this.messageInputField.setValueSilently(RichTextProcessor.wrapDraftText(newValue, {entities}), true);

    const caret = this.messageInput.querySelector('.composer-sel');
    setRichFocus(this.messageInput, caret);
    caret.remove();

    // but it's needed to be checked only here
    this.onMessageInput();

    //saveExecuted();

    //document.execCommand('insertHTML', true, RichTextProcessor.wrapEmojiText(emoji));
  }

  public onEmojiSelected = (emoji: string, autocomplete: boolean) => {
    if(autocomplete) {
      this.insertAtCaret(emoji, RichTextProcessor.getEmojiEntityFromEmoji(emoji));
    }
  };

  private checkAutocomplete(value?: string, caretPos?: number, entities?: MessageEntity[]) {
    //return;

    if(value === undefined) {
      const r = getRichValueWithCaret(this.messageInputField.input, true);
      value = r.value;
      caretPos = r.caretPos;
      entities = r.entities;
    }

    if(caretPos === -1) {
      caretPos = value.length;
    }

    if(entities === undefined) {
      const _value = RichTextProcessor.parseMarkdown(value, entities, true);
      entities = RichTextProcessor.mergeEntities(entities, RichTextProcessor.parseEntities(_value));
    }

    value = value.substr(0, caretPos);

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

      if(this.stickersHelper && 
        rootScope.settings.stickers.suggest && 
        (this.chat.peerId > 0 || this.appChatsManager.hasRights(this.chat.peerId, 'send_stickers')) &&
        entity?._ === 'messageEntityEmoji' && entity.length === value.length && !entity.offset) {
        foundHelper = this.stickersHelper;
        this.stickersHelper.checkEmoticon(value);
      } else if(firstChar === '@') { // mentions
        const topMsgId = this.chat.threadId ? this.appMessagesIdsManager.getServerMessageId(this.chat.threadId) : undefined;
        if(this.mentionsHelper.checkQuery(query, this.chat.peerId > 0 ? 0 : this.chat.peerId, topMsgId)) {
          foundHelper = this.mentionsHelper;
        }
      } else if(!matches[1] && firstChar === '/') { // commands
        if(this.commandsHelper.checkQuery(query, this.chat.peerId)) {
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
    
    foundHelper = this.checkInlineAutocomplete(value, foundHelper);

    this.autocompleteHelperController.hideOtherHelpers(foundHelper);
  }

  private checkInlineAutocomplete(value: string, foundHelper?: AutocompleteHelper): AutocompleteHelper {
    let needPlaceholder = false;

    if(!foundHelper) {
      const inlineMatch = value.match(/^@([a-zA-Z\\d_]{3,32})\s/);
      if(inlineMatch) {
        const username = inlineMatch[1];
        const query = value.slice(inlineMatch[0].length);
        needPlaceholder = inlineMatch[0].length === value.length;
  
        foundHelper = this.inlineHelper;

        if(!this.btnPreloader) {
          this.btnPreloader = ButtonIcon('none btn-preloader float show disable-hover', {noRipple: true});
          putPreloader(this.btnPreloader, true);
          this.inputMessageContainer.parentElement.insertBefore(this.btnPreloader, this.inputMessageContainer.nextSibling);
        } else {
          SetTransition(this.btnPreloader, 'show', true, 400);
        }
        
        this.inlineHelper.checkQuery(this.chat.peerId, username, query).then(({user, renderPromise}) => {
          if(needPlaceholder && user.bot_inline_placeholder) {
            this.messageInput.dataset.inlinePlaceholder = user.bot_inline_placeholder;
          }

          renderPromise.then(() => {
            SetTransition(this.btnPreloader, 'show', false, 400);
          });
        }).catch(noop);
      }
    }
    
    if(!needPlaceholder) {
      delete this.messageInput.dataset.inlinePlaceholder;
    }

    if(foundHelper !== this.inlineHelper) {
      if(this.btnPreloader) {
        SetTransition(this.btnPreloader, 'show', false, 400);
      }
    }

    return foundHelper;
  }

  private onBtnSendClick = (e: Event) => {
    cancelEvent(e);

    if(!this.recorder || this.recording || !this.isInputEmpty() || this.forwarding || this.editMsgId) {
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
      if(this.chat.peerId < 0 && !this.appChatsManager.hasRights(this.chat.peerId, 'send_media')) {
        toast(POSTING_MEDIA_NOT_ALLOWED);
        return;
      }

      this.chatInput.classList.add('is-locked');
      blurActiveElement();
      this.recorder.start().then(() => {
        this.recordCanceled = false;
        
        this.chatInput.classList.add('is-recording');
        this.recording = true;
        this.updateSendBtn();
        opusDecodeController.setKeepAlive(true);

        this.recordStartTime = Date.now();

        const sourceNode: MediaStreamAudioSourceNode = this.recorder.sourceNode;
        const context = sourceNode.context;

        const analyser = context.createAnalyser();
        sourceNode.connect(analyser);
        //analyser.connect(context.destination);
        analyser.fftSize = 32;

        const frequencyData = new Uint8Array(analyser.frequencyBinCount);
        const max = frequencyData.length * 255;
        const min = 54 / 150;
        let r = () => {
          if(!this.recording) return;

          analyser.getByteFrequencyData(frequencyData);

          let sum = 0;
          frequencyData.forEach(value => {
            sum += value;
          });
          
          let percents = Math.min(1, (sum / max) + min);
          //console.log('frequencyData', frequencyData, percents);

          this.recordRippleEl.style.transform = `scale(${percents})`;

          let diff = Date.now() - this.recordStartTime;
          let ms = diff % 1000;

          let formatted = ('' + (diff / 1000)).toHHMMSS() + ',' + ('00' + Math.round(ms / 10)).slice(-2);

          this.recordTimeEl.innerText = formatted;

          window.requestAnimationFrame(r);
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

        this.chatInput.classList.remove('is-recording', 'is-locked');
      });
    }
  };

  private onHelperCancel = (e?: Event) => {
    if(e) {
      cancelEvent(e);
    }

    if(this.willSendWebPage) {
      const lastUrl = this.lastUrl;
      let needReturn = false;
      if(this.helperType) {
        //if(this.helperFunc) {
          this.helperFunc();
        //}

        needReturn = true;
      }

      // * restore values
      this.lastUrl = lastUrl;
      this.noWebPage = true;
      this.willSendWebPage = null;

      if(needReturn) return;
    }

    this.clearHelper();
    this.updateSendBtn();
  };

  private onHelperClick = (e: Event) => {
    cancelEvent(e);
      
    if(!findUpClassName(e.target, 'reply-wrapper')) return;
    if(this.helperType === 'forward') {
      if(this.helperWaitingForward) return;
      this.helperWaitingForward = true;

      const helperFunc = this.helperFunc;
      this.clearHelper();
      this.updateSendBtn();
      let selected = false;
      new PopupForward(copy(this.forwarding), () => {
        selected = true;
      }, () => {
        this.helperWaitingForward = false;

        if(!selected) {
          helperFunc();
        }
      });
    } else if(this.helperType === 'reply') {
      this.chat.setMessageId(this.replyToMsgId);
    } else if(this.helperType === 'edit') {
      this.chat.setMessageId(this.editMsgId);
    }
  };

  public clearInput(canSetDraft = true, fireEvent = true, clearValue = '') {
    if(document.activeElement === this.messageInput && isMobileSafari) { // fix first char uppercase
      const i = document.createElement('input');
      document.body.append(i);
      fixSafariStickyInput(i);
      this.messageInputField.setValueSilently(clearValue);
      fixSafariStickyInput(this.messageInput);
      i.remove();
    } else {
      this.messageInputField.setValueSilently(clearValue);
    }

    if(isTouchSupported) {
      //this.messageInput.innerText = '';
    } else {
      //this.attachMessageInputField();
      //this.messageInput.innerText = '';

      // clear executions
      this.canRedoFromHTML = '';
      this.undoHistory.length = 0;
      this.executedHistory.length = 0;
      this.canUndoFromHTML = '';
    }

    let set = false;
    if(canSetDraft) {
      set = this.setDraft(undefined, false);
    }

    if(!set && fireEvent) {
      this.onMessageInput();
    }
  }

  public isInputEmpty() {
    return isInputEmpty(this.messageInput);
  }

  public updateSendBtn() {
    let icon: 'send' | 'record' | 'edit' | 'schedule';

    const isInputEmpty = this.isInputEmpty();

    if(this.editMsgId) icon = 'edit';
    else if(!this.recorder || this.recording || !isInputEmpty || this.forwarding) icon = this.chat.type === 'scheduled' ? 'schedule' : 'send';
    else icon = 'record';

    ['send', 'record', 'edit', 'schedule'].forEach(i => {
      this.btnSend.classList.toggle(i, icon === i);
    });

    if(this.btnScheduled) {
      this.btnScheduled.classList.toggle('show', isInputEmpty);
    }

    if(this.btnToggleReplyMarkup) {
      this.btnToggleReplyMarkup.classList.toggle('show', isInputEmpty);
    }
  }

  public onMessageSent(clearInput = true, clearReply?: boolean) {
    if(this.chat.type !== 'scheduled') {
      this.appMessagesManager.readAllHistory(this.chat.peerId, this.chat.threadId, true);
    }

    this.scheduleDate = undefined;
    this.sendSilent = undefined;

    const value = this.messageInputField.value;
    const entities = RichTextProcessor.parseEntities(value);
    const emojiEntities: MessageEntity.messageEntityEmoji[] = entities.filter(entity => entity._ === 'messageEntityEmoji') as any;
    emojiEntities.forEach(entity => {
      const emoji = emojiFromCodePoints(entity.unicode);
      this.appEmojiManager.pushRecentEmoji(emoji);
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
  }

  public sendMessage(force = false) {
    if(this.chat.type === 'scheduled' && !force && !this.editMsgId) {
      this.scheduleSending();
      return;
    }

    const {value, entities} = getRichValue(this.messageInputField.input);

    //return;
    if(this.editMsgId) {
      if(!!value.trim()) {
        this.appMessagesManager.editMessage(this.chat.getMessage(this.editMsgId), value, {
          entities,
          noWebPage: this.noWebPage
        });
      } else {
        new PopupDeleteMessages(this.chat.peerId, [this.editMsgId], this.chat.type);

        return;
      }
    } else {
      this.appMessagesManager.sendText(this.chat.peerId, value, {
        entities,
        replyToMsgId: this.replyToMsgId,
        threadId: this.chat.threadId,
        noWebPage: this.noWebPage,
        webPage: this.getWebPagePromise ? undefined : this.willSendWebPage,
        scheduleDate: this.scheduleDate,
        silent: this.sendSilent,
        clearDraft: true
      });
    }

    // * wait for sendText set messageId for invokeAfterMsg
    if(this.forwarding) {
      const forwarding = copy(this.forwarding);
      const peerId = this.chat.peerId;
      const silent = this.sendSilent;
      const scheduleDate = this.scheduleDate;
      setTimeout(() => {
        for(const fromPeerId in forwarding) {
          this.appMessagesManager.forwardMessages(peerId, +fromPeerId, forwarding[fromPeerId], {
            silent,
            scheduleDate: scheduleDate
          });
        }
      }, 0);
    }

    this.onMessageSent();
  }

  public sendMessageWithDocument(document: MyDocument | string, force = false, clearDraft = false) {
    document = this.appDocsManager.getDoc(document);

    const flag = document.type === 'sticker' ? 'send_stickers' : (document.type === 'gif' ? 'send_gifs' : 'send_media');
    if(this.chat.peerId < 0 && !this.appChatsManager.hasRights(this.chat.peerId, flag)) {
      toast(POSTING_MEDIA_NOT_ALLOWED);
      return false;
    }

    if(this.chat.type === 'scheduled' && !force) {
      this.scheduleSending(() => this.sendMessageWithDocument(document, true, clearDraft));
      return false;
    }

    if(document) {
      this.appMessagesManager.sendFile(this.chat.peerId, document, {
        isMedia: true, 
        replyToMsgId: this.replyToMsgId, 
        threadId: this.chat.threadId,
        silent: this.sendSilent, 
        scheduleDate: this.scheduleDate,
        clearDraft: clearDraft || undefined
      });
      this.onMessageSent(clearDraft, true);

      if(document.type === 'sticker') {
        emoticonsDropdown.stickersTab?.pushRecentSticker(document);
      }

      return true;
    }
    
    return false;
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
    const message = this.chat.getMessage(mid);

    let input = RichTextProcessor.wrapDraftText(message.message, {entities: message.totalEntities});
    const f = () => {
      const replyFragment = this.appMessagesManager.wrapMessageForReply(message, undefined, [message.mid]);
      this.setTopInfo('edit', f, i18n('AccDescrEditing'), replyFragment, input, message);

      this.editMsgId = mid;
      input = undefined;
    };
    f();
  }

  public initMessagesForward(fromPeerIdsMids: {[fromPeerId: number]: number[]}) {
    const f = () => {
      //const peerTitles: string[]
      const fromPeerIds = Object.keys(fromPeerIdsMids).map(str => +str);
      const smth: Set<string | number> = new Set();
      let length = 0;

      fromPeerIds.forEach(fromPeerId => {
        const mids = fromPeerIdsMids[fromPeerId];
        mids.forEach(mid => {
          const message = this.appMessagesManager.getMessageByPeer(fromPeerId, mid);
          if(message.fwd_from?.from_name && !message.fromId && !message.fwdFromId) {
            smth.add(message.fwd_from.from_name);
          } else {
            smth.add(message.fromId);
          }
        });

        length += mids.length;
      });

      const onlyFirstName = smth.size > 2;
      const peerTitles = [...smth].map(smth => {
        return typeof(smth) === 'number' ? 
          new PeerTitle({peerId: smth, dialog: false, onlyFirstName}).element : 
          (onlyFirstName ? smth.split(' ')[0] : smth);
      });

      const title = document.createDocumentFragment();
      if(peerTitles.length < 3) {
        title.append(...join(peerTitles, false));
      } else {
        title.append(peerTitles[0], i18n('AndOther', [peerTitles.length - 1]));
      }
      
      let firstMessage: any, usingFullAlbum: boolean;
      if(fromPeerIds.length === 1) {
        const fromPeerId = fromPeerIds[0];
        const mids = fromPeerIdsMids[fromPeerId];
        firstMessage = this.appMessagesManager.getMessageByPeer(fromPeerId, mids[0]);
  
        usingFullAlbum = !!firstMessage.grouped_id;
        if(usingFullAlbum) {
          const albumMids = this.appMessagesManager.getMidsByMessage(firstMessage);
          if(albumMids.length !== length || albumMids.find(mid => !mids.includes(mid))) {
            usingFullAlbum = false;
          }
        }
      }
  
      if(usingFullAlbum || length === 1) {
        const mids = fromPeerIdsMids[fromPeerIds[0]];
        const replyFragment = this.appMessagesManager.wrapMessageForReply(firstMessage, undefined, mids);
        this.setTopInfo('forward', f, title, replyFragment);
      } else {
        this.setTopInfo('forward', f, title, i18n('ForwardedMessageCount', [length]));
      }

      this.forwarding = fromPeerIdsMids;
    };
    
    f();
  }

  public initMessageReply(mid: number) {
    let message: Message = this.chat.getMessage(mid);
    const f = () => {
      let peerTitleEl: HTMLElement;
      if(message._ === 'messageEmpty') { // load missing replying message
        peerTitleEl = i18n('Loading');

        this.chat.appMessagesManager.wrapSingleMessage(this.chat.peerId, mid).then(() => {
          if(this.replyToMsgId !== mid) {
            return;
          }

          message = this.chat.getMessage(mid);
          if(message._ === 'messageEmpty') {
            this.clearHelper('reply');
          } else {
            f();
          }
        });
      } else {
        peerTitleEl = new PeerTitle({
          peerId: message.fromId,
          dialog: false
        }).element;
      }

      this.setTopInfo('reply', f, peerTitleEl, message && (message as Message.message).message, undefined, message);
      this.replyToMsgId = mid;
    };
    f();
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
    
    this.replyToMsgId = undefined;
    this.forwarding = undefined;
    this.editMsgId = undefined;
    this.helperType = this.helperFunc = undefined;

    if(this.chat.container.classList.contains('is-helper-active')) {
      appNavigationController.removeByType('input-helper');
      this.chat.container.classList.remove('is-helper-active');
    }
  }

  public setInputValue(value: string, clear = true, focus = true) {
    if(!value) value = '';

    if(clear) this.clearInput(false, false, value);
    else this.messageInputField.setValueSilently(value);

    fastRaf(() => {
      focus && placeCaretAtEnd(this.messageInput);
      this.onMessageInput();
      this.messageInput.scrollTop = this.messageInput.scrollHeight;
    });
  }

  public setTopInfo(type: ChatInputHelperType, 
    callerFunc: () => void, 
    title: Parameters<typeof wrapReply>[0] = '', 
    subtitle: Parameters<typeof wrapReply>[1] = '', 
    input?: string, 
    message?: any) {
    if(type !== 'webpage') {
      this.clearHelper(type);
      this.helperType = type;
      this.helperFunc = callerFunc;
    }

    const replyParent = this.replyElements.container;
    if(replyParent.lastElementChild.tagName === 'DIV') {
      replyParent.lastElementChild.remove();
    }

    replyParent.append(wrapReply(title, subtitle, message));

    this.chat.container.classList.add('is-helper-active');
    /* const scroll = appImManager.scrollable;
    if(scroll.isScrolledDown && !scroll.scrollLocked && !appImManager.messagesQueuePromise && !appImManager.setPeerPromise) {
      scroll.scrollTo(scroll.scrollHeight, 'top', true, true, 200);
    } */

    if(!isMobile) {
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
  }

  // public saveScroll() {
  //   this.scrollTop = this.chat.bubbles.scrollable.container.scrollTop;
  //   this.scrollOffsetTop = this.chatInput.offsetTop;
  // }

  // public restoreScroll() {
  //   if(this.chatInput.style.display) return;
  //   //console.log('input resize', offsetTop, this.chatInput.offsetTop);
  //   let newOffsetTop = this.chatInput.offsetTop;
  //   let container = this.chat.bubbles.scrollable.container;
  //   let scrollTop = container.scrollTop;
  //   let clientHeight = container.clientHeight;
  //   let maxScrollTop = container.scrollHeight;

  //   if(newOffsetTop < this.scrollOffsetTop) {
  //     this.scrollDiff = this.scrollOffsetTop - newOffsetTop;
  //     container.scrollTop += this.scrollDiff;
  //   } else if(scrollTop !== this.scrollTop) {
  //     let endDiff = maxScrollTop - (scrollTop + clientHeight);
  //     if(endDiff < this.scrollDiff/*  && false */) {
  //       //container.scrollTop -= endDiff;
  //     } else {
  //       container.scrollTop -= this.scrollDiff;
  //     }
  //   }
  // }
}
