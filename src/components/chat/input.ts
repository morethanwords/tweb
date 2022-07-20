/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { MyDocument } from "../../lib/appManagers/appDocsManager";
import type { AppImManager } from '../../lib/appManagers/appImManager';
import type { MyDraftMessage } from '../../lib/appManagers/appDraftsManager';
import type Chat from './chat';
import Recorder from '../../../public/recorder.min';
import IS_TOUCH_SUPPORTED from "../../environment/touchSupport";
//import Recorder from '../opus-recorder/dist/recorder.min';
import opusDecodeController from "../../lib/opusDecodeController";
import ButtonMenu, { ButtonMenuItemOptions } from '../buttonMenu';
import emoticonsDropdown from "../emoticonsDropdown";
import PopupCreatePoll from "../popups/createPoll";
import PopupForward from '../popups/forward';
import PopupNewMedia from '../popups/newMedia';
import { toast } from "../toast";
import { wrapReply } from "../wrappers";
import InputField from '../inputField';
import { MessageEntity, DraftMessage, WebPage, Message, ChatFull, UserFull } from '../../layer';
import StickersHelper from './stickersHelper';
import ButtonIcon from '../buttonIcon';
import ButtonMenuToggle from '../buttonMenuToggle';
import ListenerSetter, { Listener } from '../../helpers/listenerSetter';
import Button from '../button';
import PopupSchedule from '../popups/schedule';
import SendMenu from './sendContextMenu';
import rootScope from '../../lib/rootScope';
import PopupPinMessage from '../popups/unpinMessage';
import tsNow from '../../helpers/tsNow';
import appNavigationController, { NavigationItem } from '../appNavigationController';
import { IS_MOBILE, IS_MOBILE_SAFARI } from '../../environment/userAgent';
import I18n, { i18n, join, LangPackKey } from '../../lib/langPack';
import { generateTail } from './bubbles';
import findUpClassName from '../../helpers/dom/findUpClassName';
import ButtonCorner from '../buttonCorner';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import cancelEvent from '../../helpers/dom/cancelEvent';
import cancelSelection from '../../helpers/dom/cancelSelection';
import { attachClickEvent, simulateClickEvent } from '../../helpers/dom/clickEvent';
import getRichValue from '../../helpers/dom/getRichValue';
import isInputEmpty from '../../helpers/dom/isInputEmpty';
import isSendShortcutPressed from '../../helpers/dom/isSendShortcutPressed';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import { MarkdownType, markdownTags } from '../../helpers/dom/getRichElementValue';
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
import noop from '../../helpers/noop';
import { putPreloader } from '../putPreloader';
import SetTransition from '../singleTransition';
import PeerTitle from '../peerTitle';
import { fastRaf } from '../../helpers/schedulers';
import PopupDeleteMessages from '../popups/deleteMessages';
import fixSafariStickyInputFocusing, { IS_STICKY_INPUT_BUGGED } from '../../helpers/dom/fixSafariStickyInputFocusing';
import PopupPeer from '../popups/peer';
import MEDIA_MIME_TYPES_SUPPORTED from '../../environment/mediaMimeTypesSupport';
import appMediaPlaybackController from '../appMediaPlaybackController';
import { BOT_START_PARAM, NULL_PEER_ID } from '../../lib/mtproto/mtproto_config';
import setCaretAt from '../../helpers/dom/setCaretAt';
import CheckboxField from '../checkboxField';
import DropdownHover from '../../helpers/dropdownHover';
import RadioForm from '../radioForm';
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
import { AppManagers } from '../../lib/appManagers/managers';
import contextMenuController from "../../helpers/contextMenuController";
import { emojiFromCodePoints } from "../../vendor/emoji";
import { modifyAckedPromise } from "../../helpers/modifyAckedResult";
import ChatSendAs from "./sendAs";
import filterAsync from "../../helpers/array/filterAsync";
import InputFieldAnimated from "../inputFieldAnimated";

const RECORD_MIN_TIME = 500;
const POSTING_MEDIA_NOT_ALLOWED = 'Posting media content isn\'t allowed in this group.';

type ChatInputHelperType = 'edit' | 'webpage' | 'forward' | 'reply';

export default class ChatInput {
  // private static AUTO_COMPLETE_REG_EXP = /(\s|^)((?::|.)(?!.*[:@]).*|(?:[@\/]\S*))$/;
  private static AUTO_COMPLETE_REG_EXP = /(\s|^)((?:(?:@|^\/)\S*)|(?::|^[^:@\/])(?!.*[:@\/]).*)$/;
  public messageInput: HTMLElement;
  public messageInputField: InputFieldAnimated;
  private fileInput: HTMLInputElement;
  private inputMessageContainer: HTMLDivElement;
  private btnSend: HTMLButtonElement;
  private btnCancelRecord: HTMLButtonElement;
  private lastUrl = '';
  private lastTimeType = 0;

  public chatInput: HTMLElement;
  public inputContainer: HTMLElement;
  public rowsWrapper: HTMLDivElement;
  private newMessageWrapper: HTMLDivElement;
  private btnToggleEmoticons: HTMLButtonElement;
  private btnToggleReplyMarkup: HTMLButtonElement;
  private btnSendContainer: HTMLDivElement;

  private replyKeyboard: ReplyKeyboard;

  private attachMenu: HTMLElement;
  private attachMenuButtons: (ButtonMenuItemOptions & {verify: (peerId: PeerId, threadId: number) => boolean | Promise<boolean>})[];

  private sendMenu: SendMenu;

