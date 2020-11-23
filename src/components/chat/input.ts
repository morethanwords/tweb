import Recorder from '../../../public/recorder.min';
import { isTouchSupported } from "../../helpers/touchSupport";
import appChatsManager from '../../lib/appManagers/appChatsManager';
import appDocsManager from "../../lib/appManagers/appDocsManager";
import appImManager from "../../lib/appManagers/appImManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager from '../../lib/appManagers/appPeersManager';
import appWebPagesManager from "../../lib/appManagers/appWebPagesManager";
import apiManager from "../../lib/mtproto/mtprotoworker";
//import Recorder from '../opus-recorder/dist/recorder.min';
import opusDecodeController from "../../lib/opusDecodeController";
import { RichTextProcessor } from "../../lib/richtextprocessor";
import rootScope from '../../lib/rootScope';
import { cancelEvent, CLICK_EVENT_NAME, findUpClassName, getRichValue, isInputEmpty, placeCaretAtEnd, serializeNodes } from "../../helpers/dom";
import ButtonMenu, { ButtonMenuItemOptions } from '../buttonMenu';
import emoticonsDropdown from "../emoticonsDropdown";
import PopupCreatePoll from "../popupCreatePoll";
import PopupForward from '../popupForward';
import PopupNewMedia from '../popupNewMedia';
import { ripple } from '../ripple';
import Scrollable from "../scrollable";
import { toast } from "../toast";
import { wrapReply } from "../wrappers";
import InputField from '../inputField';
import { MessageEntity } from '../../layer';

const RECORD_MIN_TIME = 500;
const POSTING_MEDIA_NOT_ALLOWED = 'Posting media content isn\'t allowed in this group.';

type ChatInputHelperType = 'edit' | 'webpage' | 'forward' | 'reply';

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

  constructor() {
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
        this.saveScroll();
        emoticonsDropdown.toggle(false);
      });

      window.addEventListener('resize', () => {
        this.restoreScroll();
      });
    }

    this.messageInput.addEventListener('input', this.onMessageInput);
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

  private handleMarkdownShortcut = (e: KeyboardEvent) => {
    const formatKeys: {[key: string]: string | (() => void)} = {
      'B': 'Bold',
      'I': 'Italic',
      'U': 'Underline',
      'S': 'Strikethrough',
      'M': () => document.execCommand('fontName', false, 'monospace')
    };

    for(const key in formatKeys) {
      const good = e.code == ('Key' + key);
      if(good) {
        const getSelectedNodes = () => {
          const nodes: Node[] = [];
          const selection = window.getSelection();
          for(let i = 0; i < selection.rangeCount; ++i) {
            const range = selection.getRangeAt(i);
            let {startContainer, endContainer} = range;
            if(endContainer.nodeType != 3) endContainer = endContainer.firstChild;
            
            while(startContainer && startContainer != endContainer) {
              nodes.push(startContainer.nodeType == 3 ? startContainer : startContainer.firstChild);
              startContainer = startContainer.nextSibling;
            }
            
            if(nodes[nodes.length - 1] != endContainer) {
              nodes.push(endContainer);
            }
          }

          // * filter null's due to <br>
          return nodes.filter(node => !!node);
        };
        
        const saveExecuted = this.prepareDocumentExecute();
        const executed: any[] = [];
        /**
         * * clear previous formatting, due to Telegram's inability to handle several entities
         */
        const checkForSingle = () => {
          const nodes = getSelectedNodes();
          console.log('Using formatting:', formatKeys[key], nodes, this.executedHistory);

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
            if(key == 'M') {
              executed.push(document.execCommand('styleWithCSS', false, 'true'));
            }

            executed.push(document.execCommand('unlink', false, null));
            executed.push(document.execCommand('removeFormat', false, null));
            // @ts-ignore
            executed.push(typeof(formatKeys[key]) === 'function' ? formatKeys[key]() : document.execCommand(formatKeys[key], false, null));

            if(key == 'M') {
              executed.push(document.execCommand('styleWithCSS', false, 'false'));
            }
          }
        };
        
        if(key == 'M') {
          let haveMonospace = false;
          executed.push(document.execCommand('styleWithCSS', false, 'true'));

          const selection = window.getSelection();
          if(!selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            // @ts-ignore
            if(range.commonAncestorContainer.parentNode.tagName == 'SPAN' || range.commonAncestorContainer.tagName == 'SPAN') {
              haveMonospace = true;
            }
          }

          executed.push(document.execCommand('removeFormat', false, null));
          
          if(!haveMonospace) {
            // @ts-ignore
            executed.push(typeof(formatKeys[key]) === 'function' ? formatKeys[key]() : document.execCommand(formatKeys[key], false, null));
          }

          executed.push(document.execCommand('styleWithCSS', false, 'false'));
        } else {
          // @ts-ignore
          executed.push(typeof(formatKeys[key]) === 'function' ? formatKeys[key]() : document.execCommand(formatKeys[key], false, null));
        }
        
        checkForSingle();
        saveExecuted();
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

  private onMessageInput = (/* e: Event */) => {
    //console.log('messageInput input', this.messageInput.innerText, this.serializeNodes(Array.from(this.messageInput.childNodes)));
    const value = this.messageInput.innerText;
      
    const entities = RichTextProcessor.parseEntities(value);
    //console.log('messageInput entities', entities);

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
