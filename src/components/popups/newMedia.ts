/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Chat from '../chat/chat';
import type {SendFileDetails} from '../../lib/appManagers/appMessagesManager';
import type {ChatRights} from '../../lib/appManagers/appChatsManager';
import PopupElement from '.';
import Scrollable from '../scrollable';
import {toast, toastNew} from '../toast';
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
import {SEND_WHEN_ONLINE_TIMESTAMP, THUMB_TYPE_FULL} from '../../lib/mtproto/mtproto_config';
import wrapDocument from '../wrappers/document';
import createContextMenu from '../../helpers/dom/createContextMenu';
import findUpClassName from '../../helpers/dom/findUpClassName';
import wrapMediaSpoiler, {toggleMediaSpoiler} from '../wrappers/mediaSpoiler';
import {MiddlewareHelper} from '../../helpers/middleware';
import {AnimationItemGroup} from '../animationIntersector';
import scaleMediaElement from '../../helpers/canvas/scaleMediaElement';
import {doubleRaf} from '../../helpers/schedulers';
import defineNotNumerableProperties from '../../helpers/object/defineNotNumerableProperties';
import {DocumentAttribute, Photo, PhotoSize} from '../../layer';
import {getPreviewBytesFromURL} from '../../helpers/bytes/getPreviewURLFromBytes';
import {renderImageFromUrlPromise} from '../../helpers/dom/renderImageFromUrl';
import ButtonMenuToggle from '../buttonMenuToggle';
import partition from '../../helpers/array/partition';
import InputFieldAnimated from '../inputFieldAnimated';
import IMAGE_MIME_TYPES_SUPPORTED from '../../environment/imageMimeTypesSupport';
import VIDEO_MIME_TYPES_SUPPORTED from '../../environment/videoMimeTypesSupport';
import rootScope from '../../lib/rootScope';
import shake from '../../helpers/dom/shake';
import AUDIO_MIME_TYPES_SUPPORTED from '../../environment/audioMimeTypeSupport';
import liteMode from '../../helpers/liteMode';

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

const MAX_WIDTH = 400 - 16;

export function getCurrentNewMediaPopup() {
  return currentPopup;
}

export default class PopupNewMedia extends PopupElement {
  private mediaContainer: HTMLElement;
  private wasInputValue: string;

  private willAttach: Partial<{
    type: 'media' | 'document',
    isMedia: true,
    group: boolean,
    sendFileDetails: SendFileParams[]
  }>;
  private messageInputField: InputFieldAnimated;
  private captionLengthMax: number;

  private animationGroup: AnimationItemGroup;
  private _scrollable: Scrollable;
  private inputContainer: HTMLDivElement;

  constructor(
    private chat: Chat,
    private files: File[],
    willAttachType: PopupNewMedia['willAttach']['type'],
    private ignoreInputValue?: boolean
  ) {
    super('popup-send-photo popup-new-media', {
      closable: true,
      withConfirm: 'Modal.Send',
      confirmShortcutIsSendShortcut: true,
      body: true,
      title: true,
      scrollable: true
    });

    this.animationGroup = '';
    this.construct(willAttachType);
  }

  public static async canSend(peerId: PeerId, onlyVisible?: boolean) {
    const actions: ChatRights[] = [
      'send_photos',
      'send_videos',
      'send_docs',
      'send_audios',
      'send_gifs'
    ];

    const actionsPromises = actions.map((action) => {
      return peerId.isAnyChat() && !onlyVisible ? rootScope.managers.appChatsManager.hasRights(peerId.toChatId(), action) : true;
    });

    const out: {[action in ChatRights]?: boolean} = {};

    const results = await Promise.all(actionsPromises);
    actions.forEach((action, idx) => {
      out[action] = results[idx];
    })

    return out;
  }

