import type Chat from "../chat/chat";
import { isTouchSupported } from "../../helpers/touchSupport";
import { calcImageInBox, placeCaretAtEnd } from "../../helpers/dom";
import InputField from "../inputField";
import PopupElement from ".";
import Scrollable from "../scrollable";
import { toast } from "../toast";
import { prepareAlbum, wrapDocument } from "../wrappers";
import CheckboxField from "../checkbox";
import SendContextMenu from "../chat/sendContextMenu";

type SendFileParams = Partial<{
  file: File,
  objectURL: string,
  width: number,
  height: number,
  duration: number
}>;

const MAX_LENGTH_CAPTION = 1024;

// TODO: .gif upload as video

export default class PopupNewMedia extends PopupElement {
  private input: HTMLElement;
  private mediaContainer: HTMLElement;
  private groupCheckboxField: { label: HTMLLabelElement; input: HTMLInputElement; span: HTMLSpanElement; };
  private wasInputValue = '';

  private willAttach: Partial<{
    type: 'media' | 'document',
    isMedia: true,
    group: boolean,
    sendFileDetails: SendFileParams[]
  }> = {
    sendFileDetails: [],
    group: false
  };
  inputField: InputField;

  constructor(private chat: Chat, files: File[], willAttachType: PopupNewMedia['willAttach']['type']) {
    super('popup-send-photo popup-new-media', null, {closable: true, withConfirm: 'SEND'});

    this.willAttach.type = willAttachType;

    this.btnConfirm.addEventListener('click', () => this.send());

    if(this.chat.type !== 'scheduled') {
      const sendMenu = new SendContextMenu({
        onSilentClick: () => {
          this.chat.input.sendSilent = true;
          this.send();
        },
        onScheduleClick: () => {
          this.chat.input.scheduleSending(() => {
            this.send();
          });
        },
        openSide: 'bottom-left',
        onContextElement: this.btnConfirm,
      });

      sendMenu.setPeerId(this.chat.peerId);

      this.header.append(sendMenu.sendMenu);
    }

    this.mediaContainer = document.createElement('div');
    this.mediaContainer.classList.add('popup-photo');
    const scrollable = new Scrollable(null);
    scrollable.container.append(this.mediaContainer);
    
    this.inputField = new InputField({
      placeholder: 'Add a caption...',
      label: 'Caption',
      name: 'photo-caption',
      maxLength: MAX_LENGTH_CAPTION,
      showLengthOn: 80
    });
    this.input = this.inputField.input;

    this.inputField.value = this.wasInputValue = this.chat.input.messageInputField.value;
    this.chat.input.messageInputField.value = '';

    this.container.append(scrollable.container);

    if(files.length > 1) {
      this.groupCheckboxField = CheckboxField('Group items', 'group-items');
      this.container.append(this.groupCheckboxField.label, this.inputField.container);
  
      this.groupCheckboxField.input.checked = true;
      this.willAttach.group = true;

      this.groupCheckboxField.input.addEventListener('change', () => {
        const checked = this.groupCheckboxField.input.checked;
  
        this.willAttach.group = checked;
        this.willAttach.sendFileDetails.length = 0;

        //this.mediaContainer.innerHTML = '';
        //this.container.classList.remove('is-media', 'is-document', 'is-album');
        this.attachFiles(files);
      });
    }
    
    this.container.append(this.inputField.container);

    this.attachFiles(files);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if(target !== this.input) {
      this.input.focus();
      placeCaretAtEnd(this.input);
    }
    
    if(e.key == 'Enter' && !isTouchSupported) {
      this.btnConfirm.click();
    }
  };

  public send(force = false) {
    if(this.chat.type === 'scheduled' && !force) {
      this.chat.input.scheduleSending(() => {
        this.send(true);
      });
      
      return;
    }

    let caption = this.inputField.value;
    if(caption.length > MAX_LENGTH_CAPTION) {
      toast('Caption is too long.');
      return;
    }

    this.destroy();
    const willAttach = this.willAttach;
    willAttach.isMedia = willAttach.type == 'media' ? true : undefined;

    //console.log('will send files with options:', willAttach);

    const peerId = this.chat.peerId;
    const input = this.chat.input;
    const silent = input.sendSilent;
    const scheduleDate = input.scheduleDate;

    if(willAttach.sendFileDetails.length > 1 && willAttach.group) {
      for(let i = 0; i < willAttach.sendFileDetails.length;) {
        let firstType = willAttach.sendFileDetails[i].file.type.split('/')[0];
        for(var k = 0; k < 10 && i < willAttach.sendFileDetails.length; ++i, ++k) {
          const type = willAttach.sendFileDetails[i].file.type.split('/')[0];
          if(firstType != type) {
            break;
          }
        }

        const w = {...willAttach};
        w.sendFileDetails = willAttach.sendFileDetails.slice(i - k, i);

        this.chat.appMessagesManager.sendAlbum(peerId, w.sendFileDetails.map(d => d.file), Object.assign({
          caption,
          replyToMsgId: input.replyToMsgId,
          isMedia: willAttach.isMedia,
          silent,
          scheduleDate
        }, w));

        caption = undefined;
        input.replyToMsgId = undefined;
      }
    } else {
      if(caption) {
        if(willAttach.sendFileDetails.length > 1) {
          this.chat.appMessagesManager.sendText(peerId, caption, {replyToMsgId: input.replyToMsgId, silent, scheduleDate});
          caption = '';
          input.replyToMsgId = undefined;
        }
      }
  
      const promises = willAttach.sendFileDetails.map(params => {
        const promise = this.chat.appMessagesManager.sendFile(peerId, params.file, Object.assign({
          //isMedia: willAttach.isMedia, 
          isMedia: willAttach.isMedia, 
          caption,
          replyToMsgId: input.replyToMsgId,
          silent,
          scheduleDate
        }, params));

        caption = '';
        input.replyToMsgId = undefined;
        return promise;
      });
    }

    //Promise.all(promises);

    //appMessagesManager.sendFile(appImManager.peerId, willAttach.file, willAttach);
    
    input.onMessageSent();
  }

