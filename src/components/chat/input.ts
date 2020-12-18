import type { AppChatsManager } from '../../lib/appManagers/appChatsManager';
import type { AppDocsManager, MyDocument } from "../../lib/appManagers/appDocsManager";
import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type { AppPeersManager } from '../../lib/appManagers/appPeersManager';
import type { AppWebPagesManager } from "../../lib/appManagers/appWebPagesManager";
import type { AppImManager } from '../../lib/appManagers/appImManager';
import type Chat from './chat';
import Recorder from '../../../public/recorder.min';
import { isTouchSupported } from "../../helpers/touchSupport";
import apiManager from "../../lib/mtproto/mtprotoworker";
//import Recorder from '../opus-recorder/dist/recorder.min';
import opusDecodeController from "../../lib/opusDecodeController";
import RichTextProcessor from "../../lib/richtextprocessor";
import { attachClickEvent, blurActiveElement, cancelEvent, cancelSelection, findUpClassName, getSelectedNodes, isInputEmpty, markdownTags, MarkdownType, placeCaretAtEnd, serializeNodes } from "../../helpers/dom";
import { ButtonMenuItemOptions } from '../buttonMenu';
import emoticonsDropdown from "../emoticonsDropdown";
import PopupCreatePoll from "../popups/createPoll";
import PopupForward from '../popups/forward';
import PopupNewMedia from '../popups/newMedia';
import Scrollable from "../scrollable";
import { toast } from "../toast";
import { wrapReply } from "../wrappers";
import InputField from '../inputField';
import { MessageEntity } from '../../layer';
import StickersHelper from './stickersHelper';
import ButtonIcon from '../buttonIcon';
import DivAndCaption from '../divAndCaption';
import ButtonMenuToggle from '../buttonMenuToggle';
import ListenerSetter from '../../helpers/listenerSetter';
import Button from '../button';
import PopupSchedule from '../popups/schedule';
import SendMenu from './sendContextMenu';
import rootScope from '../../lib/rootScope';
import PopupPinMessage from '../popups/unpinMessage';

const RECORD_MIN_TIME = 500;
const POSTING_MEDIA_NOT_ALLOWED = 'Posting media content isn\'t allowed in this group.';

type ChatInputHelperType = 'edit' | 'webpage' | 'forward' | 'reply';

export default class ChatInput {
  public pageEl = document.getElementById('page-chats') as HTMLDivElement;
  public messageInput: HTMLElement;
  public messageInputField: InputField;
  public fileInput: HTMLInputElement;
  public inputMessageContainer: HTMLDivElement;
  public inputScroll: Scrollable;
  public btnSend = document.getElementById('btn-send') as HTMLButtonElement;
  public btnCancelRecord: HTMLButtonElement;
  public lastUrl = '';
  public lastTimeType = 0;

  public chatInput: HTMLElement;
  public inputContainer: HTMLElement;
  public rowsWrapper: HTMLDivElement;
  private newMessageWrapper: HTMLDivElement;
  private btnToggleEmoticons: HTMLButtonElement;
  private btnSendContainer: HTMLDivElement;

  public attachMenu: HTMLButtonElement;
  private attachMenuButtons: (ButtonMenuItemOptions & {verify: (peerId: number) => boolean})[];

  public sendMenu: SendMenu;

  public replyElements: {
    container?: HTMLElement,
    cancelBtn?: HTMLButtonElement,
    titleEl?: HTMLElement,
    subtitleEl?: HTMLElement
  } = {};

  public willSendWebPage: any = null;
  public forwardingMids: number[] = [];
  public forwardingFromPeerId: number = 0;
  public replyToMsgId: number;
  public editMsgId: number;
  public noWebPage: true;
  public scheduleDate: number;
  public sendSilent: true;

  private recorder: any;
  private recording = false;
  private recordCanceled = false;
  private recordTimeEl: HTMLElement;
  private recordRippleEl: HTMLElement;
  private recordStartTime = 0;

