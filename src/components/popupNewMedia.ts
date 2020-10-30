import { isTouchSupported } from "../helpers/touchSupport";
import appImManager from "../lib/appManagers/appImManager";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import { calcImageInBox } from "../lib/utils";
import { Layouter, RectPart } from "./groupedLayout";
import InputField from "./inputField";
import { PopupElement } from "./popup";
import { ripple } from "./ripple";
import Scrollable from "./scrollable";
import { toast } from "./toast";
import { wrapDocument } from "./wrappers";

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
  private btnSend: HTMLElement;
  private input: HTMLInputElement;
  private mediaContainer: HTMLElement;

  private willAttach: Partial<{
    type: 'media' | 'document',
    isMedia: boolean,
    sendFileDetails: SendFileParams[]
  }> = {
    sendFileDetails: []
  };

  constructor(files: File[], willAttachType: PopupNewMedia['willAttach']['type']) {
    super('popup-send-photo popup-new-media', null, {closable: true});

    this.willAttach.type = willAttachType;

    this.btnSend = document.createElement('button');
    this.btnSend.className = 'btn-primary';
    this.btnSend.innerText = 'SEND';
    ripple(this.btnSend);
    this.btnSend.addEventListener('click', this.send);
  
    this.header.append(this.btnSend);

    this.mediaContainer = document.createElement('div');
    this.mediaContainer.classList.add('popup-photo');
    const scrollable = new Scrollable(null);
    scrollable.container.append(this.mediaContainer);
    
    const inputField = InputField('Add a caption...', 'Caption', 'photo-caption', MAX_LENGTH_CAPTION, 80);
    this.input = inputField.firstElementChild as HTMLInputElement;
    this.container.append(scrollable.container, inputField);

    this.attachFiles(files);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if(target.tagName != 'INPUT') {
      this.input.focus();
    }
    
    if(e.key == 'Enter' && !isTouchSupported) {
      this.btnSend.click();
    }
  };

  public send = () => {
    let caption = this.input.value.trim();
    if(caption.length > MAX_LENGTH_CAPTION) {
      toast('Caption is too long.');
      return;
    }

    this.destroy();
    const willAttach = this.willAttach;
    willAttach.isMedia = willAttach.type == 'media';

    //console.log('will send files with options:', willAttach);

    const peerID = appImManager.peerID;
    const chatInputC = appImManager.chatInputC;

    if(willAttach.sendFileDetails.length > 1 && willAttach.isMedia) {
      appMessagesManager.sendAlbum(peerID, willAttach.sendFileDetails.map(d => d.file), Object.assign({
        caption,
        replyToMsgID: chatInputC.replyToMsgID
      }, willAttach));
    } else {
      if(caption) {
        if(willAttach.sendFileDetails.length > 1) {
          appMessagesManager.sendText(peerID, caption, {replyToMsgID: chatInputC.replyToMsgID});
          caption = '';
          chatInputC.replyToMsgID = 0;
        }
      }
  
      const promises = willAttach.sendFileDetails.map(params => {
        const promise = appMessagesManager.sendFile(peerID, params.file, Object.assign({
          //isMedia: willAttach.isMedia, 
          isMedia: params.file.type.includes('audio/') || willAttach.isMedia, 
          caption,
          replyToMsgID: chatInputC.replyToMsgID
        }, params));

        caption = '';
        chatInputC.replyToMsgID = 0;
        return promise;
      });
    }

    //Promise.all(promises);

    //appMessagesManager.sendFile(appImManager.peerID, willAttach.file, willAttach);
    
    chatInputC.onMessageSent();
  };

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
          if(isPhoto) {
            params.objectURL = URL.createObjectURL(file);
          }

          const docDiv = wrapDocument({
            file: file,
            file_name: file.name || '',
            size: file.size,
            type: isPhoto ? 'photo' : 'doc',
            url: params.objectURL
          } as any, false, true);

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

    if(files.length > 10 && willAttach.type == 'media') {
      willAttach.type = 'document';
    }

    files = files.filter(file => {
      if(willAttach.type == 'media') {
        return ['image/', 'video/'].find(s => file.type.indexOf(s) === 0);
      } else {
        return true;
      }
    });

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
        
        if(foundPhotos && foundVideos) {
          this.title.innerText = 'Send Album';
        } else if(foundPhotos) {
          this.title.innerText = 'Send ' + (foundPhotos > 1 ? foundPhotos + ' Photos' : 'Photo');
        } else if(foundVideos) {
          this.title.innerText = 'Send ' + (foundVideos > 1 ? foundVideos + ' Videos' : 'Video');
        }
      }
    }

    Promise.all(files.map(this.attachFile)).then(results => {
      if(willAttach.type == 'media') {
        if(willAttach.sendFileDetails.length > 1) {
          container.classList.add('is-album');

          const layouter = new Layouter(willAttach.sendFileDetails.map(o => ({w: o.width, h: o.height})), 380, 100, 4);
          const layout = layouter.layout();

          for(const {geometry, sides} of layout) {
            const div = results.shift();

            div.style.width = geometry.width + 'px';
            div.style.height = geometry.height + 'px';
            div.style.top = geometry.y + 'px';
            div.style.left = geometry.x + 'px';

            if(sides & RectPart.Right) {
              this.mediaContainer.style.width = geometry.width + geometry.x + 'px';
            }

            if(sides & RectPart.Bottom) {
              this.mediaContainer.style.height = geometry.height + geometry.y + 'px';
            }

            this.mediaContainer.append(div);
          }

          //console.log('chatInput album layout:', layout);
        } else {
          const params = willAttach.sendFileDetails[0];
          const div = results[0];
          const {w, h} = calcImageInBox(params.width, params.height, 380, 320);
          div.style.width = w + 'px';
          div.style.height = h + 'px';
          this.mediaContainer.append(div);
        }
      } else {
        this.mediaContainer.append(...results);
      }

      // show now
      document.body.addEventListener('keydown', this.onKeyDown);
      this.onClose = () => {
        document.body.removeEventListener('keydown', this.onKeyDown);
      };
      this.show();
    });
  }
}
