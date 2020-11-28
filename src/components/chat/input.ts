import Recorder from '../../../public/recorder.min';
import { isTouchSupported } from "../../helpers/touchSupport";
import appChatsManager from '../../lib/appManagers/appChatsManager';
import appDocsManager, { MyDocument } from "../../lib/appManagers/appDocsManager";
import appImManager, { CHAT_ANIMATION_GROUP } from "../../lib/appManagers/appImManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager from '../../lib/appManagers/appPeersManager';
import appWebPagesManager from "../../lib/appManagers/appWebPagesManager";
import apiManager from "../../lib/mtproto/mtprotoworker";
//import Recorder from '../opus-recorder/dist/recorder.min';
import opusDecodeController from "../../lib/opusDecodeController";
import { RichTextProcessor } from "../../lib/richtextprocessor";
import rootScope from '../../lib/rootScope';
import { blurActiveElement, cancelEvent, CLICK_EVENT_NAME, findUpClassName, getRichValue, getSelectedNodes, isInputEmpty, markdownTags, MarkdownType, placeCaretAtEnd, serializeNodes } from "../../helpers/dom";
import ButtonMenu, { ButtonMenuItemOptions } from '../buttonMenu';
import emoticonsDropdown, { EmoticonsDropdown } from "../emoticonsDropdown";
import PopupCreatePoll from "../popupCreatePoll";
import PopupForward from '../popupForward';
import PopupNewMedia from '../popupNewMedia';
import { ripple } from '../ripple';
import Scrollable from "../scrollable";
import { toast } from "../toast";
import { wrapReply } from "../wrappers";
import InputField from '../inputField';
import { MessageEntity } from '../../layer';
import ButtonIcon from '../buttonIcon';
import appStickersManager from '../../lib/appManagers/appStickersManager';
import SetTransition from '../singleTransition';
import { SuperStickerRenderer } from '../emoticonsDropdown/tabs/stickers';
import LazyLoadQueue from '../lazyLoadQueue';

const RECORD_MIN_TIME = 500;
const POSTING_MEDIA_NOT_ALLOWED = 'Posting media content isn\'t allowed in this group.';

type ChatInputHelperType = 'edit' | 'webpage' | 'forward' | 'reply';

export class StickersHelper {
  private container: HTMLElement;
  private stickersContainer: HTMLElement;
  private scrollable: Scrollable;
  private superStickerRenderer: SuperStickerRenderer;
  private lazyLoadQueue: LazyLoadQueue;
  private lastEmoticon = '';

  constructor(private appendTo: HTMLElement) {

  }

  public checkEmoticon(emoticon: string) {
    if(this.lastEmoticon == emoticon) return;

    if(this.lastEmoticon && !emoticon) {
      if(this.container) {
        SetTransition(this.container, 'is-visible', false, 200/* , () => {
          this.stickersContainer.innerHTML = '';
        } */);
      }
    }

    this.lastEmoticon = emoticon;
    if(this.lazyLoadQueue) {
      this.lazyLoadQueue.clear();
    }
    
    if(!emoticon) {
      return;
    }

    appStickersManager.getStickersByEmoticon(emoticon)
    .then(stickers => {
      if(this.lastEmoticon != emoticon) {
        return;
      }

      if(this.init) {
        this.init();
        this.init = null;
      }

      this.stickersContainer.innerHTML = '';
      this.lazyLoadQueue.clear();
      if(stickers.length) {
        stickers.forEach(sticker => {
          this.stickersContainer.append(this.superStickerRenderer.renderSticker(sticker as MyDocument));
        });
      }

      SetTransition(this.container, 'is-visible', true, 200);
      this.scrollable.scrollTop = 0;
    });
  }

  private init() {
    this.container = document.createElement('div');
    this.container.classList.add('stickers-helper', 'z-depth-1');

    this.stickersContainer = document.createElement('div');
    this.stickersContainer.classList.add('stickers-helper-stickers', 'super-stickers');
    this.stickersContainer.addEventListener('click', (e) => {
      if(!findUpClassName(e.target, 'super-sticker')) {
        return;
      }

      appImManager.chatInputC.clearInput();
      EmoticonsDropdown.onMediaClick(e);
    });

    this.container.append(this.stickersContainer);

    this.scrollable = new Scrollable(this.container);
    this.lazyLoadQueue = new LazyLoadQueue();
    this.superStickerRenderer = new SuperStickerRenderer(this.lazyLoadQueue, CHAT_ANIMATION_GROUP);

    this.appendTo.append(this.container);
  }
}