  private scrollTop = 0;
  private scrollOffsetTop = 0;
  private scrollDiff = 0;

  private helperType: Exclude<ChatInputHelperType, 'webpage'>;
  private helperFunc: () => void;
  private helperWaitingForward: boolean;

  public willAttachType: 'document' | 'media';

  private lockRedo = false;
  private canRedoFromHTML = '';
  readonly undoHistory: string[] = [];
  readonly executedHistory: string[] = [];
  private canUndoFromHTML = '';

  public stickersHelper: StickersHelper;
  public listenerSetter: ListenerSetter;

  public pinnedControlBtn: HTMLButtonElement;

  public goDownBtn: HTMLButtonElement;
  public goDownUnreadBadge: HTMLElement;
  btnScheduled: HTMLButtonElement;

  constructor(private chat: Chat, private appMessagesManager: AppMessagesManager, private appDocsManager: AppDocsManager, private appChatsManager: AppChatsManager, private appPeersManager: AppPeersManager, private appWebPagesManager: AppWebPagesManager, private appImManager: AppImManager) {
    this.listenerSetter = new ListenerSetter();
  }

  public construct() {
    this.chatInput = document.createElement('div');
    this.chatInput.classList.add('chat-input');
    this.chatInput.style.display = 'none';

    this.inputContainer = document.createElement('div');
    this.inputContainer.classList.add('chat-input-container');

    this.rowsWrapper = document.createElement('div');
    this.rowsWrapper.classList.add('rows-wrapper');

    this.inputContainer.append(this.rowsWrapper);
    this.chatInput.append(this.inputContainer);

    this.goDownBtn = Button('bubbles-go-down btn-corner btn-circle z-depth-1 hide', {icon: 'arrow-down'});
    this.goDownUnreadBadge = document.createElement('span');
    this.goDownUnreadBadge.classList.add('badge', 'badge-24', 'badge-green');
    this.goDownBtn.append(this.goDownUnreadBadge);
    this.chatInput.append(this.goDownBtn);

    attachClickEvent(this.goDownBtn, (e) => {
      cancelEvent(e);
      this.chat.bubbles.onGoDownClick();
    }, {listenerSetter: this.listenerSetter});

    // * constructor end
  }