  public attachFile = (file: File) => {
    const willAttach = this.willAttach;
    return new Promise<HTMLDivElement>((resolve) => {
      const params: SendFileParams = {};
      params.file = file;
      //console.log('selected file:', file, typeof(file), willAttach);
      const itemDiv = document.createElement('div');
      switch(willAttach.type) {
        case 'media': {
          const isVideo = file.type.indexOf('video/') === 0;

          itemDiv.classList.add('popup-item-media');

          if(isVideo) {
            const video = document.createElement('video');
            const source = document.createElement('source');
            source.src = params.objectURL = URL.createObjectURL(file);
            video.autoplay = false;
            video.controls = false;
            video.muted = true;
            video.setAttribute('playsinline', 'true');

            video.onloadeddata = () => {
              params.width = video.videoWidth;
              params.height = video.videoHeight;
              params.duration = Math.floor(video.duration);

              itemDiv.append(video);
              resolve(itemDiv);
            };

            video.append(source);
          } else {
            const img = new Image();
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
          const isPhoto = file.type.indexOf('image/') !== -1;
          const isAudio = file.type.indexOf('audio/') !== -1;
          if(isPhoto || isAudio) {
            params.objectURL = URL.createObjectURL(file);
          }

          const docDiv = wrapDocument({
            message: {
              _: 'message',
              mid: 0,
              peerId: 0,
              media: {
                _: 'messageMediaDocument',
                document: {
                  _: 'document',
                  file: file,
                  file_name: file.name || '',
                  size: file.size,
                  type: isPhoto ? 'photo' : 'doc',
                  url: params.objectURL
                }
              }
            } as any
          });

          const finish = () => {
            itemDiv.append(docDiv);
            resolve(itemDiv);
          };

          if(isPhoto) {
            const img = new Image();
            img.src = params.objectURL;
            img.onload = () => {
              params.width = img.naturalWidth;
              params.height = img.naturalHeight;

              finish();
            };

            img.onerror = finish;
          } else {
            finish();
          }

          break;
        }
      }

      willAttach.sendFileDetails.push(params);
    });
  };

  public attachFiles(files: File[]) {
    const container = this.container;
    const willAttach = this.willAttach;

    /* if(files.length > 10 && willAttach.type == 'media') {
      willAttach.type = 'document';
    } */

    files = files.filter(file => {
      if(willAttach.type == 'media') {
        return ['image/', 'video/'].find(s => file.type.indexOf(s) === 0);
      } else {
        return true;
      }
    });

    Promise.all(files.map(this.attachFile)).then(results => {
      this.container.classList.remove('is-media', 'is-document', 'is-album');
      this.mediaContainer.innerHTML = '';

      if(files.length) {
        if(willAttach.type == 'document') {
          this.title.innerText = 'Send ' + (files.length > 1 ? files.length + ' Files' : 'File');
          container.classList.add('is-document');
        } else {
          container.classList.add('is-media');
  
          let foundPhotos = 0;
          let foundVideos = 0;
          files.forEach(file => {
            if(file.type.indexOf('image/') === 0) ++foundPhotos;
            else if(file.type.indexOf('video/') === 0) ++foundVideos;
          });
          
          if(foundPhotos && foundVideos && willAttach.group) {
            this.title.innerText = 'Send Album';
          } else if(foundPhotos) {
            this.title.innerText = 'Send ' + (foundPhotos > 1 ? foundPhotos + ' Photos' : 'Photo');
          } else if(foundVideos) {
            this.title.innerText = 'Send ' + (foundVideos > 1 ? foundVideos + ' Videos' : 'Video');
          }
        }
      }

      if(willAttach.type == 'media') {
        if(willAttach.sendFileDetails.length > 1 && willAttach.group) {
          container.classList.add('is-album');

          for(let i = 0; i < results.length; i += 10) {
            const albumContainer = document.createElement('div');
            albumContainer.classList.add('popup-album');

            albumContainer.append(...results.slice(i, i + 10));
            prepareAlbum({
              container: albumContainer,
              items: willAttach.sendFileDetails.slice(i, i + 10).map(o => ({w: o.width, h: o.height})),
              maxWidth: 380,
              minWidth: 100,
              spacing: 4
            });

            this.mediaContainer.append(albumContainer);
          }

          //console.log('chatInput album layout:', layout);
        } else {
          for(let i = 0; i < results.length; ++i) {
            const params = willAttach.sendFileDetails[i];
            const div = results[i];
            const {w, h} = calcImageInBox(params.width, params.height, 380, 320);
            div.style.width = w + 'px';
            div.style.height = h + 'px';
            this.mediaContainer.append(div);
          }
        }
      } else {
        this.mediaContainer.append(...results);
      }

      // show now
      if(!this.element.classList.contains('active')) {
        document.body.addEventListener('keydown', this.onKeyDown);
        this.onClose = () => {
          if(this.wasInputValue) {
            this.chat.input.messageInputField.value = this.wasInputValue;
          }

          document.body.removeEventListener('keydown', this.onKeyDown);
        };
        this.show();
      }
    });
  }
}