  private async construct(willAttachType: PopupNewMedia['willAttach']['type']) {
    this.willAttach = {
      type: willAttachType,
      sendFileDetails: [],
      group: true
    };

    const captionMaxLength = await this.managers.apiManager.getLimit('caption');
    this.captionLengthMax = captionMaxLength;

    const canSend = await PopupNewMedia.canSend(this.chat.peerId, true);

    const canSendPhotos = canSend.send_photos;
    const canSendVideos = canSend.send_videos;
    const canSendDocs = canSend.send_docs;

    attachClickEvent(this.btnConfirm, () => this.send(), {listenerSetter: this.listenerSetter});

    const btnMenu = await ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'image',
        text: 'Popup.Attach.AsMedia',
        onClick: () => this.changeType('media'),
        verify: () => {
          if(!this.hasAnyMedia() || this.willAttach.type !== 'document') {
            return false;
          }

          if(!canSendPhotos && !canSendVideos) {
            return false;
          }

          if(!canSendPhotos || !canSendVideos) {
            const mimeTypes = canSendPhotos ? IMAGE_MIME_TYPES_SUPPORTED : VIDEO_MIME_TYPES_SUPPORTED;
            const {media, files} = this.partition(mimeTypes);
            if(files.length) {
              return false;
            }
          }

          return true;
        }
      }, {
        icon: 'document',
        text: 'SendAsFile',
        onClick: () => this.changeType('document'),
        verify: () => this.files.length === 1 && this.willAttach.type !== 'document' && canSendDocs
      }, {
        icon: 'document',
        text: 'SendAsFiles',
        onClick: () => this.changeType('document'),
        verify: () => this.files.length > 1 && this.willAttach.type !== 'document' && canSendDocs
      }, {
        icon: 'groupmedia',
        text: 'Popup.Attach.GroupMedia',
        onClick: () => this.changeGroup(true),
        verify: () => !this.willAttach.group && this.canGroupSomething()
      }, {
        icon: 'groupmediaoff',
        text: 'Popup.Attach.UngroupMedia',
        onClick: () => this.changeGroup(false),
        verify: () => this.willAttach.group && this.canGroupSomething()
      }, {
        icon: 'mediaspoiler',
        text: 'EnablePhotoSpoiler',
        onClick: () => this.changeSpoilers(true),
        verify: () => this.canToggleSpoilers(true, true)
      }, {
        icon: 'mediaspoiler',
        text: 'Popup.Attach.EnableSpoilers',
        onClick: () => this.changeSpoilers(true),
        verify: () => this.canToggleSpoilers(true, false)
      }, {
        icon: 'mediaspoileroff',
        text: 'DisablePhotoSpoiler',
        onClick: () => this.changeSpoilers(false),
        verify: () => this.canToggleSpoilers(false, true)
      }, {
        icon: 'mediaspoileroff',
        text: 'Popup.Attach.RemoveSpoilers',
        onClick: () => this.changeSpoilers(false),
        verify: () => this.canToggleSpoilers(false, false)
      }]
    });

    this.header.append(btnMenu);

    this.btnConfirm.remove();

    this.mediaContainer = document.createElement('div');
    this.mediaContainer.classList.add('popup-photo');
    this.scrollable.container.append(this.mediaContainer);

    const inputContainer = this.inputContainer = document.createElement('div');
    inputContainer.classList.add('popup-input-container');

    const c = document.createElement('div');
    c.classList.add('popup-input-inputs', 'input-message-container');

    this.messageInputField = new InputFieldAnimated({
      placeholder: 'PreviewSender.CaptionPlaceholder',
      name: 'message',
      withLinebreaks: true,
      maxLength: this.captionLengthMax
    });

    this.listenerSetter.add(this.scrollable.container)('scroll', this.onScroll);
    this.listenerSetter.add(this.messageInputField.input)('scroll', this.onScroll);

    this.messageInputField.input.classList.replace('input-field-input', 'input-message-input');
    this.messageInputField.inputFake.classList.replace('input-field-input', 'input-message-input');

    c.append(this.messageInputField.input, this.messageInputField.inputFake);
    inputContainer.append(c, this.btnConfirm);

    if(!this.ignoreInputValue) {
      this.messageInputField.value = this.wasInputValue = this.chat.input.messageInputField.input.innerHTML;
      this.chat.input.messageInputField.value = '';
    }

    this.container.append(inputContainer);

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
        icon: 'mediaspoiler',
        text: 'EnablePhotoSpoiler',
        onClick: () => {
          this.applyMediaSpoiler(item);
        },
        verify: () => isMedia && !item.mediaSpoiler
      }, {
        icon: 'mediaspoileroff',
        text: 'DisablePhotoSpoiler',
        onClick: () => {
          this.removeMediaSpoiler(item);
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
        onSendWhenOnlineClick: () => {
          this.chat.input.setScheduleTimestamp(SEND_WHEN_ONLINE_TIMESTAMP, () => {
            this.send();
          });
        },
        openSide: 'top-left',
        onContextElement: this.btnConfirm,
        listenerSetter: this.listenerSetter,
        canSendWhenOnline: this.chat.input.canSendWhenOnline
      });

      sendMenu.setPeerId(this.chat.peerId);

      this.container.append(sendMenu.sendMenu);
    }

    currentPopup = this;
  }

  private onScroll = () => {
    const {input} = this.messageInputField;
    this.scrollable.onAdditionalScroll();
    if(input.scrollTop > 0 && input.scrollHeight > 130) {
      this.scrollable.container.classList.remove('scrolled-bottom');
    }
  };

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
      file_reference: [],
      pFlags: {}
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

  private removeMediaSpoiler(item: SendFileParams) {
    toggleMediaSpoiler({
      mediaSpoiler: item.mediaSpoiler,
      reveal: true,
      destroyAfter: true
    });

    item.mediaSpoiler = undefined;
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

  private partition(mimeTypes = MEDIA_MIME_TYPES_SUPPORTED) {
    const [media, files] = partition(this.willAttach.sendFileDetails, (d) => mimeTypes.has(d.file.type));
    return {
      media,
      files
    };
  }

  private mediaCount() {
    return this.partition().media.length;
  }

  private hasAnyMedia() {
    return this.mediaCount() > 0;
  }

  private canGroupSomething() {
    const {media, files} = this.partition();
    return media.length > 1 || files.length > 1;
  }

  private canToggleSpoilers(toggle: boolean, single: boolean) {
    let good = this.willAttach.type === 'media' && this.hasAnyMedia();
    if(single && good) {
      good = this.files.length === 1;
    }

    if(good) {
      const media = this.willAttach.sendFileDetails
      .filter((d) => MEDIA_MIME_TYPES_SUPPORTED.has(d.file.type))
      const mediaWithSpoilers = media.filter((d) => d.mediaSpoiler);

      good = single ? true : media.length > 1;

      if(good) {
        good = toggle ? media.length !== mediaWithSpoilers.length : media.length === mediaWithSpoilers.length;
      }
    }

    return good;
  }

  private changeType(type: PopupNewMedia['willAttach']['type']) {
    this.willAttach.type = type;
    this.attachFiles();
  }

  public changeGroup(group: boolean) {
    this.willAttach.group = group;
    this.attachFiles();
  }

  public changeSpoilers(toggle: boolean) {
    this.partition().media.forEach((item) => {
      if(toggle && !item.mediaSpoiler) {
        this.applyMediaSpoiler(item);
      } else if(!toggle && item.mediaSpoiler) {
        this.removeMediaSpoiler(item);
      }
    });
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
    const {input} = this.messageInputField;
    if(target !== input) {
      if(target.tagName === 'INPUT' || target.isContentEditable) {
        return;
      }

      input.focus();
      placeCaretAtEnd(input);
    }
  };

  private async send(force = false) {
    let caption = this.messageInputField.value;
    if(caption.length > this.captionLengthMax) {
      toast(I18n.format('Error.PreviewSender.CaptionTooLong', true));
      return;
    }

    const {peerId, input} = this.chat;

    const canSend = await PopupNewMedia.canSend(peerId);
    const willAttach = this.willAttach;
    willAttach.isMedia = willAttach.type === 'media' || undefined;
    const {sendFileDetails, isMedia} = willAttach;

    let foundBad = false;
    this.iterate((sendFileParams) => {
      if(foundBad) {
        return;
      }

      const isBad: (LangPackKey | boolean)[] = sendFileParams.map((params) => {
        const a: [Set<string> | (() => boolean), LangPackKey, ChatRights][] = [
          [AUDIO_MIME_TYPES_SUPPORTED, 'GlobalAttachAudioRestricted', 'send_audios'],
          [() => !MEDIA_MIME_TYPES_SUPPORTED.has(params.file.type), 'GlobalAttachDocumentsRestricted', 'send_docs']
        ];

        if(isMedia) {
          a.unshift(
            [IMAGE_MIME_TYPES_SUPPORTED, 'GlobalAttachPhotoRestricted', 'send_photos'],
            [() => VIDEO_MIME_TYPES_SUPPORTED.has(params.file.type as any) && params.noSound, 'GlobalAttachGifRestricted', 'send_gifs'],
            [VIDEO_MIME_TYPES_SUPPORTED, 'GlobalAttachVideoRestricted', 'send_videos']
          );
        }

        const found = a.find(([verify]) => {
          return typeof(verify) === 'function' ? verify() : verify.has(params.file.type);
        });

        if(found) {
          return canSend[found[2]] ? undefined : found[1];
        }

        return (!isMedia && !canSend.send_docs && 'GlobalAttachDocumentsRestricted') || undefined;
      });

      const key = isBad.find((i) => typeof(i) === 'string') as LangPackKey;
      if(key) {
        toastNew({
          langPackKey: key
        });

        if(liteMode.isAvailable('animations')) {
          shake(this.body);
        }
      }

      foundBad ||= !!key;
    });

    if(foundBad) {
      return;
    }

    if(this.chat.type === 'scheduled' && !force) {
      this.chat.input.scheduleSending(() => {
        this.send(true);
      });

      return;
    }

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
    this.wasInputValue = undefined;

    this.hide();
  }

  private modifyMimeTypeForTelegram(mimeType: string) {
    return mimeType === 'image/webp' ? 'image/jpeg' : mimeType;
  }

  private async scaleImageForTelegram(image: HTMLImageElement, mimeType: string, convertWebp?: boolean) {
    const PHOTO_SIDE_LIMIT = 2560;
    let url = image.src, scaledBlob: Blob;
    if(
      mimeType !== 'image/gif' &&
      (Math.max(image.naturalWidth, image.naturalHeight) > PHOTO_SIDE_LIMIT || (convertWebp && mimeType === 'image/webp'))
    ) {
      const {blob} = await scaleMediaElement({
        media: image,
        boxSize: makeMediaSize(PHOTO_SIDE_LIMIT, PHOTO_SIDE_LIMIT),
        mediaSize: makeMediaSize(image.naturalWidth, image.naturalHeight),
        mimeType: this.modifyMimeTypeForTelegram(mimeType) as any
      });

      scaledBlob = blob;
      URL.revokeObjectURL(url);
      url = await apiManagerProxy.invoke('createObjectURL', blob);
      await renderImageFromUrlPromise(image, url);
    }

    return scaledBlob && {url, blob: scaledBlob};
  }

  private async attachMedia(params: SendFileParams) {
    const {itemDiv} = params;
    itemDiv.classList.add('popup-item-media');

    const file = params.file;
    const isVideo = file.type.startsWith('video/');

    if(isVideo) {
      const video = createVideo();
      video.src = params.objectURL = await apiManagerProxy.invoke('createObjectURL', file);
      video.autoplay = true;
      video.controls = false;
      video.muted = true;

      video.addEventListener('timeupdate', () => {
        video.pause();
      }, {once: true});

      itemDiv.append(video);

      let error: Error;
      try {
        await onMediaLoad(video);
      } catch(err) {
        error = err as any;
      }

      params.width = video.videoWidth;
      params.height = video.videoHeight;
      params.duration = Math.floor(video.duration);

      if(error) {
        throw error;
      }

      const audioDecodedByteCount = (video as any).webkitAudioDecodedByteCount;
      if(audioDecodedByteCount !== undefined) {
        params.noSound = !audioDecodedByteCount;
      }

      const thumb = await createPosterFromVideo(video);
      params.thumb = {
        url: await apiManagerProxy.invoke('createObjectURL', thumb.blob),
        ...thumb
      };
    } else {
      const img = new Image();
      itemDiv.append(img);
      const url = params.objectURL = await apiManagerProxy.invoke('createObjectURL', file);

      await renderImageFromUrlPromise(img, url);
      const mimeType = params.file.type;
      const scaled = await this.scaleImageForTelegram(img, mimeType, true);
      if(scaled) {
        params.objectURL = scaled.url;
        params.scaledBlob = scaled.blob;
      }

      params.width = img.naturalWidth;
      params.height = img.naturalHeight;

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
        ]).then(() => {});
      }
    }
  }

  private async attachDocument(params: SendFileParams): ReturnType<PopupNewMedia['attachMedia']> {
    const {itemDiv} = params;
    itemDiv.classList.add('popup-item-document');
    const file = params.file;

    const isPhoto = file.type.startsWith('image/');
    const isAudio = AUDIO_MIME_TYPES_SUPPORTED.has(file.type as any);
    if(isPhoto || isAudio || file.size < 20e6) {
      params.objectURL ||= await apiManagerProxy.invoke('createObjectURL', file);
    }

    const attributes: DocumentAttribute[] = [];

    let img: HTMLImageElement;
    if(isPhoto && params.objectURL) {
      img = new Image();
      await renderImageFromUrlPromise(img, params.objectURL);
      const scaled = await this.scaleImageForTelegram(img, params.file.type);
      if(scaled) {
        params.objectURL = scaled.url;
      }
    }

    if(isAudio && params.objectURL) {
      try {
        // * get audio duration
        const audio = new Audio();
        audio.src = params.objectURL;
        audio.muted = true;
        audio.autoplay = true;
        await onMediaLoad(audio);
        params.duration = audio.duration;
        attributes.push({
          _: 'documentAttributeAudio',
          duration: params.duration,
          pFlags: {}
        });
      } catch(err) {
        console.error('audio loading error', err);
      }
    }

    const doc: MyDocument = {
      _: 'document',
      file,
      file_name: file.name || '',
      size: file.size,
      type: isAudio ? 'audio' : (isPhoto ? 'photo' : undefined),
      access_hash: 0,
      attributes,
      date: 0,
      dc_id: 0,
      file_reference: [],
      id: 0,
      pFlags: {},
      duration: params.duration
    };

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
    return promise.catch((err) => {
      itemDiv.style.backgroundColor = '#000';
      console.error('error rendering file', err);
    });
  };

  private shouldCompress(mimeType: string) {
    return this.willAttach.type === 'media' && MEDIA_MIME_TYPES_SUPPORTED.has(mimeType);
  }

  private onRender() {
    // show now
    if(!this.element.classList.contains('active')) {
      this.listenerSetter.add(document.body)('keydown', this.onKeyDown);
      !this.ignoreInputValue && this.addEventListener('close', () => {
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
      const size = calcImageInBox(params.width, params.height, MAX_WIDTH, 320);
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
            maxWidth: MAX_WIDTH,
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
      this.onScroll();
    });
  }
}

(window as any).PopupNewMedia = PopupNewMedia;