export class MarkupTooltip {
  public container: HTMLElement;
  private wrapper: HTMLElement;
  private buttons: {[type in MarkdownType]: HTMLElement} = {} as any;
  private linkBackButton: HTMLElement;
  private hideTimeout: number;
  private inputs: HTMLElement[] = [];
  private addedListener = false;
  private waitingForMouseUp = false;
  private linkInput: HTMLInputElement;
  private savedRange: Range;

  private init() {
    this.container = document.createElement('div');
    this.container.classList.add('markup-tooltip', 'z-depth-1', 'hide');

    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('markup-tooltip-wrapper');
    
    const tools1 = document.createElement('div');
    const tools2 = document.createElement('div');
    tools1.classList.add('markup-tooltip-tools');
    tools2.classList.add('markup-tooltip-tools');

    const arr = ['bold', 'italic', 'underline', 'strikethrough', 'monospace', 'link'] as (keyof MarkupTooltip['buttons'])[];
    arr.forEach(c => {
      const button = ButtonIcon(c, {noRipple: true});
      tools1.append(this.buttons[c] = button);

      if(c !== 'link') {
        button.addEventListener('click', () => {
          appImManager.chatInputC.applyMarkdown(c);
        });
      } else {
        button.addEventListener('click', () => {
          this.container.classList.add('is-link');

          if(button.classList.contains('active')) {
            const startContainer = this.savedRange.startContainer;
            const anchor = startContainer.parentElement as HTMLAnchorElement;
            this.linkInput.value = anchor.href;
          } else {
            this.linkInput.value = '';
          }
        });
      }
    });

    this.linkBackButton = ButtonIcon('back', {noRipple: true});
    this.linkInput = document.createElement('input');
    this.linkInput.placeholder = 'Enter URL...';
    this.linkInput.classList.add('input-clear');
    this.linkInput.addEventListener('keydown', (e) => {
      if(e.code == 'Enter') {
        const valid = !this.linkInput.value.length || RichTextProcessor.matchUrl(this.linkInput.value);///^(http)|(https):\/\//i.test(this.linkInput.value);
        if(!valid) {
          if(this.linkInput.classList.contains('error')) {
            this.linkInput.classList.remove('error');
            void this.linkInput.offsetLeft; // reflow
          }

          this.linkInput.classList.add('error');
        } else {
          cancelEvent(e);
          this.resetSelection();
          appImManager.chatInputC.applyMarkdown('link', this.linkInput.value);
          this.hide();
        }
      } else {
        this.linkInput.classList.remove('error');
      }
    });

    this.linkBackButton.addEventListener('click', () => {
      this.container.classList.remove('is-link');
      //input.value = '';
      this.resetSelection();
    });
    
    const delimiter1 = document.createElement('span');
    const delimiter2 = document.createElement('span');
    delimiter1.classList.add('markup-tooltip-delimiter');
    delimiter2.classList.add('markup-tooltip-delimiter');
    tools1.insertBefore(delimiter1, this.buttons.link);
    tools2.append(this.linkBackButton, delimiter2, this.linkInput);
    //tools1.insertBefore(delimiter2, this.buttons.link.nextSibling);

    this.wrapper.append(tools1, tools2);
    this.container.append(this.wrapper);
    document.body.append(this.container);
  }

  private resetSelection() {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(this.savedRange);
    this.inputs[0].focus();
  }

  public hide() {
    if(this.init) return;

    this.container.classList.remove('is-visible');
    document.removeEventListener('mouseup', this.onMouseUp);
    if(this.hideTimeout) clearTimeout(this.hideTimeout);
    this.hideTimeout = window.setTimeout(() => {
      this.hideTimeout = undefined;
      this.container.classList.add('hide');
      this.container.classList.remove('is-link');
    }, 200);
  }

