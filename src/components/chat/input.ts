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
import $rootScope from '../../lib/rootScope';
import { cancelEvent, findUpClassName, getRichValue } from "../../lib/utils";
import ButtonMenu, { ButtonMenuItemOptions } from '../buttonMenu';
import emoticonsDropdown from "../emoticonsDropdown";
import PopupCreatePoll from "../popupCreatePoll";
import PopupForward from '../popupForward';
import PopupNewMedia from '../popupNewMedia';
import { ripple } from '../ripple';
import Scrollable from "../scrollable";
import { toast } from "../toast";
import { wrapReply } from "../wrappers";

const RECORD_MIN_TIME = 500;
const POSTING_MEDIA_NOT_ALLOWED = 'Posting media content isn\'t allowed in this group.';

type ChatInputHelperType = 'edit' | 'webpage' | 'forward' | 'reply';

export class ChatInput {
  public pageEl = document.getElementById('page-chats') as HTMLDivElement;
  public messageInput = document.getElementById('input-message') as HTMLDivElement/* HTMLInputElement */;
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

  constructor() {
    this.attachMenu = document.getElementById('attach-file') as HTMLButtonElement;

    let willAttachType: 'document' | 'media';
    this.attachMenuButtons = [{
      icon: 'photo',
      text: 'Photo or Video',
      onClick: () => {
        this.fileInput.value = '';
        this.fileInput.setAttribute('accept', 'image/*, video/*');
        willAttachType = 'media';
        this.fileInput.click();
      },
      verify: (peerID: number) => peerID > 0 || appChatsManager.hasRights(peerID, 'send', 'send_media')
    }, {
      icon: 'document',
      text: 'Document',
      onClick: () => {
        this.fileInput.value = '';
        this.fileInput.removeAttribute('accept');
        willAttachType = 'document';
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

    $rootScope.$on('peer_changed', (e) => {
      const peerID = e.detail;
      
      const visible = this.attachMenuButtons.filter(button => {
        const good = button.verify(peerID);
        button.element.classList.toggle('hide', !good);
        return good;
      });
      
      this.attachMenu.toggleAttribute('disabled', !visible.length);
      this.updateSendBtn();
    });

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

    this.messageInput.addEventListener('input', (e) => {
      //console.log('messageInput input', this.messageInput.innerText, this.serializeNodes(Array.from(this.messageInput.childNodes)));
  
      const value = this.messageInput.innerText;
  
      const entities = RichTextProcessor.parseEntities(value);
      //console.log('messageInput entities', entities);
  
      const entityUrl = entities.find(e => e._ == 'messageEntityUrl');
      if(entityUrl) { // need to get webpage
        const url = value.slice(entityUrl.offset, entityUrl.offset + entityUrl.length);
  
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
      }
  
      if(!value.trim() && !this.serializeNodes(Array.from(this.messageInput.childNodes)).trim()) {
        this.messageInput.innerHTML = '';

        appMessagesManager.setTyping($rootScope.selectedPeerID, 'sendMessageCancelAction');
      } else {
        const time = Date.now();
        if(time - this.lastTimeType >= 6000) {
          this.lastTimeType = time;
          appMessagesManager.setTyping($rootScope.selectedPeerID, 'sendMessageTypingAction');
        }
      }

      this.updateSendBtn();
    });

    if(!RichTextProcessor.emojiSupported) {
      this.messageInput.addEventListener('copy', (e) => {
        const selection = document.getSelection();
        
        let range = selection.getRangeAt(0);
        let ancestorContainer = range.commonAncestorContainer;
    
        let str = '';
    
        let selectedNodes = Array.from(ancestorContainer.childNodes).slice(range.startOffset, range.endOffset);
        if(selectedNodes.length) {
          str = this.serializeNodes(selectedNodes);
        } else {
          str = selection.toString();
        }
    
        //console.log('messageInput copy', str, ancestorContainer.childNodes, range);
  
        //let str = getRichValueWithCaret(this.messageInput);
        //console.log('messageInput childNode copy:', str);
    
        // @ts-ignore
        event.clipboardData.setData('text/plain', str);
        event.preventDefault();
      });
    }
    
    this.messageInput.addEventListener('paste', (e) => {
      //console.log('messageInput paste');

      e.preventDefault();
      // @ts-ignore
      let text = (e.originalEvent || e).clipboardData.getData('text/plain');
  
      let entities = RichTextProcessor.parseEntities(text);
      //console.log('messageInput paste', text, entities);
      entities = entities.filter(e => e._ == 'messageEntityEmoji' || e._ == 'messageEntityLinebreak');
      //text = RichTextProcessor.wrapEmojiText(text);
      text = RichTextProcessor.wrapRichText(text, {entities, noLinks: true});
  
      // console.log('messageInput paste after', text);
  
      // @ts-ignore
      //let html = (e.originalEvent || e).clipboardData.getData('text/html');
  
      // @ts-ignore
      //console.log('paste text', text, );
      window.document.execCommand('insertHTML', false, text);
    });

    this.fileInput.addEventListener('change', (e) => {
      let files = (e.target as HTMLInputElement & EventTarget).files;
      if(!files.length) {
        return;
      }
      
      new PopupNewMedia(Array.from(files).slice(), willAttachType);
      this.fileInput.value = '';
    }, false);

    document.addEventListener('paste', (event) => {
      const peerID = $rootScope.selectedPeerID;
      if(!peerID || $rootScope.overlayIsActive || (peerID < 0 && !appChatsManager.hasRights(peerID, 'send', 'send_media'))) {
        return;
      }

      //console.log('document paste');

      // @ts-ignore
      var items = (event.clipboardData || event.originalEvent.clipboardData).items;
      //console.log('item', event.clipboardData.getData());
      for(let i = 0; i < items.length; ++i) {
        if(items[i].kind == 'file') {
          event.preventDefault()
          event.cancelBubble = true;
          event.stopPropagation();

          let file = items[i].getAsFile();
          //console.log(items[i], file);
          if(!file) continue;

          willAttachType = file.type.indexOf('image/') === 0 ? 'media' : "document";
          new PopupNewMedia([file], willAttachType);
        }
      }
    }, true);

    const onBtnSendClick = (e: Event) => {
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
        if($rootScope.selectedPeerID < 0 && !appChatsManager.hasRights($rootScope.selectedPeerID, 'send', 'send_media')) {
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

    this.btnSend.addEventListener('touchend', onBtnSendClick);
    this.btnSend.addEventListener('click', onBtnSendClick);

    if(this.recorder) {
      const onCancelRecordClick = (e: Event) => {
        cancelEvent(e);
        this.recordCanceled = true;
        this.recorder.stop();
        opusDecodeController.setKeepAlive(false);
      };
      this.btnCancelRecord.addEventListener('touchend', onCancelRecordClick);
      this.btnCancelRecord.addEventListener('click', onCancelRecordClick);

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

    this.replyElements.cancelBtn.addEventListener('click', () => {
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
    });

    let d = false;
    this.replyElements.container.addEventListener('click', (e) => {
      if(!findUpClassName(e.target, 'reply-wrapper')) return;
      if(this.helperType == 'forward') {
        if(d) return;
        d = true;

        const mids = this.forwardingMids.slice();
        const helperFunc = this.helperFunc;
        this.clearHelper();
        let selected = false;
        new PopupForward(mids, () => {
          selected = true;
        }, () => {
          d = false;

          if(!selected) {
            helperFunc();
          }
        });
      } else if(this.helperType == 'reply') {
        appImManager.setPeer($rootScope.selectedPeerID, this.replyToMsgID);
      } else if(this.helperType == 'edit') {
        appImManager.setPeer($rootScope.selectedPeerID, this.editMsgID);
      }
    });
  }

  private isInputEmpty() {
    let value = this.messageInput.innerText;
  
    return !value.trim() && !this.serializeNodes(Array.from(this.messageInput.childNodes)).trim();
  }

  public updateSendBtn() {
    let icon: 'send' | 'record';

    if(!this.recorder || this.recording || !this.isInputEmpty() || this.forwardingMids.length) icon = 'send';
    else icon = 'record';

    this.btnSend.classList.toggle('send', icon == 'send');
    this.btnSend.classList.toggle('record', icon == 'record');
  }
  
  public serializeNodes(nodes: Node[]): string {
    return nodes.reduce((str, child: any) => {
      //console.log('childNode', str, child, typeof(child), typeof(child) === 'string', child.innerText);

      if(typeof(child) === 'object' && child.textContent) return str += child.textContent;
      if(child.innerText) return str += child.innerText;
      if(child.tagName == 'IMG' && child.classList && child.classList.contains('emoji')) return str += child.getAttribute('alt');

      return str;
    }, '');
  };

  public onMessageSent(clearInput = true, clearReply?: boolean) {
    let dialog = appMessagesManager.getDialogByPeerID(appImManager.peerID)[0];
    if(dialog && dialog.top_message) {
      appMessagesManager.readHistory(appImManager.peerID, dialog.top_message); // lol
    }

    if(clearInput) {
      this.lastUrl = '';
      delete this.noWebPage;
      this.willSendWebPage = null;
      this.messageInput.innerText = '';
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

    let input = message.message;
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
      const fromIDs = new Set(mids.map(mid => appMessagesManager.getMessage(mid).fromID));
      const onlyFirstName = fromIDs.size > 1;
      const peerTitles = [...fromIDs].map(peerID => appPeersManager.getPeerTitle(peerID, true, onlyFirstName));

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
      this.messageInput.innerText = '';
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
      this.messageInput.innerHTML = input ? RichTextProcessor.wrapRichText(input, {noLinks: true}) : '';
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