  public constructPeerHelpers() {
    this.replyElements.container = document.createElement('div');
    this.replyElements.container.classList.add('reply-wrapper');

    this.replyElements.cancelBtn = ButtonIcon('close reply-cancel');

    const dac = new DivAndCaption('reply');

    this.replyElements.titleEl = dac.title;
    this.replyElements.subtitleEl = dac.subtitle;

    this.replyElements.container.append(this.replyElements.cancelBtn, dac.container);

    this.newMessageWrapper = document.createElement('div');
    this.newMessageWrapper.classList.add('new-message-wrapper');

    this.btnToggleEmoticons = ButtonIcon('none toggle-emoticons', {noRipple: true});

    this.inputMessageContainer = document.createElement('div');
    this.inputMessageContainer.classList.add('input-message-container');

    this.inputScroll = new Scrollable(this.inputMessageContainer);

    if(this.chat.type === 'chat') {
      this.btnScheduled = ButtonIcon('schedule', {noRipple: true});
      this.btnScheduled.classList.add('btn-scheduled', 'hide');

      attachClickEvent(this.btnScheduled, (e) => {
        this.appImManager.openScheduled(this.chat.peerId);
      }, {listenerSetter: this.listenerSetter});

      this.listenerSetter.add(rootScope, 'scheduled_new', (e) => {
        const peerId = e.detail.peerId;

        if(this.chat.peerId !== peerId) {
          return;
        }

        this.btnScheduled.classList.remove('hide');
      });

      this.listenerSetter.add(rootScope, 'scheduled_delete', (e) => {
        const peerId = e.detail.peerId;

        if(this.chat.peerId !== peerId) {
          return;
        }

        this.appMessagesManager.getScheduledMessages(this.chat.peerId).then(value => {
          this.btnScheduled.classList.toggle('hide', !value.length);
        });
      });
    }

    this.attachMenuButtons = [{
      icon: 'photo',
      text: 'Photo or Video',
      onClick: () => {
        this.fileInput.value = '';
        this.fileInput.setAttribute('accept', 'image/*, video/*');
        this.willAttachType = 'media';
        this.fileInput.click();
      },
      verify: (peerId: number) => peerId > 0 || this.appChatsManager.hasRights(peerId, 'send', 'send_media')
    }, {
      icon: 'document',
      text: 'Document',
      onClick: () => {
        this.fileInput.value = '';
        this.fileInput.removeAttribute('accept');
        this.willAttachType = 'document';
        this.fileInput.click();
      },
      verify: (peerId: number) => peerId > 0 || this.appChatsManager.hasRights(peerId, 'send', 'send_media')
    }, {
      icon: 'poll',
      text: 'Poll',
      onClick: () => {
        new PopupCreatePoll(this.chat).show();
      },
      verify: (peerId: number) => peerId < 0 && this.appChatsManager.hasRights(peerId, 'send', 'send_polls')
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

    this.newMessageWrapper.append(...[this.btnToggleEmoticons, this.inputMessageContainer, this.btnScheduled, this.attachMenu, this.recordTimeEl, this.fileInput].filter(Boolean));

    this.rowsWrapper.append(this.replyElements.container, this.newMessageWrapper);

    this.btnCancelRecord = ButtonIcon('delete danger btn-circle z-depth-1 btn-record-cancel');

    this.btnSendContainer = document.createElement('div');
    this.btnSendContainer.classList.add('btn-send-container');

    this.recordRippleEl = document.createElement('div');
    this.recordRippleEl.classList.add('record-ripple');

    this.btnSend = ButtonIcon('none btn-circle z-depth-1 btn-send');
    this.btnSend.insertAdjacentHTML('afterbegin', `
    <span class="tgico tgico-send"></span>
    <span class="tgico tgico-schedule"></span>
    <span class="tgico tgico-check"></span>
    <span class="tgico tgico-microphone2"></span>
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

    emoticonsDropdown.attachButtonListener(this.btnToggleEmoticons);
    emoticonsDropdown.events.onOpen.push(this.onEmoticonsOpen);
    emoticonsDropdown.events.onClose.push(this.onEmoticonsClose);

    this.attachMessageInputField();

    /* this.attachMenu.addEventListener('mousedown', (e) => {
      const hidden = this.attachMenu.querySelectorAll('.hide');
      if(hidden.length == this.attachMenuButtons.length) {
        toast(POSTING_MEDIA_NOT_ALLOWED);
        cancelEvent(e);
        return false;
      }
    }, {passive: false, capture: true}); */

    this.stickersHelper = new StickersHelper(this.rowsWrapper);

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

    this.listenerSetter.add(this.fileInput, 'change', (e) => {
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
      const onCancelRecordClick = (e: Event) => {
        cancelEvent(e);
        this.recordCanceled = true;
        this.recorder.stop();
        opusDecodeController.setKeepAlive(false);
      };
      attachClickEvent(this.btnCancelRecord, onCancelRecordClick, {listenerSetter: this.listenerSetter});

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
            replyToMsgId: this.replyToMsgId
          });

          this.onMessageSent(false, true);
        });
      };
    }

    attachClickEvent(this.replyElements.cancelBtn, this.onHelperCancel, {listenerSetter: this.listenerSetter});
    attachClickEvent(this.replyElements.container, this.onHelperClick, {listenerSetter: this.listenerSetter});
  }

  public constructPinnedHelpers() {
    const container = document.createElement('div');
    container.classList.add('pinned-container');

    this.pinnedControlBtn = Button('btn-primary btn-transparent pinned-container-button', {icon: 'unpin'});
    container.append(this.pinnedControlBtn);

    this.listenerSetter.add(this.pinnedControlBtn, 'click', () => {
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

  private onEmoticonsOpen = () => {
    const toggleClass = isTouchSupported ? 'flip-icon' : 'active';
    this.btnToggleEmoticons.classList.toggle(toggleClass, true);
  };

  private onEmoticonsClose = () => {
    const toggleClass = isTouchSupported ? 'flip-icon' : 'active';
    this.btnToggleEmoticons.classList.toggle(toggleClass, false);
  };

  public scheduleSending = (callback: () => void = this.sendMessage.bind(this, true), initDate = new Date()) => {
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
    }).show();
  };

  public setUnreadCount() {
    const dialog = this.appMessagesManager.getDialogByPeerId(this.chat.peerId)[0];
    const count = dialog?.unread_count;
    this.goDownUnreadBadge.innerText = '' + (count || '');
    this.goDownUnreadBadge.classList.toggle('badge-gray', this.appMessagesManager.isPeerMuted(this.chat.peerId));
  }

  public destroy() {
    this.chat.log.error('Input destroying');

    emoticonsDropdown.events.onOpen.findAndSplice(f => f == this.onEmoticonsOpen);
    emoticonsDropdown.events.onClose.findAndSplice(f => f == this.onEmoticonsClose);

    this.listenerSetter.removeAll();
  }

  public cleanup() {
    if(!this.chat.peerId) {
      this.chatInput.style.display = 'none';
      this.goDownBtn.classList.add('hide');
    }

    cancelSelection();

    if(this.messageInput) {
      this.clearInput();
      this.clearHelper();
    }
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

    if(this.sendMenu) {
      this.sendMenu.setPeerId(peerId);
    }

    if(this.messageInput) {
      const canWrite = this.appMessagesManager.canWriteToPeer(peerId);
      this.chatInput.classList.add('no-transition');
      this.chatInput.classList.toggle('is-hidden', !canWrite);
      void this.chatInput.offsetLeft; // reflow
      this.chatInput.classList.remove('no-transition');

      const visible = this.attachMenuButtons.filter(button => {
        const good = button.verify(peerId);
        button.element.classList.toggle('hide', !good);
        return good;
      });
  
      if(!canWrite) {
        this.messageInput.removeAttribute('contenteditable');
      } else {
        this.messageInput.setAttribute('contenteditable', 'true');
      }
      
      this.attachMenu.toggleAttribute('disabled', !visible.length);
      this.updateSendBtn();
    } else if(this.pinnedControlBtn) {
      this.pinnedControlBtn.append(this.appPeersManager.canPinMessage(this.chat.peerId) ? 'Unpin all messages' : 'Don\'t show pinned messages');
    }
  }

  private attachMessageInputField() {
    const oldInput = this.messageInputField?.input;
    this.messageInputField = new InputField({
      placeholder: 'Message',
      name: 'message'
    });

    this.messageInputField.input.className = 'input-message-input';
    this.messageInput = this.messageInputField.input;
    this.attachMessageInputListeners();

    const container = this.inputScroll.container;
    if(oldInput) {
      oldInput.replaceWith(this.messageInputField.input);
    } else {
      container.append(this.messageInputField.input);
    }
  }

  private attachMessageInputListeners() {
    this.listenerSetter.add(this.messageInput, 'keydown', (e: KeyboardEvent) => {
      if(e.key == 'Enter' && !isTouchSupported) {
        /* if(e.ctrlKey || e.metaKey) {
          this.messageInput.innerHTML += '<br>';
          placeCaretAtEnd(this.message)
          return;
        } */

        if(e.shiftKey || e.ctrlKey || e.metaKey) {
          return;
        }
  
        this.sendMessage();
      } else if(e.ctrlKey || e.metaKey) {
        this.handleMarkdownShortcut(e);
      }
    });

    if(isTouchSupported) {
      this.listenerSetter.add(this.messageInput, 'touchend', (e) => {
        this.appImManager.selectTab(1); // * set chat tab for album orientation
        this.saveScroll();
        emoticonsDropdown.toggle(false);
      });

      this.listenerSetter.add(window, 'resize', () => {
        this.restoreScroll();
      });
    }

    this.listenerSetter.add(this.messageInput, 'beforeinput', (e: Event) => {
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
    });
    this.listenerSetter.add(this.messageInput, 'input', this.onMessageInput);
  }

  private prepareDocumentExecute = () => {
    this.executedHistory.push(this.messageInput.innerHTML);
    return () => this.canUndoFromHTML = this.messageInput.innerHTML;
  };

  private undoRedo = (e: Event, type: 'undo' | 'redo', needHTML: string) => {
    cancelEvent(e); // cancel legacy event

    let html = this.messageInput.innerHTML;
    if(html && html != needHTML) {
      this.lockRedo = true;

      let sameHTMLTimes = 0;
      do {
        document.execCommand(type, false, null);
        const currentHTML = this.messageInput.innerHTML;
        if(html == currentHTML) {
          if(++sameHTMLTimes > 2) { // * unlink, removeFormat (а может и нет, случай: заболдить подчёркнутый текст (выделить ровно его), попробовать отменить)
            break;
          }
        } else {
          sameHTMLTimes = 0;
        }

        html = currentHTML;
      } while(html != needHTML);

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
    const checkForSingle = () => {
      const nodes = getSelectedNodes();
      //console.log('Using formatting:', commandsMap[type], nodes, this.executedHistory);

      const parents = [...new Set(nodes.map(node => node.parentNode))];
      //const differentParents = !!nodes.find(node => node.parentNode != firstParent);
      const differentParents = parents.length > 1;

      let notSingle = false;
      if(differentParents) {
        notSingle = true;
      } else {
        const node = nodes[0];
        if(node && (node.parentNode as HTMLElement) != this.messageInput && (node.parentNode.parentNode as HTMLElement) != this.messageInput) {
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
    };
    
    //if(type === 'monospace') {
      let haveThisType = false;
      executed.push(document.execCommand('styleWithCSS', false, 'true'));

      const selection = window.getSelection();
      if(!selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const tag = markdownTags[type];

        const node = range.commonAncestorContainer;
        if((node.parentNode as HTMLElement).matches(tag.match) || (node instanceof HTMLElement && node.matches(tag.match))) {
          haveThisType = true;
        }
      }

      executed.push(document.execCommand('removeFormat', false, null));
      
      if(!haveThisType) {
        executed.push(typeof(command) === 'function' ? command() : document.execCommand(command, false, null));
      }

      executed.push(document.execCommand('styleWithCSS', false, 'false'));
    /* } else {
      executed.push(typeof(command) === 'function' ? command() : document.execCommand(command, false, null));
    } */

    checkForSingle();
    saveExecuted();
    if(this.appImManager.markupTooltip) {
      this.appImManager.markupTooltip.setActiveMarkupButton();
    }

    return true;
  }

  private handleMarkdownShortcut = (e: KeyboardEvent) => {
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
        const good = e.code == ('Key' + key);
  
        if(good) {
          // * костыльчик
          if(key === 'K') {
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
    if(e.code == 'KeyZ') {
      const html = this.messageInput.innerHTML;

      if(e.shiftKey) {
        if(this.undoHistory.length) {
          this.executedHistory.push(this.messageInput.innerHTML);
          const html = this.undoHistory.pop();
          this.undoRedo(e, 'redo', html);
          this.canRedoFromHTML = this.undoHistory.length ? this.messageInput.innerHTML : '';
          this.canUndoFromHTML = this.messageInput.innerHTML;
        }
      } else {
        // * подождём, когда пользователь сам восстановит поле до нужного состояния, которое стало сразу после saveExecuted
        if(this.executedHistory.length && (!this.canUndoFromHTML || html == this.canUndoFromHTML)) {
          this.undoHistory.push(this.messageInput.innerHTML);
          const html = this.executedHistory.pop();
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
    if(inputType == 'formatBold') {
      console.log('message input format', this.messageInput.innerHTML);
      cancelEvent(e);
    }

    if(!isSelectionSingle()) {
      alert('not single');
    } */

    //console.log('messageInput input', this.messageInput.innerText, this.serializeNodes(Array.from(this.messageInput.childNodes)));
    //const value = this.messageInput.innerText;
    const richValue = this.messageInputField.value;
      
    //const entities = RichTextProcessor.parseEntities(value);
    const markdownEntities: MessageEntity[] = [];
    const value = RichTextProcessor.parseMarkdown(richValue, markdownEntities);
    const entities = RichTextProcessor.mergeEntities(markdownEntities, RichTextProcessor.parseEntities(value));

    //this.chat.log('messageInput entities', richValue, value, markdownEntities);

    if(this.stickersHelper) {
      let emoticon = '';
      if(entities.length && entities[0]._ == 'messageEntityEmoji') {
        const entity = entities[0];
        if(entity.length == richValue.length && !entity.offset) {
          emoticon = richValue;
        }
      }

      this.stickersHelper.checkEmoticon(emoticon);
    }

    const html = this.messageInput.innerHTML;
    if(this.canRedoFromHTML && html != this.canRedoFromHTML && !this.lockRedo) {
      this.canRedoFromHTML = '';
      this.undoHistory.length = 0;
    }

    const urlEntities: Array<MessageEntity.messageEntityUrl | MessageEntity.messageEntityTextUrl> = entities.filter(e => e._ == 'messageEntityUrl' || e._ == 'messageEntityTextUrl') as any;
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

        if(this.lastUrl != url) {
          this.lastUrl = url;
          this.willSendWebPage = null;
          apiManager.invokeApi('messages.getWebPage', {
            url,
            hash: 0
          }).then((webpage) => {
            webpage = this.appWebPagesManager.saveWebPage(webpage);
            if(webpage._  == 'webPage') {
              if(this.lastUrl != url) return;
              //console.log('got webpage: ', webpage);

              this.setTopInfo('webpage', () => {}, webpage.site_name || webpage.title || 'Webpage', webpage.description || webpage.url || '');

              delete this.noWebPage;
              this.willSendWebPage = webpage;
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

    if(!richValue.trim() && !serializeNodes(Array.from(this.messageInput.childNodes)).trim()) {
      this.messageInput.innerHTML = '';

      this.appMessagesManager.setTyping(this.chat.peerId, 'sendMessageCancelAction');
    } else {
      const time = Date.now();
      if(time - this.lastTimeType >= 6000) {
        this.lastTimeType = time;
        this.appMessagesManager.setTyping(this.chat.peerId, 'sendMessageTypingAction');
      }
    }

    this.updateSendBtn();
  };

  private onBtnSendClick = (e: Event) => {
    cancelEvent(e);

    if(!this.recorder || this.recording || !this.isInputEmpty() || this.forwardingMids.length || this.editMsgId) {
      if(this.recording) {
        if((Date.now() - this.recordStartTime) < RECORD_MIN_TIME) {
          this.btnCancelRecord.click();
        } else {
          this.recorder.stop();
        }
      } else {
        this.sendMessage();
      }
    } else {
      if(this.chat.peerId < 0 && !this.appChatsManager.hasRights(this.chat.peerId, 'send', 'send_media')) {
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

  private onHelperCancel = (e: Event) => {
    cancelEvent(e);

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
    if(this.helperType == 'forward') {
      if(this.helperWaitingForward) return;
      this.helperWaitingForward = true;

      const fromId = this.forwardingFromPeerId;
      const mids = this.forwardingMids.slice();
      const helperFunc = this.helperFunc;
      this.clearHelper();
      let selected = false;
      new PopupForward(fromId, mids, () => {
        selected = true;
      }, () => {
        this.helperWaitingForward = false;

        if(!selected) {
          helperFunc();
        }
      });
    } else if(this.helperType == 'reply') {
      this.chat.setPeer(this.chat.peerId, this.replyToMsgId);
    } else if(this.helperType == 'edit') {
      this.chat.setPeer(this.chat.peerId, this.editMsgId);
    }
  };

  public clearInput() {
    if(isTouchSupported) {
      this.messageInput.innerText = '';
    } else {
      this.attachMessageInputField();

      // clear executions
      this.canRedoFromHTML = '';
      this.undoHistory.length = 0;
      this.executedHistory.length = 0;
      this.canUndoFromHTML = '';
    }

    this.onMessageInput();
  }

  public isInputEmpty() {
    return isInputEmpty(this.messageInput);
  }

  public updateSendBtn() {
    let icon: 'send' | 'record' | 'edit' | 'schedule';

    if(this.editMsgId) icon = 'edit';
    else if(!this.recorder || this.recording || !this.isInputEmpty() || this.forwardingMids.length) icon = this.chat.type === 'scheduled' ? 'schedule' : 'send';
    else icon = 'record';

    ['send', 'record', 'edit', 'schedule'].forEach(i => {
      this.btnSend.classList.toggle(i, icon === i);
    });
  }

  public onMessageSent(clearInput = true, clearReply?: boolean) {
    if(this.chat.type !== 'scheduled') {
      let dialog = this.appMessagesManager.getDialogByPeerId(this.chat.peerId)[0];
      if(dialog && dialog.top_message) {
        this.appMessagesManager.readHistory(this.chat.peerId, dialog.top_message); // lol
      }
    }

    this.scheduleDate = undefined;
    this.sendSilent = undefined;

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

    //let str = this.serializeNodes(Array.from(this.messageInput.childNodes));
    let str = this.messageInputField.value;

    //console.log('childnode str after:', str/* , getRichValue(this.messageInput) */);

    //return;

    if(this.editMsgId) {
      this.appMessagesManager.editMessage(this.chat.getMessage(this.editMsgId), str, {
        noWebPage: this.noWebPage
      });
    } else {
      this.appMessagesManager.sendText(this.chat.peerId, str, {
        replyToMsgId: this.replyToMsgId,
        noWebPage: this.noWebPage,
        webPage: this.willSendWebPage,
        scheduleDate: this.scheduleDate,
        silent: this.sendSilent
      });
    }

    // * wait for sendText set messageId for invokeAfterMsg
    if(this.forwardingMids.length) {
      const mids = this.forwardingMids.slice();
      const fromPeerId = this.forwardingFromPeerId;
      const peerId = this.chat.peerId;
      const silent = this.sendSilent;
      const scheduleDate = this.scheduleDate;
      setTimeout(() => {
        this.appMessagesManager.forwardMessages(peerId, fromPeerId, mids, {
          silent,
          scheduleDate: scheduleDate
        });
      }, 0);
    }

    this.onMessageSent();
  }

  public sendMessageWithDocument(document: MyDocument | string, force = false) {
    document = this.appDocsManager.getDoc(document);

    const flag = document.type === 'sticker' ? 'send_stickers' : (document.type === 'gif' ? 'send_gifs' : 'send_media');
    if(this.chat.peerId < 0 && !this.appChatsManager.hasRights(this.chat.peerId, 'send', flag)) {
      toast(POSTING_MEDIA_NOT_ALLOWED);
      return;
    }

    if(this.chat.type === 'scheduled' && !force) {
      this.scheduleSending(() => this.sendMessageWithDocument(document, true));
      return false;
    }

    if(document) {
      this.appMessagesManager.sendFile(this.chat.peerId, document, {
        isMedia: true, 
        replyToMsgId: this.replyToMsgId, 
        silent: this.sendSilent, 
        scheduleDate: this.scheduleDate
      });
      this.onMessageSent(false, true);

      if(document.type == 'sticker') {
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
      this.setTopInfo('edit', f, 'Editing', message.message, input, message);
      this.editMsgId = mid;
      input = undefined;
    };
    f();
  }

  public initMessagesForward(fromPeerId: number, mids: number[]) {
    const f = () => {
      //const peerTitles: string[]
      const smth: Set<string | number> = new Set(mids.map(mid => {
        const message = this.appMessagesManager.getMessageByPeer(fromPeerId, mid);
        if(message.fwd_from && message.fwd_from.from_name && !message.fromId && !message.fwdFromId) {
          return message.fwd_from.from_name;
        } else {
          return message.fromId;
        }
      }));

      const onlyFirstName = smth.size > 1;
      const peerTitles = [...smth].map(smth => {
        return typeof(smth) === 'number' ? 
          this.appPeersManager.getPeerTitle(smth, true, onlyFirstName) : 
          (onlyFirstName ? smth.split(' ')[0] : smth);
      });

      const title = peerTitles.length < 3 ? peerTitles.join(' and ') : peerTitles[0] + ' and ' + (peerTitles.length - 1) + ' others';
      if(mids.length == 1) {
        const message = this.appMessagesManager.getMessageByPeer(fromPeerId, mids[0]);
        this.setTopInfo('forward', f, title, message.message, undefined, message);
      } else {
        this.setTopInfo('forward', f, title, mids.length + ' forwarded messages');
      }

      this.forwardingMids = mids.slice();
      this.forwardingFromPeerId = fromPeerId;
    };
    
    f();
  }

  public clearHelper(type?: ChatInputHelperType) {
    if(this.helperType == 'edit' && type != 'edit') {
      this.clearInput();
    }

    if(type) {
      this.lastUrl = '';
      delete this.noWebPage;
      this.willSendWebPage = null;
    }
    
    this.replyToMsgId = undefined;
    this.forwardingMids.length = 0;
    this.forwardingFromPeerId = 0;
    this.editMsgId = undefined;
    this.helperType = this.helperFunc = undefined;
    this.chat.container.classList.remove('is-helper-active');
  }

  public setTopInfo(type: ChatInputHelperType, callerFunc: () => void, title = '', subtitle = '', input?: string, message?: any) {
    if(type != 'webpage') {
      this.clearHelper(type);
      this.helperType = type;
      this.helperFunc = callerFunc;
    }

    if(this.replyElements.container.lastElementChild.tagName == 'DIV') {
      this.replyElements.container.lastElementChild.remove();
      this.replyElements.container.append(wrapReply(title, subtitle, message));
    }

    this.chat.container.classList.add('is-helper-active');
    /* const scroll = appImManager.scrollable;
    if(scroll.isScrolledDown && !scroll.scrollLocked && !appImManager.messagesQueuePromise && !appImManager.setPeerPromise) {
      scroll.scrollTo(scroll.scrollHeight, 'top', true, true, 200);
    } */

    if(input !== undefined) {
      this.clearInput();
      this.messageInput.innerHTML = input || '';
      this.onMessageInput();
      window.requestAnimationFrame(() => {
        placeCaretAtEnd(this.messageInput);
        this.inputScroll.scrollTop = this.inputScroll.scrollHeight;
      });
    }

    setTimeout(() => {
      this.updateSendBtn();
    }, 0);
  }

  public saveScroll() {
    this.scrollTop = this.chat.bubbles.scrollable.container.scrollTop;
    this.scrollOffsetTop = this.chatInput.offsetTop;
  }

  public restoreScroll() {
    if(this.chatInput.style.display) return;
    //console.log('input resize', offsetTop, this.chatInput.offsetTop);
    let newOffsetTop = this.chatInput.offsetTop;
    let container = this.chat.bubbles.scrollable.container;
    let scrollTop = container.scrollTop;
    let clientHeight = container.clientHeight;
    let maxScrollTop = container.scrollHeight;

    if(newOffsetTop < this.scrollOffsetTop) {
      this.scrollDiff = this.scrollOffsetTop - newOffsetTop;
      container.scrollTop += this.scrollDiff;
    } else if(scrollTop != this.scrollTop) {
      let endDiff = maxScrollTop - (scrollTop + clientHeight);
      if(endDiff < this.scrollDiff/*  && false */) {
        //container.scrollTop -= endDiff;
      } else {
        container.scrollTop -= this.scrollDiff;
      }
    }
  }
}