  public getActiveMarkupButton() {
    const nodes = getSelectedNodes();
    const parents = [...new Set(nodes.map(node => node.parentNode))];
    if(parents.length > 1) return undefined;

    const node = parents[0] as HTMLElement;
    let currentMarkup: HTMLElement;
    for(const type in markdownTags) {
      const tag = markdownTags[type as MarkdownType];
      if(node.matches(tag.match)) {
        currentMarkup = this.buttons[type as MarkdownType];
        break;
      }
    }

    return currentMarkup;
  }

  public setActiveMarkupButton() {
    const activeButton = this.getActiveMarkupButton();

    for(const i in this.buttons) {
      // @ts-ignore
      const button = this.buttons[i];
      if(button != activeButton) {
        button.classList.remove('active');
      }
    }

    if(activeButton) {
      activeButton.classList.add('active');
    }

    return activeButton;
  }

  public show() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    const selection = document.getSelection();

    if(!selection.toString().trim().length) {
      this.hide();
      return;
    }

    if(this.hideTimeout !== undefined) {
      clearTimeout(this.hideTimeout);
    }

    const range = this.savedRange = selection.getRangeAt(0);

    const activeButton = this.setActiveMarkupButton();
    
    this.container.classList.remove('is-link');
    const isFirstShow = this.container.classList.contains('hide');
    if(isFirstShow) {
      this.container.classList.remove('hide');
      this.container.classList.add('no-transition');
    }
    
    const selectionRect = range.getBoundingClientRect();
    //const containerRect = this.container.getBoundingClientRect();
    const sizesRect = this.container.firstElementChild.firstElementChild.getBoundingClientRect();
    const top = selectionRect.top - sizesRect.height - 8;
    const left = selectionRect.left + (selectionRect.width - sizesRect.width) / 2;
    //const top = selectionRect.top - 44 - 8;
    
    this.container.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    
    if(isFirstShow) {
      void this.container.offsetLeft; // reflow
      this.container.classList.remove('no-transition');
    }
    
    this.container.classList.add('is-visible');

    console.log('selection', selectionRect, activeButton);
  }

  private onMouseUp = (e: Event) => {
    if(findUpClassName(e.target, 'markup-tooltip')) return;
    this.hide();
    document.removeEventListener('mouseup', this.onMouseUp);
  };

  public setMouseUpEvent() {
    if(this.waitingForMouseUp) return;
    this.waitingForMouseUp = true;
    document.addEventListener('mouseup', (e) => {
      this.waitingForMouseUp = false;
      this.show();

      document.addEventListener('mouseup', this.onMouseUp);
    }, {once: true});
  }

  public handleSelection(input: HTMLElement) {
    this.inputs.push(input);

    if(this.addedListener) return;
    this.addedListener = true;
    document.addEventListener('selectionchange', (e) => {
      if(document.activeElement == this.linkInput) {
        return;
      }

      if(!this.inputs.includes(document.activeElement as HTMLElement)) {
        this.hide();
        return;
      }

      const selection = document.getSelection();

      if(!selection.toString().trim().length) {
        this.hide();
        return;
      }

      this.setMouseUpEvent();
    });
  }
}

export class ChatInput {
  public pageEl = document.getElementById('page-chats') as HTMLDivElement;
  public messageInput: HTMLDivElement/* HTMLInputElement */;
  public fileInput = document.getElementById('input-file') as HTMLInputElement;
  public inputMessageContainer = document.getElementsByClassName('input-message-container')[0] as HTMLDivElement;
  public inputScroll = new Scrollable(this.inputMessageContainer);
  public btnSend = document.getElementById('btn-send') as HTMLButtonElement;
  public btnCancelRecord = this.btnSend.parentElement.previousElementSibling as HTMLButtonElement;
  public lastUrl = '';
  public lastTimeType = 0;

  private inputContainer = this.btnSend.parentElement.parentElement as HTMLDivElement;
  private chatInput = this.inputContainer.parentElement as HTMLDivElement;

  public attachMenu: HTMLButtonElement;
  private attachMenuButtons: (ButtonMenuItemOptions & {verify: (peerID: number) => boolean})[];

