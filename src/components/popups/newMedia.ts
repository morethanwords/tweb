/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Chat from '../chat/chat';
import type {SendFileDetails} from '../../lib/appManagers/appMessagesManager';
import InputField from '../inputField';
import PopupElement from '.';
import Scrollable from '../scrollable';
import {toast} from '../toast';
import CheckboxField from '../checkboxField';
import SendContextMenu from '../chat/sendContextMenu';
import {createPosterFromMedia, createPosterFromVideo} from '../../helpers/createPoster';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import I18n, {FormatterArguments, i18n, LangPackKey} from '../../lib/langPack';
import calcImageInBox from '../../helpers/calcImageInBox';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import MEDIA_MIME_TYPES_SUPPORTED from '../../environment/mediaMimeTypesSupport';
import getGifDuration from '../../helpers/getGifDuration';
import replaceContent from '../../helpers/dom/replaceContent';
import createVideo from '../../helpers/dom/createVideo';
import prepareAlbum from '../prepareAlbum';
import {makeMediaSize, MediaSize} from '../../helpers/mediaSize';
import {ThumbCache} from '../../lib/storages/thumbs';
import onMediaLoad from '../../helpers/onMediaLoad';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {THUMB_TYPE_FULL} from '../../lib/mtproto/mtproto_config';
import wrapDocument from '../wrappers/document';
import createContextMenu from '../../helpers/dom/createContextMenu';
import findUpClassName from '../../helpers/dom/findUpClassName';
import wrapMediaSpoiler, {toggleMediaSpoiler} from '../wrappers/mediaSpoiler';
import {MiddlewareHelper} from '../../helpers/middleware';
import {AnimationItemGroup} from '../animationIntersector';
import scaleMediaElement from '../../helpers/canvas/scaleMediaElement';
import {doubleRaf} from '../../helpers/schedulers';
import defineNotNumerableProperties from '../../helpers/object/defineNotNumerableProperties';
import {Photo, PhotoSize} from '../../layer';
import {getPreviewBytesFromURL} from '../../helpers/bytes/getPreviewURLFromBytes';
import {renderImageFromUrlPromise} from '../../helpers/dom/renderImageFromUrl';

type SendFileParams = SendFileDetails & {
  file?: File,
  scaledBlob?: Blob,
  noSound?: boolean,
  itemDiv: HTMLElement,
  mediaSpoiler?: HTMLElement,
  middlewareHelper: MiddlewareHelper
  // strippedBytes?: PhotoSize.photoStrippedSize['bytes']
};

let currentPopup: PopupNewMedia;

export function getCurrentNewMediaPopup() {
  return currentPopup;
}

export default class PopupNewMedia extends PopupElement {
  private input: HTMLElement;
  private mediaContainer: HTMLElement;
  private groupCheckboxField: CheckboxField;
  private mediaCheckboxField: CheckboxField;
  private wasInputValue: string;

  private willAttach: Partial<{
    type: 'media' | 'document',
    isMedia: true,
    group: boolean,
    sendFileDetails: SendFileParams[]
  }>;
  private inputField: InputField;
  private captionLengthMax: number;

  private animationGroup: AnimationItemGroup;

  constructor(
    private chat: Chat,
    private files: File[],
    willAttachType: PopupNewMedia['willAttach']['type']
  ) {
    super('popup-send-photo popup-new-media', {
      closable: true,
      withConfirm: 'Modal.Send',
      confirmShortcutIsSendShortcut: true,
      body: true,
      title: true
    });

    this.animationGroup = '';
    this.construct(willAttachType);
  }

