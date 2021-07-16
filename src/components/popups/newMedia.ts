/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Chat from "../chat/chat";
import InputField from "../inputField";
import PopupElement from ".";
import Scrollable from "../scrollable";
import { toast } from "../toast";
import { prepareAlbum, wrapDocument } from "../wrappers";
import CheckboxField from "../checkboxField";
import SendContextMenu from "../chat/sendContextMenu";
import { createPosterFromVideo, onVideoLoad } from "../../helpers/files";
import { MyDocument } from "../../lib/appManagers/appDocsManager";
import I18n, { i18n, LangPackKey } from "../../lib/langPack";
import appDownloadManager from "../../lib/appManagers/appDownloadManager";
import calcImageInBox from "../../helpers/calcImageInBox";
import isSendShortcutPressed from "../../helpers/dom/isSendShortcutPressed";
import placeCaretAtEnd from "../../helpers/dom/placeCaretAtEnd";
import rootScope from "../../lib/rootScope";

type SendFileParams = Partial<{
  file: File,
  objectURL: string,
  thumbBlob: Blob,
  thumbURL: string,
  width: number,
  height: number,
  duration: number
}>;

// TODO: .gif upload as video

export default class PopupNewMedia extends PopupElement {
  private input: HTMLElement;
  private mediaContainer: HTMLElement;
  private groupCheckboxField: CheckboxField;
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
  private inputField: InputField;

  constructor(private chat: Chat, files: File[], willAttachType: PopupNewMedia['willAttach']['type']) {
    super('popup-send-photo popup-new-media', null, {closable: true, withConfirm: 'Modal.Send'});

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
      placeholder: 'PreviewSender.CaptionPlaceholder',
      label: 'Caption',
      name: 'photo-caption',
      maxLength: rootScope.config.caption_length_max,
      showLengthOn: 80
    });
    this.input = this.inputField.input;

    this.inputField.value = this.wasInputValue = this.chat.input.messageInputField.value;
    this.chat.input.messageInputField.value = '';

    this.container.append(scrollable.container);

    if(files.length > 1) {
      this.groupCheckboxField = new CheckboxField({
        text: 'PreviewSender.GroupItems', 
        name: 'group-items'
      });
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
      if(target.tagName === 'INPUT' || target.hasAttribute('contenteditable')) {
        return;
      }

      this.input.focus();
      placeCaretAtEnd(this.input);
    }
    
    if(isSendShortcutPressed(e)) {
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
    if(caption.length > rootScope.config.caption_length_max) {
      toast(I18n.format('Error.PreviewSender.CaptionTooLong', true));
      return;
    }

    this.hide();
    const willAttach = this.willAttach;
    willAttach.isMedia = willAttach.type === 'media' ? true : undefined;

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
          if(firstType !== type) {
            break;
          }
        }

        const w = {...willAttach};
        w.sendFileDetails = willAttach.sendFileDetails.slice(i - k, i);

        this.chat.appMessagesManager.sendAlbum(peerId, w.sendFileDetails.map(d => d.file), Object.assign({
          caption,
          replyToMsgId: input.replyToMsgId,
          threadId: this.chat.threadId,
          isMedia: willAttach.isMedia,
          silent,
          scheduleDate,
          clearDraft: true as true
        }, w));

        caption = undefined;
        input.replyToMsgId = this.chat.threadId;
      }
    } else {
      if(caption) {
        if(willAttach.sendFileDetails.length > 1) {
          this.chat.appMessagesManager.sendText(peerId, caption, {
            replyToMsgId: input.replyToMsgId, 
            threadId: this.chat.threadId,
            silent, 
            scheduleDate,
            clearDraft: true
          });
          caption = '';
          //input.replyToMsgId = undefined;
        }
      }
  
      const promises = willAttach.sendFileDetails.map(params => {
        const promise = this.chat.appMessagesManager.sendFile(peerId, params.file, Object.assign({
          //isMedia: willAttach.isMedia, 
          isMedia: willAttach.isMedia, 
          caption,
          replyToMsgId: input.replyToMsgId,
          threadId: this.chat.threadId,
          silent,
          scheduleDate,
          clearDraft: true as true
        }, params));

        caption = '';
        return promise;
      });

      input.replyToMsgId = this.chat.threadId;
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
            video.autoplay = true;
            video.controls = false;
            video.muted = true;
            video.setAttribute('playsinline', 'true');

            video.addEventListener('timeupdate', () => {
              video.pause();
            }, {once: true});

            onVideoLoad(video).then(() => {
              params.width = video.videoWidth;
              params.height = video.videoHeight;
              params.duration = Math.floor(video.duration);

              itemDiv.append(video);
              createPosterFromVideo(video).then(blob => {
                params.thumbBlob = blob;
                params.thumbURL = URL.createObjectURL(blob);
                resolve(itemDiv);
              });
            });

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

          const doc = {
            _: 'document',
            file: file,
            file_name: file.name || '',
            size: file.size,
            type: isPhoto ? 'photo' : 'doc'
          } as MyDocument;

          const cacheContext = appDownloadManager.getCacheContext(doc);
          cacheContext.url = params.objectURL;
          cacheContext.downloaded = file.size;

          const docDiv = wrapDocument({
            message: {
              _: 'message',
              pFlags: {
                is_outgoing: true
              },
              mid: 0,
              peerId: 0,
              media: {
                _: 'messageMediaDocument',
                document: doc
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

    /* if(files.length > 10 && willAttach.type === 'media') {
      willAttach.type = 'document';
    } */

    files = files.filter(file => {
      if(willAttach.type === 'media') {
        return ['image/', 'video/'].find(s => file.type.indexOf(s) === 0);
      } else {
        return true;
      }
    });

    Promise.all(files.map(this.attachFile)).then(results => {
      this.container.classList.remove('is-media', 'is-document', 'is-album');
      this.mediaContainer.innerHTML = '';

      if(files.length) {
        let key: LangPackKey;
        const args: any[] = [];
        if(willAttach.type === 'document') {
          key = 'PreviewSender.SendFile';
          args.push(files.length);
          container.classList.add('is-document');
        } else {
          container.classList.add('is-media');
  
          let foundPhotos = 0;
          let foundVideos = 0;
          files.forEach(file => {
            if(file.type.indexOf('image/') === 0) ++foundPhotos;
            else if(file.type.indexOf('video/') === 0) ++foundVideos;
          });
          
          const sum = foundPhotos + foundVideos;
          if(sum > 1 && willAttach.group) {
            key = 'PreviewSender.SendAlbum';
            const albumsLength = Math.ceil(sum / 10);
            args.push(albumsLength);
          } else if(foundPhotos) {
            key = 'PreviewSender.SendPhoto';
            args.push(foundPhotos);
          } else if(foundVideos) {
            key = 'PreviewSender.SendVideo';
            args.push(foundVideos);
          }
        }

        this.title.textContent = '';
        this.title.append(i18n(key, args));
      }

      if(willAttach.type === 'media') {
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
            const size = calcImageInBox(params.width, params.height, 380, 320);
            div.style.width = size.width + 'px';
            div.style.height = size.height + 'px';
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