  private replyElements: {
    container: HTMLElement,
    cancelBtn: HTMLButtonElement,
    iconBtn: HTMLButtonElement
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
  private forwardHover: DropdownHover;
  private forwardWasDroppingAuthor: boolean;

  private getWebPagePromise: Promise<void>;
  private willSendWebPage: WebPage = null;
  private forwarding: {[fromPeerId: PeerId]: number[]};
  public replyToMsgId: number;
  public editMsgId: number;
  public editMessage: Message.message;
  private noWebPage: true;
  public scheduleDate: number;
  public sendSilent: true;
  public startParam: string;

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

  private previousQuery: string;
  
  private releaseMediaPlayback: () => void;

  private botStartBtn: HTMLButtonElement;
  private rowsWrapperWrapper: HTMLDivElement;
  private controlContainer: HTMLElement;
  private fakeSelectionWrapper: HTMLDivElement;

  private fakeWrapperTo: HTMLElement;
  private toggleBotStartBtnDisability: () => void;

  private botCommandsToggle: HTMLElement;
  private botCommands: ChatBotCommands;
  private botCommandsIcon: HTMLDivElement;
  private hasBotCommands: boolean;

  // private activeContainer: HTMLElement;

  private sendAs: ChatSendAs;
  public sendAsPeerId: PeerId;

  constructor(
    private chat: Chat, 
    private appImManager: AppImManager, 
    private managers: AppManagers
  ) {
    this.listenerSetter = new ListenerSetter();
  }

  public construct() {
    this.chatInput = document.createElement('div');
    this.chatInput.classList.add('chat-input', 'hide');

    this.inputContainer = document.createElement('div');
    this.inputContainer.classList.add('chat-input-container');

    this.rowsWrapperWrapper = document.createElement('div');
    this.rowsWrapperWrapper.classList.add('rows-wrapper-wrapper');

    this.rowsWrapper = document.createElement('div');
    this.rowsWrapper.classList.add('rows-wrapper', 'chat-input-wrapper');

    this.rowsWrapperWrapper.append(this.rowsWrapper);

    const tail = generateTail();
    this.rowsWrapper.append(tail);

    const fakeRowsWrapper = this.fakeRowsWrapper = document.createElement('div');
    fakeRowsWrapper.classList.add('fake-wrapper', 'fake-rows-wrapper');

    const fakeSelectionWrapper = this.fakeSelectionWrapper = document.createElement('div');
    fakeSelectionWrapper.classList.add('fake-wrapper', 'fake-selection-wrapper');

    this.inputContainer.append(this.rowsWrapperWrapper, fakeRowsWrapper, fakeSelectionWrapper);
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

    const c = this.controlContainer = document.createElement('div');
    c.classList.add('chat-input-control', 'chat-input-wrapper');
    this.inputContainer.append(c);
  }

  public constructPeerHelpers() {
    this.replyElements.container = document.createElement('div');
    this.replyElements.container.classList.add('reply-wrapper');

    this.replyElements.iconBtn = ButtonIcon('');
    this.replyElements.cancelBtn = ButtonIcon('close reply-cancel', {noRipple: true});

    this.replyElements.container.append(this.replyElements.iconBtn, this.replyElements.cancelBtn);

    //

    const onHideAuthorClick = () => {
      isChangingAuthor = true;
      return this.canToggleHideAuthor();
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
        checkboxField: new CheckboxField({checked: true})
      },
      forwardElements.hideSender = {
        text: 'Chat.Alert.Forward.Action.Hide1',
        onClick: onHideAuthorClick,
        checkboxField: new CheckboxField({checked: false})
      },
      forwardElements.showCaption = {
        text: 'Chat.Alert.Forward.Action.ShowCaption',
        onClick: onHideCaptionClick,
        checkboxField: new CheckboxField({checked: true})
      },
      forwardElements.hideCaption = {
        text: 'Chat.Alert.Forward.Action.HideCaption',
        onClick: onHideCaptionClick,
        checkboxField: new CheckboxField({checked: false})
      },
      forwardElements.changePeer = {
        text: 'Chat.Alert.Forward.Action.Another',
        onClick: () => {
          this.changeForwardRecipient();
        },
        icon: 'replace'
      }
    ];
    const forwardBtnMenu = forwardElements.container = ButtonMenu(forwardButtons, this.listenerSetter);
    // forwardBtnMenu.classList.add('top-center');

    const children = Array.from(forwardBtnMenu.children) as HTMLElement[];
    const groups: {
      elements: HTMLElement[],
      onChange: (value: string, event: Event) => void
    }[] = [{
      elements: children.slice(0, 2),
      onChange: (value, e) => {
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
      }
    }, {
      elements: children.slice(2, 4),
      onChange: (value) => {
        const checked = !!+value;
        let b: ButtonMenuItemOptions;
        if(checked && this.forwardWasDroppingAuthor !== undefined) {
          b = this.forwardWasDroppingAuthor ? forwardElements.hideSender : forwardElements.showSender;
        } else {
          b = checked ? forwardElements.showSender : forwardElements.hideSender;
        }

        b.checkboxField.checked = true;
      }
    }];
    groups.forEach((group) => {
      const container = RadioForm(group.elements.map((e) => {
        return {
          container: e, 
          input: e.querySelector('input')
        };
      }), group.onChange);

      const hr = document.createElement('hr');
      container.append(hr);
      forwardBtnMenu.append(container);
    });

    forwardBtnMenu.append(forwardElements.changePeer.element);

    if(!IS_TOUCH_SUPPORTED) {
      const forwardHover = this.forwardHover = new DropdownHover({
        element: forwardBtnMenu
      });
    }

    forwardElements.modifyArgs = forwardButtons.slice(0, -1);
    this.replyElements.container.append(forwardBtnMenu);

    forwardElements.modifyArgs.forEach((b, idx) => {
      const {input} = b.checkboxField;
      input.type = 'radio';
      input.name = idx < 2 ? 'author' : 'caption';
      input.value = '' + +!(idx % 2);
    });

    //

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
        const middleware = this.chat.bubbles.getMiddleware();
        this.managers.appMessagesManager.goToNextMention(this.chat.peerId).then((mid) => {
          if(!middleware()) {
            return;
          }
          
          if(mid) {
            this.chat.setMessageId(mid);
          }
        });
      }, {listenerSetter: this.listenerSetter});

      this.btnScheduled = ButtonIcon('scheduled btn-scheduled float hide', {noRipple: true});

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

      this.btnToggleReplyMarkup = ButtonIcon('botcom toggle-reply-markup float hide', {noRipple: true});
      this.replyKeyboard = new ReplyKeyboard({
        appendTo: this.rowsWrapper,
        listenerSetter: this.listenerSetter,
        managers: this.managers,
        btnHover: this.btnToggleReplyMarkup,
        chatInput: this
      });
      this.listenerSetter.add(this.replyKeyboard)('open', () => this.btnToggleReplyMarkup.classList.add('active'));
      this.listenerSetter.add(this.replyKeyboard)('close', () => this.btnToggleReplyMarkup.classList.remove('active'));

      this.botCommands = new ChatBotCommands(this.rowsWrapper, this, this.managers);
      this.botCommandsToggle = document.createElement('div');
      this.botCommandsToggle.classList.add('new-message-bot-commands');

      const scaler = document.createElement('div');
      scaler.classList.add('new-message-bot-commands-icon-scale');

      const icon = this.botCommandsIcon = document.createElement('div');
      icon.classList.add('animated-menu-icon', 'animated-menu-close-icon');
      scaler.append(icon);
      this.botCommandsToggle.append(scaler);

      attachClickEvent(this.botCommandsToggle, (e) => {
        cancelEvent(e);
        const isShown = icon.classList.contains('state-back');
        if(isShown) {
          this.botCommands.toggle(true);
          icon.classList.remove('state-back');
        } else {
          this.botCommands.setUserId(this.chat.peerId.toUserId(), this.chat.bubbles.getMiddleware());
          icon.classList.add('state-back');
        }
      }, {listenerSetter: this.listenerSetter});

      this.botCommands.addEventListener('visible', () => {
        icon.classList.add('state-back');
      });

      this.botCommands.addEventListener('hiding', () => {
        icon.classList.remove('state-back');
      });
    }

    this.attachMenuButtons = [{
      icon: 'image',
      text: 'Chat.Input.Attach.PhotoOrVideo',
      onClick: () => {
        this.fileInput.value = '';
        const accept = [...MEDIA_MIME_TYPES_SUPPORTED].join(', ');
        this.fileInput.setAttribute('accept', accept);
        this.willAttachType = 'media';
        this.fileInput.click();
      },
      verify: () => this.chat.canSend('send_media')
    }, {
      icon: 'document',
      text: 'Chat.Input.Attach.Document',
      onClick: () => {
        this.fileInput.value = '';
        this.fileInput.removeAttribute('accept');
        this.willAttachType = 'document';
        this.fileInput.click();
      },
      verify: () => this.chat.canSend('send_media')
    }, {
      icon: 'poll',
      text: 'Poll',
      onClick: () => {
        PopupElement.createPopup(PopupCreatePoll, this.chat).show();
      },
      verify: (peerId) => peerId.isAnyChat() && this.chat.canSend('send_polls')
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

    this.newMessageWrapper.append(...[this.botCommandsToggle, this.btnToggleEmoticons, this.inputMessageContainer, this.btnScheduled, this.btnToggleReplyMarkup, this.attachMenu, this.recordTimeEl, this.fileInput].filter(Boolean));

    this.rowsWrapper.append(this.replyElements.container);
    this.autocompleteHelperController = new AutocompleteHelperController();
    this.stickersHelper = new StickersHelper(this.rowsWrapper, this.autocompleteHelperController, this.managers);
    this.emojiHelper = new EmojiHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.managers);
    this.commandsHelper = new CommandsHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.managers);
    this.mentionsHelper = new MentionsHelper(this.rowsWrapper, this.autocompleteHelperController, this, this.managers);
    this.inlineHelper = new InlineHelper(this.rowsWrapper, this.autocompleteHelperController, this.chat, this.managers);
    this.rowsWrapper.append(this.newMessageWrapper);

    this.btnCancelRecord = ButtonIcon('delete btn-circle z-depth-1 btn-record-cancel');

    this.btnSendContainer = document.createElement('div');
    this.btnSendContainer.classList.add('btn-send-container');

    this.recordRippleEl = document.createElement('div');
    this.recordRippleEl.classList.add('record-ripple');

    this.btnSend = ButtonIcon('none btn-circle z-depth-1 btn-send animated-button-icon');
    this.btnSend.insertAdjacentHTML('afterbegin', `
    <span class="tgico tgico-send"></span>
    <span class="tgico tgico-schedule"></span>
    <span class="tgico tgico-check"></span>
    <span class="tgico tgico-microphone_filled"></span>
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
          return !this.isInputEmpty() || !!Object.keys(this.forwarding).length;
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

    this.listenerSetter.add(rootScope)('draft_updated', ({peerId, threadId, draft, force}) => {
      if(this.chat.threadId !== threadId || this.chat.peerId !== peerId) return;
      this.setDraft(draft, true, force);
    });

    this.listenerSetter.add(this.appImManager)('peer_changing', (chat) => {
      if(this.chat === chat) {
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

          /* if(this.chat.isStartButtonNeeded()) {
            this.setStartParam(BOT_START_PARAM);
          } */
        }
      });

      this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
        if(dialogs[this.chat.peerId]) {
          if(this.startParam === BOT_START_PARAM) {
            this.setStartParam();
          } else { // updateNewMessage comes earlier than dialog appers
            this.center(true);
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
      
      PopupElement.createPopup(PopupNewMedia, this.chat, Array.from(files).slice(), this.willAttachType);
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
        this.setRecording(false);
        this.chatInput.classList.remove('is-locked');
        this.recordRippleEl.style.transform = '';
      };
  
      this.recorder.ondataavailable = (typedArray: Uint8Array) => {
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

        const {peerId, threadId} = this.chat;
        const replyToMsgId = this.replyToMsgId;
  
        const duration = (Date.now() - this.recordStartTime) / 1000 | 0;
        const dataBlob = new Blob([typedArray], {type: 'audio/ogg'});
        /* const fileName = new Date().toISOString() + ".opus";
        console.log('Recorder data received', typedArray, dataBlob); */

        //let perf = performance.now();
        opusDecodeController.decode(typedArray, true).then((result) => {
          //console.log('WAVEFORM!:', /* waveform,  */performance.now() - perf);
  
          opusDecodeController.setKeepAlive(false);
  
          // тут objectURL ставится уже с audio/wav
          this.managers.appMessagesManager.sendFile(peerId, dataBlob, {
            isVoiceMessage: true,
            isMedia: true,
            duration,
            waveform: result.waveform,
            objectURL: result.url,
            replyToMsgId,
            threadId,
            clearDraft: true
          });

          this.onMessageSent(false, true);
        });
      };
    }

    attachClickEvent(this.replyElements.cancelBtn, this.onHelperCancel, {listenerSetter: this.listenerSetter});
    attachClickEvent(this.replyElements.container, this.onHelperClick, {listenerSetter: this.listenerSetter});

    this.saveDraftDebounced = debounce(() => this.saveDraft(), 2500, false, true);

    this.botStartBtn = Button('btn-primary btn-transparent text-bold chat-input-control-button');
    this.botStartBtn.append(i18n('BotStart'));

    attachClickEvent(this.botStartBtn, () => {
      const {startParam} = this;
      if(startParam === undefined) {
        return;
      }

      const toggle = this.toggleBotStartBtnDisability = toggleDisability([this.botStartBtn], true);
      const peerId = this.chat.peerId;
      const middleware = this.chat.bubbles.getMiddleware(() => {
        return this.chat.peerId === peerId && this.startParam === startParam && this.toggleBotStartBtnDisability === toggle;
      });

      this.managers.appMessagesManager.startBot(peerId.toUserId(), undefined, startParam).then(() => {
        if(middleware()) {
          toggle();
          this.toggleBotStartBtnDisability = undefined;
          this.setStartParam();
        }
      });
    }, {listenerSetter: this.listenerSetter});

    this.controlContainer.append(this.botStartBtn);
  }

  public constructPinnedHelpers() {
    this.pinnedControlBtn = Button('btn-primary btn-transparent text-bold chat-input-control-button', {icon: 'unpin'});
    this.controlContainer.append(this.pinnedControlBtn);

    this.listenerSetter.add(this.pinnedControlBtn)('click', () => {
      const peerId = this.chat.peerId;

      new PopupPinMessage(peerId, 0, true, () => {
        this.chat.appImManager.setPeer(); // * close tab

        // ! костыль, это скроет закреплённые сообщения сразу, вместо того, чтобы ждать пока анимация перехода закончится
        const originalChat = this.chat.appImManager.chat;
        if(originalChat.topbar.pinnedMessage) {
          originalChat.topbar.pinnedMessage.pinnedMessageContainer.toggle(true);
        }
      });
    });

    this.chatInput.classList.add('type-pinned');
  }

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
            const br = 12;
            borderRadius = '' + (br + br * (1 - scale)) + 'px';
          }
        }
        //scale = widthTo / widthFrom;
      }
    // }

    this.fakeWrapperTo = neededFakeContainer;

    const duration = animate ? 200 : 0;
    SetTransition(this.inputContainer, 'is-centering', forwards, duration);
    SetTransition(this.rowsWrapperWrapper, 'is-centering-to-control', !!(forwards && neededFakeContainer && neededFakeContainer.classList.contains('chat-input-control')), duration);
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

  public async getNeededFakeContainer(startParam = this.startParam) {
    if(this.chat.selection.isSelecting) {
      return this.fakeSelectionWrapper;
    } else if(
      startParam !== undefined || 
      !(await this.chat.canSend()) || 
      this.chat.type === 'pinned' || 
      await this.chat.isStartButtonNeeded()
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

  private onEmoticonsOpen = () => {
    const toggleClass = IS_TOUCH_SUPPORTED ? 'flip-icon' : 'active';
    this.btnToggleEmoticons.classList.toggle(toggleClass, true);
  };

  private onEmoticonsClose = () => {
    const toggleClass = IS_TOUCH_SUPPORTED ? 'flip-icon' : 'active';
    this.btnToggleEmoticons.classList.toggle(toggleClass, false);
  };

  public getReadyToSend(callback: () => void) {
    return this.chat.type === 'scheduled' ? (this.scheduleSending(callback), true) : (callback(), false);
  }

  public scheduleSending = async(callback: () => void = this.sendMessage.bind(this, true), initDate = new Date()) => {
    const {peerId} = this.chat;
    const middleware = this.chat.bubbles.getMiddleware();
    const canSendWhenOnline = rootScope.myId !== peerId && peerId.isUser() && await this.managers.appUsersManager.isUserOnlineVisible(peerId);

    new PopupSchedule(initDate, (timestamp) => {
      if(!middleware()) {
        return;
      }

      const minTimestamp = (Date.now() / 1000 | 0) + 10;
      if(timestamp <= minTimestamp) {
        timestamp = undefined;
      }

      this.scheduleDate = timestamp;
      callback();

      if(this.chat.type !== 'scheduled' && timestamp) {
        setTimeout(() => { // ! need timeout here because .forwardMessages will be called after timeout
          if(!middleware()) {
            return;
          }

          this.appImManager.openScheduled(peerId);
        }, 0);
      }
    }, canSendWhenOnline).show();
  };

  public async setUnreadCount() {
    if(!this.goDownUnreadBadge) {
      return;
    }
    
    const dialog = await this.managers.appMessagesManager.getDialogOnly(this.chat.peerId);
    const count = dialog?.unread_count;
    this.goDownUnreadBadge.innerText = '' + (count || '');
    this.goDownUnreadBadge.classList.toggle('badge-gray', await this.managers.appNotificationsManager.isPeerLocalMuted(this.chat.peerId, true));

    if(this.goMentionUnreadBadge && this.chat.type === 'chat') {
      const hasMentions = !!(dialog?.unread_mentions_count && dialog.unread_count);
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
        date: tsNow(true),
        message: value,
        entities: entities.length ? entities : undefined,
        pFlags: {
          no_webpage: this.noWebPage
        },
        reply_to_msg_id: this.replyToMsgId
      };
    }

    this.managers.appDraftsManager.syncDraft(this.chat.peerId, this.chat.threadId, draft);
  }

  public destroy() {
    //this.chat.log.error('Input destroying');

    this.listenerSetter.removeAll();
  }

  public cleanup(helperToo = true) {
    if(!this.chat.peerId) {
      this.chatInput.classList.add('hide');
      this.goDownBtn.classList.add('hide');
    }

    cancelSelection();

    this.lastTimeType = 0;
    this.startParam = undefined;

    if(this.toggleBotStartBtnDisability) {
      this.toggleBotStartBtnDisability();
      this.toggleBotStartBtnDisability = undefined;
    }

    if(this.messageInput) {
      this.clearInput();
      helperToo && this.clearHelper();
    }
  }

  public async setDraft(draft?: MyDraftMessage, fromUpdate = true, force = false) {
    if((!force && !isInputEmpty(this.messageInput)) || this.chat.type === 'scheduled') return false;
    
    if(!draft) {
      draft = await this.managers.appDraftsManager.getDraft(this.chat.peerId, this.chat.threadId);

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

    const wrappedDraft = wrapDraft(draft);

    if(this.messageInputField.value === wrappedDraft && this.replyToMsgId === draft.reply_to_msg_id) return false;

    if(fromUpdate) {
      this.clearHelper();
    }

    this.noWebPage = draft.pFlags.no_webpage;
    if(draft.reply_to_msg_id) {
      this.initMessageReply(draft.reply_to_msg_id);
    }

    this.setInputValue(wrappedDraft, fromUpdate, fromUpdate);
    return true;
  }

  private createSendAs() {
    this.sendAsPeerId = undefined;

    if(this.chat.type === 'chat' || this.chat.type === 'discussion') {
      let firstChange = true;
      this.sendAs = new ChatSendAs(
        this.managers,
        (container, skipAnimation) => {
          let useRafs = 0;
          if(!container.parentElement) {
            this.newMessageWrapper.prepend(container);
            useRafs = 2;
          }

          this.updateOffset('as', true, skipAnimation, useRafs);
        },
        (sendAsPeerId) => {
          this.sendAsPeerId = sendAsPeerId;

          // do not change placeholder earlier than finishPeerChange does
          if(firstChange) {
            firstChange = false;
            return;
          }

          this.getPlaceholderKey().then((key) => {
            this.updateMessageInputPlaceholder(key);
          });
        }
      );
    } else {
      this.sendAs = undefined;
    }

    return this.sendAs;
  }

  public async finishPeerChange(startParam?: string) {
    const peerId = this.chat.peerId;

    const {forwardElements, btnScheduled, replyKeyboard, sendMenu, goDownBtn, chatInput, botCommandsToggle} = this;
    
    const previousSendAs = this.sendAs;
    const sendAs = this.createSendAs();

    const [
      isBroadcast, 
      canPinMessage, 
      isBot, 
      canSend, 
      neededFakeContainer, 
      ackedPeerFull, 
      ackedScheduledMids, 
      setSendAsCallback,
      filteredAttachMenuButtons
    ] = await Promise.all([
      this.managers.appPeersManager.isBroadcast(peerId),
      this.managers.appPeersManager.canPinMessage(peerId),
      this.managers.appPeersManager.isBot(peerId),
      this.chat.canSend(),
      this.getNeededFakeContainer(startParam),
      modifyAckedPromise(this.managers.acknowledged.appProfileManager.getProfileByPeerId(peerId)),
      btnScheduled ? modifyAckedPromise(this.managers.acknowledged.appMessagesManager.getScheduledMessages(peerId)) : undefined,
      sendAs ? (sendAs.setPeerId(this.chat.peerId), sendAs.updateManual(true)) : undefined,
      this.filterAttachMenuButtons()
    ]);

    const placeholderKey = this.messageInput ? await this.getPlaceholderKey() : undefined;

    return () => {
      // console.warn('[input] finishpeerchange start');
      
      chatInput.classList.remove('hide');
      goDownBtn.classList.toggle('is-broadcast', isBroadcast);
      goDownBtn.classList.remove('hide');
  
      if(this.goDownUnreadBadge) {
        this.setUnreadCount();
      }
  
      if(this.chat.type === 'pinned') {
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
        const middleware = this.chat.bubbles.getMiddleware();
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
        this.botCommands.toggle(true, undefined, true);
        this.updateBotCommandsToggle(true);
        botCommandsToggle.remove();
        if(isBot) {
          const middleware = this.chat.bubbles.getMiddleware();
          const result = ackedPeerFull.result;
          callbackify(result, (userFull) => {
            if(!middleware()) return;
            this.updateBotCommands(userFull as UserFull.userFull, !(result instanceof Promise));
          });
        }
      }

      if(previousSendAs) {
        previousSendAs.destroy();
      }

      if(setSendAsCallback) {
        setSendAsCallback();
      }
  
      if(replyKeyboard) {
        replyKeyboard.setPeer(peerId);
      }
  
      if(sendMenu) {
        sendMenu.setPeerId(peerId);
      }
      
      if(this.messageInput) {
        this.updateMessageInput(canSend, placeholderKey, filteredAttachMenuButtons);
      } else if(this.pinnedControlBtn) {
        this.pinnedControlBtn.append(i18n(canPinMessage ? 'Chat.Input.UnpinAll' : 'Chat.Pinned.DontShow'));
      }
  
      // * testing
      // this.startParam = this.appPeersManager.isBot(peerId) ? '123' : undefined;
      
      this.startParam = startParam;
  
      this._center(neededFakeContainer, false);

      // console.warn('[input] finishpeerchange ends');
    };
  }

  private updateOffset(type: 'commands' | 'as', forwards: boolean, skipAnimation?: boolean, useRafs?: number) {
    if(type) {
      this.newMessageWrapper.dataset.offset = type;
    } else {
      delete this.newMessageWrapper.dataset.offset;
    }

    SetTransition(this.newMessageWrapper, 'has-offset', forwards, skipAnimation ? 0 : 300, undefined, useRafs);
  }

  private updateBotCommands(userFull: UserFull.userFull, skipAnimation?: boolean) {
    this.hasBotCommands = !!userFull.bot_info?.commands?.length;
    this.updateBotCommandsToggle(skipAnimation);
  }

  private updateBotCommandsToggle(skipAnimation?: boolean) {
    const {botCommandsToggle, hasBotCommands} = this;

    const show = !!hasBotCommands && this.isInputEmpty();
    if(!hasBotCommands) {
      if(!botCommandsToggle.parentElement) {
        return;
      }
      
      botCommandsToggle.remove();
    }
    
    const forwards = show;
    const useRafs = botCommandsToggle.parentElement ? 0 : 2;

    if(!botCommandsToggle.parentElement) {
      this.newMessageWrapper.prepend(botCommandsToggle);
    }

    this.updateOffset('commands', forwards, skipAnimation, useRafs);
  }

  private async getPlaceholderKey() {
    const {peerId, threadId} = this.chat;
    let key: LangPackKey;
    if(threadId) {
      key = 'Comment';
    } else if(await this.managers.appPeersManager.isBroadcast(peerId)) {
      key = 'ChannelBroadcast';
    } else if(
      (this.sendAsPeerId !== undefined && this.sendAsPeerId !== rootScope.myId) || 
      await this.managers.appMessagesManager.isAnonymousSending(peerId)
    ) {
      key = 'SendAnonymously';
    } else {
      key = 'Message';
    }

    return key;
  }

  private updateMessageInputPlaceholder(key: LangPackKey) {
    // console.warn('[input] update placeholder');
    const i = I18n.weakMap.get(this.messageInput) as I18n.IntlElement;
    if(!i) {
      return;
    }

    i.compareAndUpdate({key});
  }

  private filterAttachMenuButtons() {
    if(!this.attachMenuButtons) return;
    const {peerId, threadId} = this.chat;
    return filterAsync(this.attachMenuButtons, (button) => {
      return button.verify(peerId, threadId);
    });
  }

  public updateMessageInput(canSend: boolean, placeholderKey: LangPackKey, visible: ChatInput['attachMenuButtons']) {
    const {chatInput, attachMenu, messageInput} = this;
    const {peerId, threadId} = this.chat;
    const isHidden = chatInput.classList.contains('is-hidden');
    const willBeHidden = !canSend;
    if(isHidden !== willBeHidden) {
      chatInput.classList.add('no-transition');
      chatInput.classList.toggle('is-hidden', !canSend);
      void chatInput.offsetLeft; // reflow
      chatInput.classList.remove('no-transition');
    }

    this.updateMessageInputPlaceholder(placeholderKey);

    this.attachMenuButtons && this.attachMenuButtons.forEach((button) => {
      button.element.classList.toggle('hide', !visible.includes(button));
    });

    if(!canSend) {
      messageInput.removeAttribute('contenteditable');
    } else {
      messageInput.setAttribute('contenteditable', 'true');
      this.setDraft(undefined, false);

      if(!messageInput.innerHTML) {
        this.messageInputField.onFakeInput();
      }
    }
    
    if(attachMenu) {
      attachMenu.toggleAttribute('disabled', !visible.length);
      attachMenu.classList.toggle('btn-disabled', !visible.length);
    }
    
    this.updateSendBtn();
  }

  private attachMessageInputField() {
    const oldInputField = this.messageInputField;
    this.messageInputField = new InputFieldAnimated({
      placeholder: 'Message',
      name: 'message',
      withLinebreaks: true
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
      const key = e.key;
      if(isSendShortcutPressed(e)) {
        cancelEvent(e);
        this.sendMessage();
      } else if(e.ctrlKey || e.metaKey) {
        this.handleMarkdownShortcut(e);
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

    if(IS_TOUCH_SUPPORTED) {
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
          this.managers.appMessagesManager.readAllHistory(this.chat.peerId, this.chat.threadId);
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
    const MONOSPACE_FONT = 'var(--font-monospace)';
    const SPOILER_FONT = 'spoiler';
    const commandsMap: Partial<{[key in typeof type]: string | (() => void)}> = {
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      strikethrough: 'Strikethrough',
      monospace: () => document.execCommand('fontName', false, MONOSPACE_FONT),
      link: href ? () => document.execCommand('createLink', false, href) : () => document.execCommand('unlink', false, null),
      spoiler: () => document.execCommand('fontName', false, SPOILER_FONT)
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

      const parents = [...new Set(nodes.map((node) => node.parentNode))];
      //const differentParents = !!nodes.find((node) => node.parentNode !== firstParent);
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

    const checkType = (type: MarkdownType) => {
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

      return haveThisType;
    };

    // * monospace can't be combined with different types
    if(type === 'monospace' || type === 'spoiler') {
      // executed.push(document.execCommand('styleWithCSS', false, 'true'));

      const haveThisType = checkType(type);
      // executed.push(document.execCommand('removeFormat', false, null));

      if(haveThisType) {
        executed.push(this.resetCurrentFontFormatting());
      } else {
        if(type === 'monospace' || checkType('monospace')) {
          executed.push(this.resetCurrentFormatting());
        }

        executed.push(typeof(command) === 'function' ? command() : document.execCommand(command, false, null));
      }
    } else {
      if(checkType('monospace')) {
        executed.push(this.resetCurrentFormatting());
      }

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

  private resetCurrentFormatting() {
    return document.execCommand('removeFormat', false, null);
  }

  private resetCurrentFontFormatting() {
    return document.execCommand('fontName', false, 'Roboto');
  }

  private handleMarkdownShortcut = (e: KeyboardEvent) => {
    // console.log('handleMarkdownShortcut', e);
    const formatKeys: {[key: string]: MarkdownType} = {
      'KeyB': 'bold',
      'KeyI': 'italic',
      'KeyU': 'underline',
      'KeyS': 'strikethrough',
      'KeyM': 'monospace',
      'KeyP': 'spoiler'
    };

    if(this.appImManager.markupTooltip) {
      formatKeys['KeyK'] = 'link';
    }

    const code = e.code;
    const applyMarkdown = formatKeys[code];

    const selection = document.getSelection();
    if(selection.toString().trim().length && applyMarkdown) {
      // * костыльчик
      if(code === 'KeyK') {
        this.appImManager.markupTooltip.showLinkEditor();
      } else {
        this.applyMarkdown(applyMarkdown);
      }
  
      cancelEvent(e); // cancel legacy event
    }

    //return;
    if(code === 'KeyZ') {
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
      
    //const entities = parseEntities(value);
    const value = parseMarkdown(richValue, markdownEntities, true);
    const entities = mergeEntities(markdownEntities, parseEntities(value));

    //this.chat.log('messageInput entities', richValue, value, markdownEntities, caretPos);

    if(this.canRedoFromHTML && !this.lockRedo && this.messageInput.innerHTML !== this.canRedoFromHTML) {
      this.canRedoFromHTML = '';
      this.undoHistory.length = 0;
    }

    const urlEntities: Array<MessageEntity.messageEntityUrl | MessageEntity.messageEntityTextUrl> = (!this.editMessage?.media || this.editMessage.media._ === 'messageMediaWebPage') && entities.filter((e) => e._ === 'messageEntityUrl' || e._ === 'messageEntityTextUrl') as any;
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
          const promise = this.getWebPagePromise = this.managers.appWebPagesManager.getWebPage(url).then((webpage) => {
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

    const isEmpty = !richValue.trim();
    if(isEmpty) {
      if(this.lastTimeType) {
        this.managers.appMessagesManager.setTyping(this.chat.peerId, {_: 'sendMessageCancelAction'});
      }

      if(this.appImManager.markupTooltip) {
        this.appImManager.markupTooltip.hide();
      }

      // * Chrome has a bug - it will preserve the formatting if the input with monospace text is cleared
      // * so have to reset formatting
      if(document.activeElement === this.messageInput) {
        // document.execCommand('styleWithCSS', false, 'true');
        setTimeout(() => {
          if(document.activeElement === this.messageInput) {
            this.resetCurrentFontFormatting();
          }
        }, 0);
        // document.execCommand('styleWithCSS', false, 'false');
      }
    } else {
      const time = Date.now();
      if(time - this.lastTimeType >= 6000) {
        this.lastTimeType = time;
        this.managers.appMessagesManager.setTyping(this.chat.peerId, {_: 'sendMessageTypingAction'});
      }

      if(this.botCommands) {
        this.botCommands.toggle(true);
      }
    }

    if(this.botCommands) {
      this.updateBotCommandsToggle();
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
    const hadEntities = parseEntities(fullValue);
    mergeEntities(entities, hadEntities);

    // max for additional whitespace
    const insertLength = insertEntity ? Math.max(insertEntity.length, insertText.length) : insertText.length;
    const addEntities: MessageEntity[] = [];
    if(insertEntity) {
      addEntities.push(insertEntity);
      insertEntity.offset = matchIndex;
    }

    // add offset to entities next to emoji
    const diff = matches ? insertLength - matches[2].length : insertLength;
    entities.forEach((entity) => {
      if(entity.offset >= matchIndex) {
        entity.offset += diff;
      }
    });

    mergeEntities(entities, addEntities);

    if(/* caretPos !== -1 && caretPos !== fullValue.length */true) {
      const caretEntity: MessageEntity.messageEntityCaret = {
        _: 'messageEntityCaret',
        offset: matchIndex + insertLength,
        length: 0
      };

      let insertCaretAtIndex = 0;
      for(let length = entities.length; insertCaretAtIndex < length; ++insertCaretAtIndex) {
        const entity = entities[insertCaretAtIndex];
        if(entity.offset > caretEntity.offset) {
          break;
        }
      }

      entities.splice(insertCaretAtIndex, 0, caretEntity);
    }

    //const saveExecuted = this.prepareDocumentExecute();
    // can't exec .value here because it will instantly check for autocomplete
    const value = documentFragmentToHTML(wrapDraftText(newValue, {entities}));
    this.messageInputField.setValueSilently(value);

    const caret = this.messageInput.querySelector('.composer-sel');
    if(caret) {
      setCaretAt(caret);
      caret.remove();
    }

    // but it's needed to be checked only here
    this.onMessageInput();

    //saveExecuted();

    //document.execCommand('insertHTML', true, wrapEmojiText(emoji));
  }

  public onEmojiSelected = (emoji: string, autocomplete: boolean) => {
    this.insertAtCaret(emoji, getEmojiEntityFromEmoji(emoji), autocomplete);
  };

  private async checkAutocomplete(value?: string, caretPos?: number, entities?: MessageEntity[]) {
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
      const _value = parseMarkdown(value, entities, true);
      entities = mergeEntities(entities, parseEntities(_value));
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

      if(this.stickersHelper && 
        rootScope.settings.stickers.suggest && 
        await this.chat.canSend('send_stickers') &&
        entity?._ === 'messageEntityEmoji' && entity.length === value.length && !entity.offset) {
        foundHelper = this.stickersHelper;
        this.stickersHelper.checkEmoticon(value);
      } else if(firstChar === '@') { // mentions
        const topMsgId = this.chat.threadId ? getServerMessageId(this.chat.threadId) : undefined;
        if(await this.mentionsHelper.checkQuery(query, this.chat.peerId.isUser() ? NULL_PEER_ID : this.chat.peerId, topMsgId)) {
          foundHelper = this.mentionsHelper;
        }
      } else if(!matches[1] && firstChar === '/') { // commands
        if(await this.commandsHelper.checkQuery(query, this.chat.peerId)) {
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

  private setRecording(value: boolean) {
    if(this.recording === value) {
      return;
    }

    SetTransition(this.chatInput, 'is-recording', value, 200);
    this.recording = value;
    this.updateSendBtn();
  }

  private onBtnSendClick = async(e: Event) => {
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
      if(this.chat.peerId.isAnyChat() && !(await this.chat.canSend('send_media'))) {
        toast(POSTING_MEDIA_NOT_ALLOWED);
        return;
      }

      this.chatInput.classList.add('is-locked');
      blurActiveElement();

      this.recorder.start().then(() => {
        this.releaseMediaPlayback = appMediaPlaybackController.setSingleMedia();
        this.recordCanceled = false;
        
        this.setRecording(true);
        opusDecodeController.setKeepAlive(true);
        
        const showDiscardPopup = () => {
          new PopupPeer('popup-cancel-record', {
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
          if(!findUpClassName(e.target, 'chat-input') && !findUpClassName(e.target, 'popup-cancel-record')) {
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
        //analyser.connect(context.destination);
        analyser.fftSize = 32;

        const frequencyData = new Uint8Array(analyser.frequencyBinCount);
        const max = frequencyData.length * 255;
        const min = 54 / 150;
        let r = () => {
          if(!this.recording) return;

          analyser.getByteFrequencyData(frequencyData);

          let sum = 0;
          frequencyData.forEach((value) => {
            sum += value;
          });
          
          let percents = Math.min(1, (sum / max) + min);
          //console.log('frequencyData', frequencyData, percents);

          this.recordRippleEl.style.transform = `scale(${percents})`;

          let diff = Date.now() - this.recordStartTime;
          let ms = diff % 1000;

          let formatted = toHHMMSS(diff / 1000) + ',' + ('00' + Math.round(ms / 10)).slice(-2);

          this.recordTimeEl.innerText = formatted;

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

  private onHelperCancel = async(e?: Event, force?: boolean) => {
    if(e) {
      cancelEvent(e);
    }

    if(this.willSendWebPage) {
      const lastUrl = this.lastUrl;
      let needReturn = false;
      if(this.helperType) {
        //if(this.helperFunc) {
          await this.helperFunc();
        //}

        needReturn = true;
      }

      // * restore values
      this.lastUrl = lastUrl;
      this.noWebPage = true;
      this.willSendWebPage = null;

      if(needReturn) return;
    }

    if(this.helperType === 'edit' && !force) {
      const message = this.editMessage
      const value = parseMarkdown(this.messageInputField.value, []);
      if(message.message !== value) {
        new PopupPeer('discard-editing', {
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
    }

    this.clearHelper();
    this.updateSendBtn();
  };

  private onHelperClick = (e: Event) => {
    cancelEvent(e);
      
    if(!findUpClassName(e.target, 'reply')) return;
    if(this.helperType === 'forward') {
      const {forwardElements} = this;
      if(forwardElements && IS_TOUCH_SUPPORTED && !forwardElements.container.classList.contains('active')) {
        contextMenuController.openBtnMenu(forwardElements.container);
      }
    } else if(this.helperType === 'reply') {
      this.chat.setMessageId(this.replyToMsgId);
    } else if(this.helperType === 'edit') {
      this.chat.setMessageId(this.editMsgId);
    }
  };

  private changeForwardRecipient() {
    if(this.helperWaitingForward) return;
    this.helperWaitingForward = true;

    const forwarding = copy(this.forwarding);
    const helperFunc = this.helperFunc;
    this.clearHelper();
    this.updateSendBtn();
    let selected = false;
    const popup = new PopupForward(forwarding, () => {
      selected = true;
    });

    popup.addEventListener('close', () => {
      this.helperWaitingForward = false;

      if(!selected) {
        helperFunc();
      }
    });
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
    let icon: 'send' | 'record' | 'edit' | 'schedule';

    const isInputEmpty = this.isInputEmpty();

    if(this.editMsgId) icon = 'edit';
    else if(!this.recorder || this.recording || !isInputEmpty || this.forwarding) icon = this.chat.type === 'scheduled' ? 'schedule' : 'send';
    else icon = 'record';

    ['send', 'record', 'edit', 'schedule'].forEach((i) => {
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
      this.managers.appMessagesManager.readAllHistory(this.chat.peerId, this.chat.threadId, true);
    }

    this.scheduleDate = undefined;
    this.sendSilent = undefined;

    const value = this.messageInputField.value;
    const entities = parseEntities(value);
    const emojiEntities: MessageEntity.messageEntityEmoji[] = entities.filter((entity) => entity._ === 'messageEntityEmoji') as any;
    emojiEntities.forEach((entity) => {
      const emoji = emojiFromCodePoints(entity.unicode);
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
  }

  public sendMessage(force = false) {
    const {editMsgId, chat} = this;
    if(chat.type === 'scheduled' && !force && !editMsgId) {
      this.scheduleSending();
      return;
    }

    const {peerId} = chat;
    const {noWebPage} = this;
    const sendingParams = this.chat.getMessageSendingParams();

    const {value, entities} = getRichValue(this.messageInputField.input);

    //return;
    if(editMsgId) {
      const message = this.editMessage;
      if(value.trim() || message.media) {
        this.managers.appMessagesManager.editMessage(message, value, {
          entities,
          noWebPage: noWebPage
        });

        this.onMessageSent();
      } else {
        new PopupDeleteMessages(peerId, [editMsgId], chat.type);

        return;
      }
    } else if(value.trim()) {
      this.managers.appMessagesManager.sendText(peerId, value, {
        entities,
        ...sendingParams,
        noWebPage: noWebPage,
        webPage: this.getWebPagePromise ? undefined : this.willSendWebPage,
        clearDraft: true
      });

      if(this.chat.type === 'scheduled') {
        this.onMessageSent(true);
      } else {
        this.onMessageSent(false, false);
      }
      // this.onMessageSent();
    }

    // * wait for sendText set messageId for invokeAfterMsg
    if(this.forwarding) {
      const forwarding = copy(this.forwarding);
      // setTimeout(() => {
        for(const fromPeerId in forwarding) {
          this.managers.appMessagesManager.forwardMessages(peerId, fromPeerId.toPeerId(), forwarding[fromPeerId], {
            ...sendingParams,
            dropAuthor: this.forwardElements && this.forwardElements.hideSender.checkboxField.checked,
            dropCaptions: this.isDroppingCaptions()
          });
        }

        if(!value) {
          this.onMessageSent();
        }
      // }, 0);
    }

    // this.onMessageSent();
  }

  public async sendMessageWithDocument(document: MyDocument | string, force = false, clearDraft = false) {
    document = await this.managers.appDocsManager.getDoc(document);

    const flag = document.type === 'sticker' ? 'send_stickers' : (document.type === 'gif' ? 'send_gifs' : 'send_media');
    if(this.chat.peerId.isAnyChat() && !(await this.chat.canSend(flag))) {
      toast(POSTING_MEDIA_NOT_ALLOWED);
      return false;
    }

    if(this.chat.type === 'scheduled' && !force) {
      this.scheduleSending(() => this.sendMessageWithDocument(document, true, clearDraft));
      return false;
    }

    if(document) {
      this.managers.appMessagesManager.sendFile(this.chat.peerId, document, {
        ...this.chat.getMessageSendingParams(),
        isMedia: true, 
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

  public async initMessageEditing(mid: number) {
    const message = (await this.chat.getMessage(mid)) as Message.message;

    let input = documentFragmentToHTML(wrapDraftText(message.message, {entities: message.totalEntities}));
    const f = async() => {
      const replyFragment = await wrapMessageForReply(message, undefined, [message.mid]);
      this.setTopInfo('edit', f, i18n('AccDescrEditing'), replyFragment, input, message);

      this.editMsgId = mid;
      this.editMessage = message;
      input = undefined;
    };
    f();
  }

  public initMessagesForward(fromPeerIdsMids: {[fromPeerId: PeerId]: number[]}) {
    const f = async() => {
      //const peerTitles: string[]
      const fromPeerIds = Object.keys(fromPeerIdsMids).map((fromPeerId) => fromPeerId.toPeerId());
      const smth: Set<string> = new Set();
      let length = 0, messagesWithCaptionsLength = 0;

      const p = fromPeerIds.map(async(fromPeerId) => {
        const mids = fromPeerIdsMids[fromPeerId];
        const promises = mids.map(async(mid) => {
          const message = (await this.managers.appMessagesManager.getMessageByPeer(fromPeerId, mid)) as Message.message;
          if(message.fwd_from?.from_name && !message.fromId && !message.fwdFromId) {
            smth.add('N' + message.fwd_from.from_name);
          } else {
            smth.add('P' + message.fromId);
          }

          if(message.media && message.message) {
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

      let firstMessage: Message.message, usingFullAlbum: boolean;
      if(fromPeerIds.length === 1) {
        const fromPeerId = fromPeerIds[0];
        const mids = fromPeerIdsMids[fromPeerId];
        firstMessage = (await this.managers.appMessagesManager.getMessageByPeer(fromPeerId, mids[0])) as Message.message;
  
        usingFullAlbum = !!firstMessage.grouped_id;
        if(usingFullAlbum) {
          const albumMids = await this.managers.appMessagesManager.getMidsByMessage(firstMessage);
          if(albumMids.length !== length || albumMids.find((mid) => !mids.includes(mid))) {
            usingFullAlbum = false;
          }
        }
      }

      const subtitleFragment = document.createDocumentFragment();
      const delimiter = ': ';
      if(usingFullAlbum || length === 1) {
        const mids = fromPeerIdsMids[fromPeerIds[0]];
        const replyFragment = await wrapMessageForReply(firstMessage, undefined, mids);
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
  
      let newReply = this.setTopInfo('forward', f, title, subtitleFragment);

      forwardElements.modifyArgs.forEach((b, idx) => {
        const text = b.textElement;
        const intl: I18n.IntlElement = I18n.weakMap.get(text) as any;
        intl.args = [idx < 2 ? fromPeerIds.length : messagesWithCaptionsLength];
        intl.update();
      });

      if(this.forwardHover) {
        this.forwardHover.attachButtonListener(newReply, this.listenerSetter);
      }

      this.forwarding = fromPeerIdsMids;
    };
    
    f();
  }

  public async initMessageReply(mid: number) {
    if(this.replyToMsgId === mid) {
      return;
    }
    
    let message = await this.chat.getMessage(mid);
    const f = () => {
      let peerTitleEl: HTMLElement;
      if(!message) { // load missing replying message
        peerTitleEl = i18n('Loading');

        this.managers.appMessagesManager.wrapSingleMessage(this.chat.peerId, mid).then((_message) => {
          if(this.replyToMsgId !== mid) {
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
    
    if(type !== 'reply') {
      this.replyToMsgId = undefined;
      this.forwarding = undefined;
    }

    this.editMsgId = this.editMessage = undefined;
    this.helperType = this.helperFunc = undefined;

    if(this.chat.container.classList.contains('is-helper-active')) {
      appNavigationController.removeByType('input-helper');
      this.chat.container.classList.remove('is-helper-active');
      this.t();
    }
  }

  private t() {
    const className = 'is-toggling-helper';
    SetTransition(this.chat.container, className, true, 150, () => {
      this.chat.container.classList.remove(className);
    });
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

  public setTopInfo(
    type: ChatInputHelperType, 
    callerFunc: () => void, 
    title: Parameters<typeof wrapReply>[0] = '', 
    subtitle: Parameters<typeof wrapReply>[1] = '', 
    input?: string, 
    message?: any
  ) {
    if(this.willSendWebPage && type === 'reply') {
      return;
    }

    if(type !== 'webpage') {
      this.clearHelper(type);
      this.helperType = type;
      this.helperFunc = callerFunc;
    }
    
    const replyParent = this.replyElements.container;
    const oldReply = replyParent.lastElementChild.previousElementSibling;
    const haveReply = oldReply.classList.contains('reply');

    this.replyElements.iconBtn.replaceWith(this.replyElements.iconBtn = ButtonIcon((type === 'webpage' ? 'link' : type) + ' active reply-icon', {noRipple: true}));
    const {container} = wrapReply(title, subtitle, message);
    if(haveReply) {
      oldReply.replaceWith(container);
    } else {
      replyParent.insertBefore(container, replyParent.lastElementChild);
    }

    if(type === 'webpage') {
      container.style.cursor = 'default';
    }

    if(!this.chat.container.classList.contains('is-helper-active')) {
      this.chat.container.classList.add('is-helper-active');
      this.t();
    }

    /* const scroll = appImManager.scrollable;
    if(scroll.isScrolledDown && !scroll.scrollLocked && !appImManager.messagesQueuePromise && !appImManager.setPeerPromise) {
      scroll.scrollTo(scroll.scrollHeight, 'top', true, true, 200);
    } */

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

    return container;
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