  public replyElements: {
    container?: HTMLDivElement,
    cancelBtn?: HTMLButtonElement,
    titleEl?: HTMLDivElement,
    subtitleEl?: HTMLDivElement
  } = {};

  public willSendWebPage: any = null;
  public forwardingMids: number[] = [];
  public replyToMsgID = 0;
  public editMsgID = 0;
  public noWebPage: true;

  private recorder: any;
  private recording = false;
  private recordCanceled = false;
  private recordTimeEl = this.inputContainer.querySelector('.record-time') as HTMLDivElement;
  private recordRippleEl = this.inputContainer.querySelector('.record-ripple') as HTMLDivElement;
  private recordStartTime = 0;

  private scrollTop = 0;
  private scrollOffsetTop = 0;
  private scrollDiff = 0;

  private helperType: Exclude<ChatInputHelperType, 'webpage'>;
  private helperFunc: () => void;
  private helperWaitingForward: boolean;

  private willAttachType: 'document' | 'media';

  private lockRedo = false;
  private canRedoFromHTML = '';
  readonly undoHistory: string[] = [];
  readonly executedHistory: string[] = [];
  private canUndoFromHTML = '';

  public markupTooltip: MarkupTooltip;
  public stickersHelper: StickersHelper;

  constructor() {
    if(!isTouchSupported) {
      this.markupTooltip = new MarkupTooltip();
    }

    this.attachMessageInputField();

    this.attachMenu = document.getElementById('attach-file') as HTMLButtonElement;

    this.attachMenuButtons = [{
      icon: 'photo',
      text: 'Photo or Video',
      onClick: () => {
        this.fileInput.value = '';
        this.fileInput.setAttribute('accept', 'image/*, video/*');
        this.willAttachType = 'media';
        this.fileInput.click();
      },
      verify: (peerID: number) => peerID > 0 || appChatsManager.hasRights(peerID, 'send', 'send_media')
    }, {
      icon: 'document',
      text: 'Document',
      onClick: () => {
        this.fileInput.value = '';
        this.fileInput.removeAttribute('accept');
        this.willAttachType = 'document';
        this.fileInput.click();
      },
      verify: (peerID: number) => peerID > 0 || appChatsManager.hasRights(peerID, 'send', 'send_media')
    }, {
      icon: 'poll',
      text: 'Poll',
      onClick: () => {
        new PopupCreatePoll().show();
      },
      verify: (peerID: number) => peerID < 0 && appChatsManager.hasRights(peerID, 'send', 'send_polls')
    }];

    /* this.attachMenu.addEventListener('mousedown', (e) => {
      const hidden = this.attachMenu.querySelectorAll('.hide');
      if(hidden.length == this.attachMenuButtons.length) {
        toast(POSTING_MEDIA_NOT_ALLOWED);
        cancelEvent(e);
        return false;
      }
    }, {passive: false, capture: true}); */

    const attachBtnMenu = ButtonMenu(this.attachMenuButtons);
    attachBtnMenu.classList.add('top-left');
    this.attachMenu.append(attachBtnMenu);

    ripple(this.attachMenu);

    this.replyElements.container = this.pageEl.querySelector('.reply-wrapper') as HTMLDivElement;
    this.replyElements.cancelBtn = this.replyElements.container.querySelector('.reply-cancel') as HTMLButtonElement;
    this.replyElements.titleEl = this.replyElements.container.querySelector('.reply-title') as HTMLDivElement;
    this.replyElements.subtitleEl = this.replyElements.container.querySelector('.reply-subtitle') as HTMLDivElement;

    this.stickersHelper = new StickersHelper(this.replyElements.container.parentElement);

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

    rootScope.on('peer_changed', (e) => {
      const peerID = e.detail;
      
      const visible = this.attachMenuButtons.filter(button => {
        const good = button.verify(peerID);
        button.element.classList.toggle('hide', !good);
        return good;
      });
      
      this.attachMenu.toggleAttribute('disabled', !visible.length);
      this.updateSendBtn();
    });

    this.fileInput.addEventListener('change', (e) => {
      let files = (e.target as HTMLInputElement & EventTarget).files;
      if(!files.length) {
        return;
      }
      
      new PopupNewMedia(Array.from(files).slice(), this.willAttachType);
      this.fileInput.value = '';
    }, false);

    document.addEventListener('paste', this.onDocumentPaste, true);

    this.btnSend.addEventListener(CLICK_EVENT_NAME, this.onBtnSendClick);

    if(this.recorder) {
      const onCancelRecordClick = (e: Event) => {
        cancelEvent(e);
        this.recordCanceled = true;
        this.recorder.stop();
        opusDecodeController.setKeepAlive(false);
      };
      this.btnCancelRecord.addEventListener(CLICK_EVENT_NAME, onCancelRecordClick);

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
  
        /* var url = URL.createObjectURL( dataBlob );
  
        var audio = document.createElement('audio');
        audio.controls = true;
        audio.src = url;
  
        var link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.innerHTML = link.download;
  
        var li = document.createElement('li');
        li.appendChild(link);
        li.appendChild(audio);
  
        document.body.append(li);
  
        return; */
  
        //let perf = performance.now();
        opusDecodeController.decode(typedArray, true).then(result => {
          //console.log('WAVEFORM!:', /* waveform,  */performance.now() - perf);
  
          opusDecodeController.setKeepAlive(false);
  
          let peerID = appImManager.peerID;
          // тут objectURL ставится уже с audio/wav
          appMessagesManager.sendFile(peerID, dataBlob, {
            isVoiceMessage: true,
            isMedia: true,
            duration,
            waveform: result.waveform,
            objectURL: result.url,
            replyToMsgID: this.replyToMsgID
          });

          this.onMessageSent(false, true);
        });
  
        /* const url = URL.createObjectURL(dataBlob);
        
        var audio = document.createElement('audio');
        audio.controls = true;
        audio.src = url;
  
        var link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.innerHTML = link.download;
  
        var li = document.createElement('li');
        li.appendChild(link);
        li.appendChild(audio);
  
        recordingslist.appendChild(li); */
      };
    }

