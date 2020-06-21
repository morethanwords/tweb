import Scrollable from "./scrollable_new";
import { RichTextProcessor } from "../lib/richtextprocessor";
//import apiManager from "../lib/mtproto/apiManager";
import apiManager from "../lib/mtproto/mtprotoworker";
import appWebPagesManager from "../lib/appManagers/appWebPagesManager";
import appImManager from "../lib/appManagers/appImManager";
import { getRichValue, calcImageInBox } from "../lib/utils";
import { wrapDocument, wrapReply } from "./wrappers";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import { Layouter, RectPart } from "./groupedLayout";
import Recorder from '../../public/recorder.min';
//import Recorder from '../opus-recorder/dist/recorder.min';
import opusDecodeController from "../lib/opusDecodeController";
import { touchSupport } from "../lib/config";
import appDocsManager from "../lib/appManagers/appDocsManager";
import emoticonsDropdown from "./emoticonsDropdown";
import PopupCreatePoll from "./popupCreatePoll";

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

  public attachMenu: {
    container?: HTMLButtonElement,
    media?: HTMLDivElement,
    document?: HTMLDivElement,
    poll?: HTMLDivElement
  } = {};

  public attachMediaPopUp: {
    container?: HTMLDivElement,
    titleEl?: HTMLDivElement,
    sendBtn?: HTMLButtonElement,
    mediaContainer?: HTMLDivElement,
    captionInput?: HTMLInputElement
  } = {};

  public replyElements: {
    container?: HTMLDivElement,
    cancelBtn?: HTMLButtonElement,
    titleEl?: HTMLDivElement,
    subtitleEl?: HTMLDivElement
  } = {};

  public willSendWebPage: any = null;
  public replyToMsgID = 0;
  public editMsgID = 0;
  public noWebPage = false;

  private recorder: any;
  private recording = false;
  private recordCanceled = false;
  private recordTimeEl = this.inputContainer.querySelector('.record-time') as HTMLDivElement;
  private recordRippleEl = this.inputContainer.querySelector('.record-ripple') as HTMLDivElement;
  private recordStartTime = 0;

  private scrollTop = 0;
  private scrollOffsetTop = 0;
  private scrollDiff = 0;

  constructor() {
    this.attachMenu.container = document.getElementById('attach-file') as HTMLButtonElement;
    this.attachMenu.media = this.attachMenu.container.querySelector('.menu-media') as HTMLDivElement;
    this.attachMenu.document = this.attachMenu.container.querySelector('.menu-document') as HTMLDivElement;
    this.attachMenu.poll = this.attachMenu.container.querySelector('.menu-poll') as HTMLDivElement;

    this.attachMediaPopUp.container = this.pageEl.querySelector('.popup-send-photo') as HTMLDivElement;
    this.attachMediaPopUp.titleEl = this.attachMediaPopUp.container.querySelector('.popup-title') as HTMLDivElement;
    this.attachMediaPopUp.sendBtn = this.attachMediaPopUp.container.querySelector('.btn-primary') as HTMLButtonElement;
    this.attachMediaPopUp.mediaContainer = this.attachMediaPopUp.container.querySelector('.popup-photo') as HTMLDivElement;
    this.attachMediaPopUp.captionInput = this.attachMediaPopUp.container.querySelector('input') as HTMLInputElement;

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
      this.btnSend.classList.remove('tgico-microphone2');
      this.btnSend.classList.add('tgico-send');
      console.error('Recorder constructor error:', err);
    }

    this.messageInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if(e.key == 'Enter' && !touchSupport) {
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

    if(touchSupport) {
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
  
      let value = this.messageInput.innerText;
  
      let entities = RichTextProcessor.parseEntities(value);
      //console.log('messageInput entities', entities);
  
      let entityUrl = entities.find(e => e._ == 'messageEntityUrl');
      if(entityUrl) { // need to get webpage
        let url = value.slice(entityUrl.offset, entityUrl.offset + entityUrl.length);
  
        //console.log('messageInput url:', url);
  
        if(this.lastUrl != url) {
          this.lastUrl = url;
          this.willSendWebPage = null;
          apiManager.invokeApi('messages.getWebPage', {
            url: url,
            hash: 0
          }).then((webpage: any) => {
            appWebPagesManager.saveWebPage(webpage);
            if(this.lastUrl != url) return;
            //console.log('got webpage: ', webpage);

            this.setTopInfo(webpage.site_name || webpage.title, webpage.description || webpage.url);

            this.replyToMsgID = 0;
            this.noWebPage = false;
            this.willSendWebPage = webpage;
          });
        }
      }
  
      if(!value.trim() && !this.serializeNodes(Array.from(this.messageInput.childNodes)).trim()) {
        this.messageInput.innerHTML = '';
        if(this.recorder) {
          this.btnSend.classList.remove('tgico-send');
          this.btnSend.classList.add('tgico-microphone2');
        }
  
        appMessagesManager.setTyping('sendMessageCancelAction');
      } else if(!this.btnSend.classList.contains('tgico-send') || !this.recorder) {
        if(this.recorder) {
          this.btnSend.classList.add('tgico-send');
          this.btnSend.classList.remove('tgico-microphone2');
        }
  
        let time = Date.now();
        if(time - this.lastTimeType >= 6000) {
          this.lastTimeType = time;
          appMessagesManager.setTyping('sendMessageTypingAction');
        }
      }
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
  
      // console.log('messageInput paste', text);
      text = RichTextProcessor.wrapEmojiText(text);
  
      // console.log('messageInput paste after', text);
  
      // @ts-ignore
      //let html = (e.originalEvent || e).clipboardData.getData('text/html');
  
      // @ts-ignore
      //console.log('paste text', text, );
      window.document.execCommand('insertHTML', false, text);
    });

    let attachFile = (file: File) => {
      return new Promise<HTMLDivElement>((resolve, reject) => {
        let params: SendFileParams = {};
        params.file = file;
        //console.log('selected file:', file, typeof(file), willAttach);
        let itemDiv = document.createElement('div');
        switch(willAttach.type) {
          case 'media': {
            let isVideo = file.type.indexOf('video/') === 0;

            itemDiv.classList.add('popup-item-media');
  
            if(isVideo) {
              let video = document.createElement('video');
              let source = document.createElement('source');
              source.src = params.objectURL = URL.createObjectURL(file);
              video.autoplay = false;
              video.controls = false;
              video.muted = true;
              video.setAttribute('playsinline', '');
  
              video.onloadeddata = () => {
                params.width = video.videoWidth;
                params.height = video.videoHeight;
                params.duration = Math.floor(video.duration);

                itemDiv.append(video);
                resolve(itemDiv);
              };
  
              video.append(source);
            } else {
              let img = new Image();
              img.src = params.objectURL = URL.createObjectURL(file);
              img.onload = () => {
                params.width = img.naturalWidth;
                params.height = img.naturalHeight;

                itemDiv.append(img);
                resolve(itemDiv);
              };
            }
            
            break;
          }
  
          case 'document': {
            let docDiv = wrapDocument({
              file: file,
              file_name: file.name || '',
              size: file.size,
              type: file.type.indexOf('image/') !== -1 ? 'photo' : 'doc'
            } as any, false, true);

            params.objectURL = URL.createObjectURL(file);

            itemDiv.append(docDiv);
            resolve(itemDiv);
            break;
          }
        }
  
        willAttach.sendFileDetails.push(params);
      });
    };

    let attachFiles = (files: File[]) => {
      this.fileInput.value = '';

      let container = this.attachMediaPopUp.container.firstElementChild as HTMLElement;
      container.classList.remove('is-media', 'is-document', 'is-album');

      this.attachMediaPopUp.captionInput.value = '';
      this.attachMediaPopUp.mediaContainer.innerHTML = '';
      this.attachMediaPopUp.mediaContainer.style.width = this.attachMediaPopUp.mediaContainer.style.height = '';
      //willAttach.sendFileDetails.length = 0;
      willAttach.sendFileDetails = []; // need new array

      files = files.filter(file => {
        if(willAttach.type == 'media') {
          return ['image/', 'video/'].find(s => file.type.indexOf(s) === 0);
        } else {
          return true;
        }
      });

      if(files.length) {
        if(willAttach.type == 'document') {
          this.attachMediaPopUp.titleEl.innerText = 'Send ' + (files.length > 1 ? files.length + ' Files' : 'File');
          container.classList.add('is-document');
        } else {
          container.classList.add('is-media');

          let foundPhotos = 0;
          let foundVideos = 0;
          files.forEach(file => {
            if(file.type.indexOf('image/') === 0) ++foundPhotos;
            else if(file.type.indexOf('video/') === 0) ++foundVideos;
          });
          
          if(foundPhotos && foundVideos) {
            this.attachMediaPopUp.titleEl.innerText = 'Send Album';
          } else if(foundPhotos) {
            this.attachMediaPopUp.titleEl.innerText = 'Send ' + (foundPhotos > 1 ? foundPhotos + ' Photos' : 'Photo');
          } else if(foundVideos) {
            this.attachMediaPopUp.titleEl.innerText = 'Send ' + (foundVideos > 1 ? foundVideos + ' Videos' : 'Video');
          }
        }
      }

      Promise.all(files.map(attachFile)).then(results => {
        if(willAttach.type == 'media') {
          if(willAttach.sendFileDetails.length > 1) {
            container.classList.add('is-album');

            let layouter = new Layouter(willAttach.sendFileDetails.map(o => ({w: o.width, h: o.height})), 380, 100, 4);
            let layout = layouter.layout();

            for(let {geometry, sides} of layout) {
              let div = results.shift();

              div.style.width = geometry.width + 'px';
              div.style.height = geometry.height + 'px';
              div.style.top = geometry.y + 'px';
              div.style.left = geometry.x + 'px';

              if(sides & RectPart.Right) {
                this.attachMediaPopUp.mediaContainer.style.width = geometry.width + geometry.x + 'px';
              }

              if(sides & RectPart.Bottom) {
                this.attachMediaPopUp.mediaContainer.style.height = geometry.height + geometry.y + 'px';
              }

              this.attachMediaPopUp.mediaContainer.append(div);
            }

            //console.log('chatInput album layout:', layout);
          } else {
            let params = willAttach.sendFileDetails[0];
            let div = results[0];
            let {w, h} = calcImageInBox(params.width, params.height, 380, 320);
            div.style.width = w + 'px';
            div.style.height = h + 'px';
            this.attachMediaPopUp.mediaContainer.append(div);
          }
        } else {
          this.attachMediaPopUp.mediaContainer.append(...results);
        }

        this.attachMediaPopUp.container.classList.add('active');
      });
    };

    type SendFileParams = Partial<{
      file: File,
      objectURL: string,
      width: number,
      height: number,
      duration: number
    }>;

    let willAttach: Partial<{
      type: 'media' | 'document',
      isMedia: boolean,
      sendFileDetails: SendFileParams[]
    }> = {
      sendFileDetails: []
    };

    this.fileInput.addEventListener('change', (e) => {
      let files = (e.target as HTMLInputElement & EventTarget).files;
      if(!files.length) {
        return;
      }
      
      attachFiles(Array.from(files));
    }, false);

    this.attachMenu.media.addEventListener('click', () => {
      this.fileInput.setAttribute('accept', 'image/*, video/*');
      willAttach.type = 'media';
      this.fileInput.click();
    });

    this.attachMenu.document.addEventListener('click', () => {
      this.fileInput.removeAttribute('accept');
      willAttach.type = 'document';
      this.fileInput.click();
    });

    this.attachMenu.poll.addEventListener('click', () => {
      new PopupCreatePoll().show();
    });

    document.addEventListener('paste', (event) => {
      if(!appImManager.peerID || this.attachMediaPopUp.container.classList.contains('active')) {
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

          willAttach.type = file.type.indexOf('image/') === 0 ? 'media' : "document";
          attachFiles([file]);
        }
      }
    }, true);

    this.attachMediaPopUp.sendBtn.addEventListener('click', () => {
      this.attachMediaPopUp.container.classList.remove('active');
      let caption = this.attachMediaPopUp.captionInput.value;
      willAttach.isMedia = willAttach.type == 'media';

      //console.log('will send files with options:', willAttach);

      let peerID = appImManager.peerID;

      if(willAttach.sendFileDetails.length > 1 && willAttach.isMedia) {
        appMessagesManager.sendAlbum(peerID, willAttach.sendFileDetails.map(d => d.file), Object.assign({
          caption,
          replyToMsgID: this.replyToMsgID
        }, willAttach));
      } else {
        if(caption) {
          if(willAttach.sendFileDetails.length > 1) {
            appMessagesManager.sendText(peerID, caption, {replyToMsgID: this.replyToMsgID});
            caption = '';
            this.replyToMsgID = 0;
          }
        }
  
        let promises = willAttach.sendFileDetails.map(params => {
          let promise = appMessagesManager.sendFile(peerID, params.file, Object.assign({
            //isMedia: willAttach.isMedia, 
            isMedia: params.file.type.includes('audio/') || willAttach.isMedia, 
            caption,
            replyToMsgID: this.replyToMsgID
          }, params));

          caption = '';
          this.replyToMsgID = 0;
          return promise;
        });
      }

      //Promise.all(promises);

      //appMessagesManager.sendFile(appImManager.peerID, willAttach.file, willAttach);
      
      this.onMessageSent();
    });

    this.btnSend.addEventListener('click', () => {
      if(this.btnSend.classList.contains('tgico-send') || !this.recorder) {
        if(this.recording) {
          this.recorder.stop();
        } else {
          this.sendMessage();
        }
      } else {
        this.recorder.start().then(() => {
          this.recordCanceled = false;
          this.btnSend.classList.add('tgico-send');
          this.chatInput.classList.add('is-recording');
          this.recording = true;
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
          console.error('Recorder start error:', e);
        });
      }
    });

    if(this.recorder) {
      this.btnCancelRecord.addEventListener('click', () => {
        this.recordCanceled = true;
        this.recorder.stop();
        opusDecodeController.setKeepAlive(false);
      });

      this.recorder.onstop = () => {
        this.recording = false;
        this.chatInput.classList.remove('is-recording');
        this.btnSend.classList.remove('tgico-send');
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
  
        let perf = performance.now();
        opusDecodeController.decode(typedArray, true).then(result => {
          console.log('WAVEFORM!:', /* waveform,  */performance.now() - perf);
  
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
      this.replyElements.container.classList.remove('active');
      this.replyToMsgID = 0;

      if(this.editMsgID) {
        if(this.willSendWebPage) {
          let message = appMessagesManager.getMessage(this.editMsgID);
          this.setTopInfo('Editing', message.message);
        } else {
          this.editMsgID = 0;
          this.messageInput.innerHTML = '';

          if(this.recorder) {
            this.btnSend.classList.remove('tgico-send');
            this.btnSend.classList.add('tgico-microphone2');
          }
        }
      }

      this.noWebPage = true;
      this.willSendWebPage = null;
    });
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
      this.editMsgID = 0;
      this.noWebPage = false;
      this.willSendWebPage = null;
      this.messageInput.innerText = '';

      if(this.recorder) {
        this.btnSend.classList.remove('tgico-send');
        this.btnSend.classList.add('tgico-microphone2');
      }
    }

    if(clearReply || clearInput) {
      this.replyToMsgID = 0;
      this.replyElements.container.classList.remove('active');
    }
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

    this.onMessageSent();
  }

  public sendMessageWithDocument(document: any) {
    document = appDocsManager.getDoc(document);
    if(document._ != 'documentEmpty') {
      appMessagesManager.sendFile(appImManager.peerID, document, {isMedia: true, replyToMsgID: this.replyToMsgID});
      this.onMessageSent(false, true);

      if(document.type == 'sticker') {
        emoticonsDropdown.stickersTab.pushRecentSticker(document);
      }

      return true;
    }
    
    return false;
  }

  public setTopInfo(title: string, subtitle: string, input?: string, message?: any) {
    //appImManager.scrollPosition.prepareFor('down');

    if(this.replyElements.container.lastElementChild.tagName == 'DIV') {
      this.replyElements.container.lastElementChild.remove();
      this.replyElements.container.append(wrapReply(title, subtitle, message));
    }
    //this.replyElements.titleEl.innerHTML = title ? RichTextProcessor.wrapEmojiText(title) : '';
    //this.replyElements.subtitleEl.innerHTML = subtitle ? RichTextProcessor.wrapEmojiText(subtitle) : '';
    this.replyElements.container.classList.add('active');

    if(input !== undefined) {
      this.messageInput.innerHTML = input ? RichTextProcessor.wrapRichText(input) : '';

      this.btnSend.classList.remove('tgico-microphone2');
      this.btnSend.classList.add('tgico-send');
    }

    //appImManager.scrollPosition.restore();
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