  private async construct(willAttachType: PopupNewMedia['willAttach']['type']) {
    this.willAttach = {
      type: willAttachType,
      sendFileDetails: [],
      group: false
    };

    const captionMaxLength = await this.managers.apiManager.getLimit('caption');
    this.captionLengthMax = captionMaxLength;

    attachClickEvent(this.btnConfirm, () => this.send(), {listenerSetter: this.listenerSetter});

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
        listenerSetter: this.listenerSetter
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
      maxLength: this.captionLengthMax,
      withLinebreaks: true
    });
    this.input = this.inputField.input;

    this.inputField.value = this.wasInputValue = this.chat.input.messageInputField.input.innerHTML;
    this.chat.input.messageInputField.value = '';

    this.body.append(scrollable.container);
    this.container.append(this.inputField.container);

    this.attachFiles();

    this.addEventListener('close', () => {
      this.files.length = 0;
      this.willAttach.sendFileDetails.length = 0;

      if(currentPopup === this) {
        currentPopup = undefined;
      }
    });

    let target: HTMLElement, isMedia: boolean, item: SendFileParams;
    createContextMenu({
      buttons: [{
        icon: 'spoiler',
        text: 'EnablePhotoSpoiler',
        onClick: () => {
          this.applyMediaSpoiler(item);
        },
        verify: () => isMedia && !item.mediaSpoiler
      }, {
        icon: 'spoiler',
        text: 'DisablePhotoSpoiler',
        onClick: () => {
          toggleMediaSpoiler({
            mediaSpoiler: item.mediaSpoiler,
            reveal: true,
            destroyAfter: true
          });

          item.mediaSpoiler = undefined;
        },
        verify: () => !!(isMedia && item.mediaSpoiler)
      }],
      listenTo: this.mediaContainer,
      listenerSetter: this.listenerSetter,
      findElement: (e) => {
        target = findUpClassName(e.target, 'popup-item');
        isMedia = target.classList.contains('popup-item-media');
        item = this.willAttach.sendFileDetails.find((i) => i.itemDiv === target);
        return target;
      }
    });

    currentPopup = this;
  }

  private async applyMediaSpoiler(item: SendFileParams, noAnimation?: boolean) {
    const middleware = item.middlewareHelper.get();
    const {width: widthStr, height: heightStr} = item.itemDiv.style;

    let width: number, height: number;
    if(item.itemDiv.classList.contains('album-item')) {
      const {width: containerWidthStr, height: containerHeightStr} = item.itemDiv.parentElement.style;
      const containerWidth = parseInt(containerWidthStr);
      const containerHeight = parseInt(containerHeightStr);

      width = +widthStr.slice(0, -1) / 100 * containerWidth;
      height = +heightStr.slice(0, -1) / 100 * containerHeight;
    } else {
      width = parseInt(widthStr);
      height = parseInt(heightStr);
    }

    const {url} = await scaleMediaElement({
      media: item.itemDiv.firstElementChild as HTMLImageElement,
      boxSize: makeMediaSize(40, 40),
      mediaSize: makeMediaSize(width, height),
      toDataURL: true,
      quality: 0.2
    });

    const strippedBytes = getPreviewBytesFromURL(url);
    const photoSize: PhotoSize.photoStrippedSize = {
      _: 'photoStrippedSize',
      bytes: strippedBytes,
      type: 'i'
    };

    item.strippedBytes = strippedBytes;

    const photo: Photo.photo = {
      _: 'photo',
      sizes: [
        photoSize
      ],
      id: 0,
      access_hash: 0,
      date: 0,
      dc_id: 0,
      file_reference: []
    };

    const mediaSpoiler = await wrapMediaSpoiler({
      middleware,
      width,
      height,
      animationGroup: this.animationGroup,
      media: photo
    });

    if(!middleware()) {
      return;
    }

    if(!noAnimation) {
      mediaSpoiler.classList.add('is-revealing');
    }

    item.mediaSpoiler = mediaSpoiler;
    item.itemDiv.append(mediaSpoiler);

    await doubleRaf();
    if(!middleware()) {
      return;
    }

    toggleMediaSpoiler({
      mediaSpoiler,
      reveal: false
    });
  }

  public appendDrops(element: HTMLElement) {
    this.body.append(element);
  }

  get type() {
    return this.willAttach.type;
  }

  set type(type: PopupNewMedia['willAttach']['type']) {
    this.willAttach.type = type;
  }

  private appendGroupCheckboxField() {
    const good = this.files.length > 1;
    if(good && !this.groupCheckboxField) {
      this.groupCheckboxField = new CheckboxField({
        text: 'PreviewSender.GroupItems',
        name: 'group-items'
      });
      this.container.append(...[
        this.groupCheckboxField.label,
        this.mediaCheckboxField?.label,
        this.inputField.container
      ].filter(Boolean));

      this.willAttach.group = true;
      this.groupCheckboxField.setValueSilently(this.willAttach.group);

      this.listenerSetter.add(this.groupCheckboxField.input)('change', () => {
        const checked = this.groupCheckboxField.checked;

        this.willAttach.group = checked;

        this.attachFiles();
      });
    } else if(this.groupCheckboxField) {
      this.groupCheckboxField.label.classList.toggle('hide', !good);
    }
  }

  private appendMediaCheckboxField() {
    const good = !!this.files.find((file) => MEDIA_MIME_TYPES_SUPPORTED.has(file.type));
    if(good && !this.mediaCheckboxField) {
      this.mediaCheckboxField = new CheckboxField({
        text: 'PreviewSender.CompressFile',
        name: 'compress-items'
      });
      this.container.append(...[
        this.groupCheckboxField?.label,
        this.mediaCheckboxField.label,
        this.inputField.container
      ].filter(Boolean));

      this.mediaCheckboxField.setValueSilently(this.willAttach.type === 'media');

      this.listenerSetter.add(this.mediaCheckboxField.input)('change', () => {
        const checked = this.mediaCheckboxField.checked;

        this.willAttach.type = checked ? 'media' : 'document';

        this.attachFiles();
      });
    } else if(this.mediaCheckboxField) {
      this.mediaCheckboxField.label.classList.toggle('hide', !good);
    }
  }

  public addFiles(files: File[]) {
    const toPush = files.filter((file) => {
      const found = this.files.find((_file) => {
        return _file.lastModified === file.lastModified && _file.name === file.name && _file.size === file.size;
      });

      return !found;
    });

    if(toPush.length) {
      this.files.push(...toPush);
      this.attachFiles();
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if(target !== this.input) {
      if(target.tagName === 'INPUT' || target.isContentEditable) {
        return;
      }

      this.input.focus();
      placeCaretAtEnd(this.input);
    }
  };

  private send(force = false) {
    if(this.chat.type === 'scheduled' && !force) {
      this.chat.input.scheduleSending(() => {
        this.send(true);
      });

      return;
    }

    let caption = this.inputField.value;
    if(caption.length > this.captionLengthMax) {
      toast(I18n.format('Error.PreviewSender.CaptionTooLong', true));
      return;
    }

    const willAttach = this.willAttach;
    willAttach.isMedia = willAttach.type === 'media' || undefined;
    const {sendFileDetails, isMedia} = willAttach;

    const {peerId, input} = this.chat;

    const {length} = sendFileDetails;
    const sendingParams = this.chat.getMessageSendingParams();
    this.iterate((sendFileParams) => {
      if(caption && sendFileParams.length !== length) {
        this.managers.appMessagesManager.sendText(peerId, caption, {
          ...sendingParams,
          clearDraft: true
        });

        caption = undefined;
      }

      const d: SendFileDetails[] = sendFileParams.map((params) => {
        return {
          ...params,
          file: params.scaledBlob || params.file,
          spoiler: !!params.mediaSpoiler
        };
      });

      const w = {
        ...willAttach,
        sendFileDetails: d
      };

      this.managers.appMessagesManager.sendAlbum(peerId, Object.assign({
        ...sendingParams,
        caption,
        isMedia,
        clearDraft: true
      }, w));

      caption = undefined;
    });

    input.replyToMsgId = this.chat.threadId;
    input.onMessageSent();

    this.hide();
  }

  private async scaleImageForTelegram(image: HTMLImageElement, params: SendFileParams) {
    const PHOTO_SIDE_LIMIT = 2560;
    const mimeType = params.file.type;
    let url = image.src, scaledBlob: Blob;
    if(mimeType !== 'image/gif' && Math.max(image.naturalWidth, image.naturalHeight) > PHOTO_SIDE_LIMIT) {
      const {blob} = await scaleMediaElement({
        media: image,
        boxSize: makeMediaSize(PHOTO_SIDE_LIMIT, PHOTO_SIDE_LIMIT),
        mediaSize: makeMediaSize(image.naturalWidth, image.naturalHeight),
        mimeType: mimeType as any
      });

      scaledBlob = blob;
      URL.revokeObjectURL(url);
      url = await apiManagerProxy.invoke('createObjectURL', blob);
      await renderImageFromUrlPromise(image, url);
    }

    params.objectURL = url;
    params.scaledBlob = scaledBlob;
  }

  private async attachMedia(params: SendFileParams) {
    const {itemDiv} = params;
    itemDiv.classList.add('popup-item-media');

    const file = params.file;
    const isVideo = file.type.startsWith('video/');

    let promise: Promise<void>;
    if(isVideo) {
      const video = createVideo();
      const source = document.createElement('source');
      source.src = params.objectURL = await apiManagerProxy.invoke('createObjectURL', file);
      video.autoplay = true;
      video.controls = false;
      video.muted = true;

      video.addEventListener('timeupdate', () => {
        video.pause();
      }, {once: true});

      promise = onMediaLoad(video).then(async() => {
        params.width = video.videoWidth;
        params.height = video.videoHeight;
        params.duration = Math.floor(video.duration);

        const audioDecodedByteCount = (video as any).webkitAudioDecodedByteCount;
        if(audioDecodedByteCount !== undefined) {
          params.noSound = !audioDecodedByteCount;
        }

        itemDiv.append(video);
        const thumb = await createPosterFromVideo(video);
        params.thumb = {
          url: await apiManagerProxy.invoke('createObjectURL', thumb.blob),
          ...thumb
        };
      });

      video.append(source);
    } else {
      const img = new Image();
      const url = await apiManagerProxy.invoke('createObjectURL', file);
      await renderImageFromUrlPromise(img, url);

      await this.scaleImageForTelegram(img, params);
      params.width = img.naturalWidth;
      params.height = img.naturalHeight;

      itemDiv.append(img);

      if(file.type === 'image/gif') {
        params.noSound = true;

        return Promise.all([
          getGifDuration(img).then((duration) => {
            params.duration = Math.ceil(duration);
          }),

          createPosterFromMedia(img).then(async(thumb) => {
            params.thumb = {
              url: await apiManagerProxy.invoke('createObjectURL', thumb.blob),
              ...thumb
            };
          })
        ]);
      }
    }

    return promise;
  }

  private async attachDocument(params: SendFileParams): ReturnType<PopupNewMedia['attachMedia']> {
    const {itemDiv} = params;
    itemDiv.classList.add('popup-item-document');
    const file = params.file;

    const isPhoto = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    if(isPhoto || isAudio || file.size < 20e6) {
      params.objectURL ||= await apiManagerProxy.invoke('createObjectURL', file);
    }

    let img: HTMLImageElement;
    if(isPhoto) {
      img = new Image();
      await renderImageFromUrlPromise(img, params.objectURL);
      await this.scaleImageForTelegram(img, params);
      params.scaledBlob = undefined;
    }

    const doc = {
      _: 'document',
      file: file,
      file_name: file.name || '',
      size: file.size,
      type: isPhoto ? 'photo' : 'doc'
    } as MyDocument;

    let cacheContext: ThumbCache;
    if(params.objectURL) {
      cacheContext = {
        url: params.objectURL,
        downloaded: file.size,
        type: THUMB_TYPE_FULL
      };
    }

    const docDiv = await wrapDocument({
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
      } as any,
      cacheContext
    });

    if(isPhoto) {
      params.width = img.naturalWidth;
      params.height = img.naturalHeight;
    }

    itemDiv.append(docDiv);
  }

  private attachFile = (file: File) => {
    const willAttach = this.willAttach;
    const shouldCompress = this.shouldCompress(file.type);

    const itemDiv = document.createElement('div');
    itemDiv.classList.add('popup-item');

    const params: SendFileParams = {
      file
    } as any;

    // do not pass these properties to worker
    defineNotNumerableProperties(params, ['scaledBlob', 'middlewareHelper', 'itemDiv', 'mediaSpoiler']);

    params.middlewareHelper = this.middlewareHelper.get().create();
    params.itemDiv = itemDiv;

    const promise = shouldCompress ? this.attachMedia(params) : this.attachDocument(params);
    willAttach.sendFileDetails.push(params);
    return promise;
  };

  private shouldCompress(mimeType: string) {
    return this.willAttach.type === 'media' && MEDIA_MIME_TYPES_SUPPORTED.has(mimeType);
  }

  private onRender() {
    // show now
    if(!this.element.classList.contains('active')) {
      this.listenerSetter.add(document.body)('keydown', this.onKeyDown);
      this.addEventListener('close', () => {
        if(this.wasInputValue) {
          this.chat.input.messageInputField.value = this.wasInputValue;
        }
      });
      this.show();
    }
  }

  private setTitle() {
    const {willAttach, title, files} = this;
    let key: LangPackKey;
    const args: FormatterArguments = [];
    if(willAttach.type === 'document') {
      key = 'PreviewSender.SendFile';
      args.push(files.length);
    } else {
      let foundPhotos = 0, foundVideos = 0, foundFiles = 0;
      files.forEach((file) => {
        if(file.type.startsWith('image/')) ++foundPhotos;
        else if(file.type.startsWith('video/')) ++foundVideos;
        else ++foundFiles;
      });

      if([foundPhotos, foundVideos, foundFiles].filter((n) => n > 0).length > 1) {
        key = 'PreviewSender.SendFile';
        args.push(files.length);
      } else

      /* const sum = foundPhotos + foundVideos;
      if(sum > 1 && willAttach.group) {
        key = 'PreviewSender.SendAlbum';
        const albumsLength = Math.ceil(sum / 10);
        args.push(albumsLength);
      } else  */if(foundPhotos) {
        key = 'PreviewSender.SendPhoto';
        args.push(foundPhotos);
      } else if(foundVideos) {
        key = 'PreviewSender.SendVideo';
        args.push(foundVideos);
      }
    }

    replaceContent(title, i18n(key, args));
  }

  private appendMediaToContainer(params: SendFileParams) {
    if(this.shouldCompress(params.file.type)) {
      const size = calcImageInBox(params.width, params.height, 380, 320);
      params.itemDiv.style.width = size.width + 'px';
      params.itemDiv.style.height = size.height + 'px';
    }

    this.mediaContainer.append(params.itemDiv);
  }

  private iterate(cb: (sendFileDetails: SendFileParams[]) => void) {
    const {sendFileDetails} = this.willAttach;
    if(!this.willAttach.group) {
      sendFileDetails.forEach((p) => cb([p]));
      return;
    }

    const length = sendFileDetails.length;
    for(let i = 0; i < length;) {
      const firstType = sendFileDetails[i].file.type;
      let k = 0;
      for(; k < 10 && i < length; ++i, ++k) {
        const type = sendFileDetails[i].file.type;
        if(this.shouldCompress(firstType) !== this.shouldCompress(type)) {
          break;
        }
      }

      cb(sendFileDetails.slice(i - k, i));
    }
  }

  private attachFiles() {
    const {files, willAttach, mediaContainer} = this;

    const oldSendFileDetails = willAttach.sendFileDetails.splice(0, willAttach.sendFileDetails.length);
    oldSendFileDetails.forEach((params) => {
      params.middlewareHelper.destroy();
    });

    this.appendGroupCheckboxField();
    this.appendMediaCheckboxField();

    const promises = files.map((file) => this.attachFile(file));

    Promise.all(promises).then(() => {
      mediaContainer.replaceChildren();

      if(!files.length) {
        return;
      }

      this.setTitle();

      this.iterate((sendFileDetails) => {
        const shouldCompress = this.shouldCompress(sendFileDetails[0].file.type);
        if(shouldCompress && sendFileDetails.length > 1) {
          const albumContainer = document.createElement('div');
          albumContainer.classList.add('popup-item-album', 'popup-item');
          albumContainer.append(...sendFileDetails.map((s) => s.itemDiv));

          prepareAlbum({
            container: albumContainer,
            items: sendFileDetails.map((o) => ({w: o.width, h: o.height})),
            maxWidth: 380,
            minWidth: 100,
            spacing: 4
          });

          mediaContainer.append(albumContainer);
        } else {
          sendFileDetails.forEach((params) => {
            this.appendMediaToContainer(params);
          });
        }

        if(!shouldCompress) {
          return;
        }

        sendFileDetails.forEach((params) => {
          const oldParams = oldSendFileDetails.find((o) => o.file === params.file);
          if(!oldParams) {
            return;
          }

          if(oldParams.mediaSpoiler) {
            this.applyMediaSpoiler(params, true);
          }
        });
      });
    }).then(() => {
      this.onRender();
    });
  }
}