    this.replyElements.cancelBtn.addEventListener(CLICK_EVENT_NAME, this.onHelperCancel);
    this.replyElements.container.addEventListener(CLICK_EVENT_NAME, this.onHelperClick);
  }

  private attachMessageInputField() {
    const messageInputField = InputField({
      placeholder: 'Message',
      name: 'message'
    });

    messageInputField.input.className = '';
    this.messageInput = messageInputField.input;
    this.attachMessageInputListeners();

    const container = this.inputScroll.container;
    if(container.firstElementChild) {
      container.replaceChild(messageInputField.input, container.firstElementChild);
    } else {
      container.append(messageInputField.input);
    }
  }

  private attachMessageInputListeners() {
    this.messageInput.addEventListener('keydown', (e: KeyboardEvent) => {
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
      this.messageInput.addEventListener('touchend', (e) => {
        appImManager.selectTab(1); // * set chat tab for album orientation
        this.saveScroll();
        emoticonsDropdown.toggle(false);
      });

      window.addEventListener('resize', () => {
        this.restoreScroll();
      });
    }

    this.messageInput.addEventListener('beforeinput', (e: Event) => {
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
    this.messageInput.addEventListener('input', this.onMessageInput);

    if(this.markupTooltip) {
      this.markupTooltip.handleSelection(this.messageInput);
    }
  }

  private onDocumentPaste = (e: ClipboardEvent) => {
    const peerID = rootScope.selectedPeerID;
    if(!peerID || rootScope.overlayIsActive || (peerID < 0 && !appChatsManager.hasRights(peerID, 'send', 'send_media'))) {
      return;
    }

    //console.log('document paste');

    // @ts-ignore
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    //console.log('item', event.clipboardData.getData());
    //let foundFile = false;
    for(let i = 0; i < items.length; ++i) {
      if(items[i].kind == 'file') {
        e.preventDefault()
        e.cancelBubble = true;
        e.stopPropagation();
        //foundFile = true;

        let file = items[i].getAsFile();
        //console.log(items[i], file);
        if(!file) continue;

        this.willAttachType = file.type.indexOf('image/') === 0 ? 'media' : "document";
        new PopupNewMedia([file], this.willAttachType);
      }
    }
  };

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
    if(this.markupTooltip) {
      this.markupTooltip.setActiveMarkupButton();
    }

    return true;
  }

  private handleMarkdownShortcut = (e: KeyboardEvent) => {
    const formatKeys: {[key: string]: MarkdownType} = {
      'B': 'bold',
      'I': 'italic',
      'U': 'underline',
      'S': 'strikethrough',
      'M': 'monospace'
    };

    for(const key in formatKeys) {
      const good = e.code == ('Key' + key);
      if(good) {
        this.applyMarkdown(formatKeys[key]);
        cancelEvent(e); // cancel legacy event
        break;
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
    const value = getRichValue(this.messageInput);
      
    const entities = RichTextProcessor.parseEntities(value);
    //console.log('messageInput entities', entities);

    if(this.stickersHelper) {
      let emoticon = '';
      if(entities.length && entities[0]._ == 'messageEntityEmoji') {
        const entity = entities[0];
        if(entity.length == value.length && !entity.offset) {
          emoticon = value;
        }
      }

      this.stickersHelper.checkEmoticon(emoticon);
    }

    const html = this.messageInput.innerHTML;
    if(this.canRedoFromHTML && html != this.canRedoFromHTML && !this.lockRedo) {
      this.canRedoFromHTML = '';
      this.undoHistory.length = 0;
    }

    const urlEntities = entities.filter(e => e._ == 'messageEntityUrl');
    if(urlEntities.length) {
      const richEntities: MessageEntity[] = [];
      const richValue = RichTextProcessor.parseMarkdown(getRichValue(this.messageInput), richEntities);
      //console.log('messageInput url', entities, richEntities);
      for(const entity of urlEntities) {
        const url = value.slice(entity.offset, entity.offset + entity.length);

        if(!(url.includes('http://') || url.includes('https://')) && !richEntities.find(e => e._ == 'messageEntityTextUrl')) {
          continue;
        }

        //console.log('messageInput url:', url);

        if(this.lastUrl != url) {
          this.lastUrl = url;
          this.willSendWebPage = null;
          apiManager.invokeApi('messages.getWebPage', {
            url: url,
            hash: 0
          }).then((webpage) => {
            webpage = appWebPagesManager.saveWebPage(webpage);
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

    if(!value.trim() && !serializeNodes(Array.from(this.messageInput.childNodes)).trim()) {
      this.messageInput.innerHTML = '';

      appMessagesManager.setTyping(rootScope.selectedPeerID, 'sendMessageCancelAction');
    } else {
      const time = Date.now();
      if(time - this.lastTimeType >= 6000) {
        this.lastTimeType = time;
        appMessagesManager.setTyping(rootScope.selectedPeerID, 'sendMessageTypingAction');
      }
    }

    this.updateSendBtn();
  };

  private onBtnSendClick = (e: Event) => {
    cancelEvent(e);
      
    if(!this.recorder || this.recording || !this.isInputEmpty() || this.forwardingMids.length) {
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
      if(rootScope.selectedPeerID < 0 && !appChatsManager.hasRights(rootScope.selectedPeerID, 'send', 'send_media')) {
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
      this.noWebPage = true;
      this.willSendWebPage = null;

      if(this.helperType) {
        //if(this.helperFunc) {
          this.helperFunc();
        //}

        return;
      }
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

      const mids = this.forwardingMids.slice();
      const helperFunc = this.helperFunc;
      this.clearHelper();
      let selected = false;
      new PopupForward(mids, () => {
        selected = true;
      }, () => {
        this.helperWaitingForward = false;

        if(!selected) {
          helperFunc();
        }
      });
    } else if(this.helperType == 'reply') {
      appImManager.setPeer(rootScope.selectedPeerID, this.replyToMsgID);
    } else if(this.helperType == 'edit') {
      appImManager.setPeer(rootScope.selectedPeerID, this.editMsgID);
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
    let icon: 'send' | 'record';

    if(!this.recorder || this.recording || !this.isInputEmpty() || this.forwardingMids.length || this.editMsgID) icon = 'send';
    else icon = 'record';

    this.btnSend.classList.toggle('send', icon == 'send');
    this.btnSend.classList.toggle('record', icon == 'record');
  }

  public onMessageSent(clearInput = true, clearReply?: boolean) {
    let dialog = appMessagesManager.getDialogByPeerID(appImManager.peerID)[0];
    if(dialog && dialog.top_message) {
      appMessagesManager.readHistory(appImManager.peerID, dialog.top_message); // lol
    }

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

  public sendMessage() {
    //let str = this.serializeNodes(Array.from(this.messageInput.childNodes));
    let str = getRichValue(this.messageInput);

    //console.log('childnode str after:', str/* , getRichValue(this.messageInput) */);

    //return;

    if(this.editMsgID) {
      appMessagesManager.editMessage(this.editMsgID, str, {
        noWebPage: this.noWebPage
      });
    } else {
      appMessagesManager.sendText(appImManager.peerID, str, {
        replyToMsgID: this.replyToMsgID == 0 ? undefined : this.replyToMsgID,
        noWebPage: this.noWebPage,
        webPage: this.willSendWebPage
      });
    }

    // * wait for sendText set messageID for invokeAfterMsg
    if(this.forwardingMids.length) {
      const mids = this.forwardingMids.slice();
      setTimeout(() => {
        appMessagesManager.forwardMessages(appImManager.peerID, mids);
      }, 0);
    }

    this.onMessageSent();
  }

  public sendMessageWithDocument(document: any) {
    document = appDocsManager.getDoc(document);
    if(document && document._ != 'documentEmpty') {
      appMessagesManager.sendFile(appImManager.peerID, document, {isMedia: true, replyToMsgID: this.replyToMsgID});
      this.onMessageSent(false, true);

      if(document.type == 'sticker') {
        emoticonsDropdown.stickersTab?.pushRecentSticker(document);
      }

      return true;
    }
    
    return false;
  }

  public initMessageEditing(mid: number) {
    const message = appMessagesManager.getMessage(mid);

    let input = RichTextProcessor.wrapDraftText(message.message, {entities: message.totalEntities});
    const f = () => {
      this.setTopInfo('edit', f, 'Editing', message.message, input, message);
      this.editMsgID = mid;
      input = undefined;
    };
    f();
  }

  public initMessagesForward(mids: number[]) {
    const f = () => {
      //const peerTitles: string[]
      const smth: Set<string | number> = new Set(mids.map(mid => {
        const message = appMessagesManager.getMessage(mid);
        if(message.fwd_from && message.fwd_from.from_name && !message.fromID && !message.fwdFromID) {
          return message.fwd_from.from_name;
        } else {
          return message.fromID;
        }
      }));

      const onlyFirstName = smth.size > 1;
      const peerTitles = [...smth].map(smth => {
        return typeof(smth) === 'number' ? 
          appPeersManager.getPeerTitle(smth, true, onlyFirstName) : 
          (onlyFirstName ? smth.split(' ')[0] : smth);
      });

      const title = peerTitles.length < 3 ? peerTitles.join(' and ') : peerTitles[0] + ' and ' + (peerTitles.length - 1) + ' others';
      if(mids.length == 1) {
        const message = appMessagesManager.getMessage(mids[0]);
        this.setTopInfo('forward', f, title, message.message, undefined, message);
      } else {
        this.setTopInfo('forward', f, title, mids.length + ' forwarded messages');
      }

      this.forwardingMids = mids.slice();
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
    
    this.replyToMsgID = 0;
    this.forwardingMids.length = 0;
    this.editMsgID = 0;
    this.helperType = this.helperFunc = undefined;
    this.chatInput.parentElement.classList.remove('is-helper-active');
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

    this.chatInput.parentElement.classList.add('is-helper-active');
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
    this.scrollTop = appImManager.scrollable.container.scrollTop;
    this.scrollOffsetTop = this.chatInput.offsetTop;
  }

  public restoreScroll() {
    if(this.chatInput.style.display) return;
    //console.log('input resize', offsetTop, this.chatInput.offsetTop);
    let newOffsetTop = this.chatInput.offsetTop;
    let container = appImManager.scrollable.container;
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
