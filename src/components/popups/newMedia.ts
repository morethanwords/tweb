/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {render} from 'solid-js/web';
import {createStore} from 'solid-js/store';

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
import {makeMediaSize} from '../../helpers/mediaSize';
import {ThumbCache} from '../../lib/storages/thumbs';
import onMediaLoad from '../../helpers/onMediaLoad';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {SEND_WHEN_ONLINE_TIMESTAMP, SERVER_IMAGE_MIME_TYPES, STARS_CURRENCY, THUMB_TYPE_FULL} from '../../lib/mtproto/mtproto_config';
import wrapDocument from '../wrappers/document';
import wrapMediaSpoiler, {toggleMediaSpoiler} from '../wrappers/mediaSpoiler';
import {MiddlewareHelper} from '../../helpers/middleware';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import scaleMediaElement from '../../helpers/canvas/scaleMediaElement';
import {doubleRaf} from '../../helpers/schedulers';
import defineNotNumerableProperties from '../../helpers/object/defineNotNumerableProperties';
import {DocumentAttribute, DraftMessage, Photo, PhotoSize} from '../../layer';
import {getPreviewBytesFromURL} from '../../helpers/bytes/getPreviewURLFromBytes';
import {renderImageFromUrlPromise} from '../../helpers/dom/renderImageFromUrl';
import ButtonMenuToggle from '../buttonMenuToggle';
import InputFieldAnimated from '../inputFieldAnimated';
import IMAGE_MIME_TYPES_SUPPORTED from '../../environment/imageMimeTypesSupport';
import VIDEO_MIME_TYPES_SUPPORTED from '../../environment/videoMimeTypesSupport';
import rootScope from '../../lib/rootScope';
import shake from '../../helpers/dom/shake';
import AUDIO_MIME_TYPES_SUPPORTED from '../../environment/audioMimeTypeSupport';
import liteMode from '../../helpers/liteMode';
import handleVideoLeak from '../../helpers/dom/handleVideoLeak';
import wrapDraft from '../wrappers/draft';
import getRichValueWithCaret from '../../helpers/dom/getRichValueWithCaret';
import {ChatType} from '../chat/chat';
import pause from '../../helpers/schedulers/pause';
import {Accessor, createEffect, createMemo, createRoot, createSignal, Setter} from 'solid-js';
import SelectedEffect from '../chat/selectedEffect';
import PopupMakePaid from './makePaid';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import Icon from '../icon';
import {MediaEditorFinalResult, MediaEditorFinalResultPayload} from '../mediaEditor/finalRender/createFinalResult';
import RenderProgressCircle from '../mediaEditor/renderProgressCircle';
import {animateValue, delay, lerp} from '../mediaEditor/utils';
import {IS_MOBILE} from '../../environment/userAgent';
import SolidJSHotReloadGuardProvider from '../../lib/solidjs/hotReloadGuardProvider';
import throttle from '../../helpers/schedulers/throttle';
import {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import {PAYMENT_REJECTED} from '../chat/paidMessagesInterceptor';
import ListenerSetter from '../../helpers/listenerSetter';
import canVideoBeAnimated from '../../lib/appManagers/utils/docs/canVideoBeAnimated';
import {NumberPair} from '../mediaEditor/types';
import MarkupTooltip from '../chat/markupTooltip';
import {MAX_EDITABLE_VIDEO_SIZE, supportsVideoEncoding} from '../mediaEditor/support';

type SendFileParams = SendFileDetails & {
  file?: File,
  scaledBlob?: Blob,
  noSound?: boolean,
  itemDiv: HTMLElement,
  mediaSpoiler?: HTMLElement,
  middlewareHelper: MiddlewareHelper,
  editResult?: MediaEditorFinalResult
};

let currentPopup: PopupNewMedia;

const MAX_WIDTH = 400 - 16;

export function getCurrentNewMediaPopup() {
  return currentPopup;
}

export default class PopupNewMedia extends PopupElement {
  private mediaContainer: HTMLElement;
  private wasDraft: DraftMessage.draftMessage;

  private willAttach: Partial<{
    type: 'media' | 'document',
    isMedia: true,
    group: boolean,
    sendFileDetails: SendFileParams[],
    invertMedia: boolean,
    stars: number
  }>;
  private effect: Accessor<DocId>;
  private setEffect: Setter<DocId>;
  private messageInputField: InputFieldAnimated;
  private captionLengthMax: number;

  private animationGroup: AnimationItemGroup;

  private activeActionsMenuItemDiv: HTMLElement;
  private activeActionsMenu: HTMLElement;
  private canShowActions = false;

  private cachedMediaEditorFiles = new WeakMap<Blob, File>;

  private actionsMenuListenerSetter = new ListenerSetter;

  private isMediaEditorOpen = false;

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

    this.animationGroup = 'NEW-MEDIA';
    this.construct(willAttachType);
  }

  public static async canSend({peerId, onlyVisible, threadId}: {peerId?: PeerId, onlyVisible?: boolean, threadId?: number}) {
    const actions: ChatRights[] = [
      'send_photos',
      'send_videos',
      'send_docs',
      'send_audios',
      'send_gifs'
    ];

    const actionsPromises = actions.map((action) => {
      return peerId.isAnyChat() && !onlyVisible ? rootScope.managers.appChatsManager.hasRights(peerId.toChatId(), action, undefined, threadId ? true : undefined) : true;
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

    const canSend = await PopupNewMedia.canSend({
      ...this.chat.getMessageSendingParams(),
      onlyVisible: true
    });

    const canSendPhotos = canSend.send_photos;
    const canSendVideos = canSend.send_videos;
    const canSendDocs = canSend.send_docs;

    attachClickEvent(this.btnConfirm, async() => (await pause(0), this.send()), {listenerSetter: this.listenerSetter});

    const btnMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'plusround',
        text: 'Add',
        onClick: () => {
          this.chat.input.onAttachClick(false, false, false);
        },
        verify: () => !this.isSuggestingPost()
      }, {
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
        verify: () => !this.willAttach.group && this.canGroupSomething() && this.canCheckIfHasGif() && !this.hasGif() && !this.isSuggestingPost()
      }, {
        icon: 'groupmediaoff',
        text: 'Popup.Attach.UngroupMedia',
        onClick: () => this.changeGroup(false),
        verify: () => this.willAttach.group && this.canGroupSomething() && this.canCheckIfHasGif() && !this.hasGif() && !this.isSuggestingPost()
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
      }, {
        icon: 'captionup',
        text: 'CaptionAbove',
        onClick: () => this.moveCaption(true),
        verify: () => this.canMoveCaption() && !this.willAttach.invertMedia
      }, {
        icon: 'captiondown',
        text: 'CaptionBelow',
        onClick: () => this.moveCaption(false),
        verify: () => this.canMoveCaption() && !!this.willAttach.invertMedia
      }, {
        icon: 'cash_circle',
        text: 'PaidMedia.Menu.Edit',
        onClick: () => {
          PopupElement.createPopup(PopupMakePaid, (value) => {
            this.setPaidMedia(value);
          }, this.willAttach.stars);
        },
        verify: () => !!this.willAttach.stars && this.canSendPaidMedia()
      }, {
        icon: 'cash_circle',
        text: 'PaidMedia.Menu',
        onClick: () => {
          PopupElement.createPopup(PopupMakePaid, (value) => {
            this.setPaidMedia(value);
          });
        },
        verify: () => !this.willAttach.stars && this.canSendPaidMedia()
      }]
    });

    this.header.append(btnMenu);

    this.btnConfirm.remove();

    this.mediaContainer = document.createElement('div');
    this.mediaContainer.classList.add('popup-photo');
    this.scrollable.container.append(this.mediaContainer);

    const inputContainer = document.createElement('div');
    inputContainer.classList.add('popup-input-container');

    const c = document.createElement('div');
    c.classList.add('popup-input-inputs', 'input-message-container');

    this.messageInputField = new InputFieldAnimated({
      placeholder: 'PreviewSender.CaptionPlaceholder',
      name: 'message',
      withLinebreaks: true,
      maxLength: this.captionLengthMax
    });

    this.messageInputField.input.dataset.animationGroup = this.animationGroup;
    this.listenerSetter.add(this.scrollable.container)('scroll', this.onScroll);
    this.listenerSetter.add(this.messageInputField.input)('scroll', this.onScroll);

    this.listenerSetter.add(this.messageInputField.input)('input', throttle((e) => {
      const {value} = getRichValueWithCaret(this.messageInputField.input);

      this.starsState.set({hasMessage: !!value.trim()})
    }, 120, true));

    this.messageInputField.input.classList.replace('input-field-input', 'input-message-input');
    this.messageInputField.inputFake.classList.replace('input-field-input', 'input-message-input');

    c.append(this.messageInputField.input, this.messageInputField.placeholder, this.messageInputField.inputFake);
    inputContainer.append(c, this.btnConfirm);

    if(!this.ignoreInputValue && !this.chat.input.editMsgId) {
      this.wasDraft = this.chat.input.getCurrentInputAsDraft();
      if(this.wasDraft) {
        const wrappedDraft = wrapDraft(this.wasDraft, {
          wrappingForPeerId: this.chat.peerId,
          animationGroup: this.animationGroup
        });

        this.messageInputField.setValueSilently(wrappedDraft);
        this.chat.input.messageInputField.value = '';
      }
    }

    this.container.append(inputContainer);

    this.attachFiles();

    this.addEventListener('close', () => {
      this.files.length = 0;
      this.willAttach.sendFileDetails.length = 0;
      this.hideActiveActionsMenu();

      if(currentPopup === this) {
        currentPopup = undefined;
      }
    });

    if(this.chat.type !== ChatType.Scheduled) {
      createRoot((dispose) => {
        this.chat.destroyMiddlewareHelper.onDestroy(dispose);
        const [effect, setEffect] = createSignal<DocId>(this.wasDraft?.effect);
        this.effect = effect;
        this.setEffect = setEffect;
        this.btnConfirm.append(SelectedEffect({effect: this.effect}) as HTMLElement);
      });

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
        middleware: this.middlewareHelper.get(),
        canSendWhenOnline: this.chat.input.canSendWhenOnline,
        onRef: (element) => {
          this.container.append(element);
        },
        withEffects: () => this.chat.peerId.isUser() && this.chat.peerId !== rootScope.myId,
        effect: this.effect,
        onEffect: this.setEffect
      });

      sendMenu?.setPeerParams({peerId: this.chat.peerId, isPaid: !!this.chat.starsAmount});
    }

    currentPopup = this;
  }

  private async canSendPaidMedia() {
    return await this.managers.appPeersManager.isBroadcast(this.chat.peerId) &&
      !!(await this.managers.appProfileManager.getChannelFull(this.chat.peerId.toChatId())).pFlags.paid_media_allowed;
  }

  public willSendPaidMedia() {
    return this.willAttach.stars &&
      this.willAttach.type === 'media' &&
      this.willAttach.sendFileDetails.length <= 10;
  }

  public setPaidMedia(stars: number) {
    this.willAttach.stars = stars;
    this.changeSpoilers(!!stars);
    this.setUnlockPlaceholders();
  }

  private setUnlockPlaceholders() {
    const {stars} = this.willAttach;
    this.mediaContainer.querySelectorAll('.popup-item-album, .popup-item-media:not(.grouped-item)').forEach((element) => {
      const className = 'extended-media-buy';
      element.querySelector(`.${className}`)?.remove();

      if(!this.willSendPaidMedia()) {
        return;
      }

      const priceEl = document.createElement('span');
      priceEl.classList.add(className);
      priceEl.append(i18n('PaidMedia.Unlock', [paymentsWrapCurrencyAmount(stars, STARS_CURRENCY)]));
      element.append(priceEl);
    });
  }

  private onScroll = () => {
    const {input} = this.messageInputField;
    this.scrollable.onAdditionalScroll();
    if(input.scrollTop > 0 && input.scrollHeight > 130) {
      this.scrollable.container.classList.remove('scrolled-end');
    }

    this.scrollable.container.addEventListener('scroll', () => {
      const actions = this.activeActionsMenu;
      if(!actions || !this.activeActionsMenuItemDiv) return;

      const bcr = this.activeActionsMenuItemDiv.getBoundingClientRect();
      if(!this.canShowActionsForBcr(bcr)) return void this.hideActiveActionsMenu();

      actions.style.left = bcr.left + bcr.width / 2 + 'px';
      actions.style.top = bcr.bottom + 'px';
    });
  };

  private async applyMediaSpoiler(item: SendFileParams, noAnimation?: boolean) {
    const spoilerToggle: HTMLElement = item.itemDiv.querySelector('.spoiler-toggle');
    if(spoilerToggle) spoilerToggle.dataset.disabled = 'true';


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

    if(spoilerToggle) {
      spoilerToggle.dataset.toggled = 'true';
      delete spoilerToggle.dataset.disabled;
    }
  }

  private removeMediaSpoiler(item: SendFileParams) {
    const spoilerToggle: HTMLElement = item.itemDiv.querySelector('.spoiler-toggle');
    if(spoilerToggle) spoilerToggle.dataset.disabled = 'true';

    toggleMediaSpoiler({
      mediaSpoiler: item.mediaSpoiler,
      reveal: true,
      destroyAfter: true
    });

    if(spoilerToggle) {
      delete spoilerToggle.dataset.toggled;
      delete spoilerToggle.dataset.disabled;
    }

    item.mediaSpoiler = undefined;
  }

  public appendDrops(element: HTMLElement) {
    this.body.append(element);
  }

  private partition(mimeTypes = MEDIA_MIME_TYPES_SUPPORTED) {
    const media: SendFileParams[] = [], files: SendFileParams[] = [], audio: SendFileParams[] = [];
    this.willAttach.sendFileDetails.forEach((d) => {
      if(mimeTypes.has(d.file.type)) {
        media.push(d);
      } else if(AUDIO_MIME_TYPES_SUPPORTED.has(d.file.type as any)) {
        audio.push(d);
      } else {
        files.push(d);
      }
    });

    return {
      media,
      files,
      audio
    };
  }

  private mediaCount() {
    return this.partition().media.length;
  }

  private hasAnyMedia() {
    return this.mediaCount() > 0;
  }

  private messagesCount() {
    let count = 0;
    this.iterate(() => {
      ++count;
    });

    return count;
  }

  private canGroupSomething() {
    const {media, files, audio} = this.partition();
    return media.length > 1 || files.length > 1 || audio.length > 1;
  }

  private canToggleSpoilers(toggle: boolean, single: boolean) {
    if(this.willSendPaidMedia()) return false;

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
    if(type === 'document') {
      this.moveCaption(false);
    }

    this.willAttach.type = type;
    this.attachFiles();
  }

  public changeGroup(group: boolean) {
    this.willAttach.group = group;
    this.attachFiles();
    this.starsState.set({isGrouped: group});
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

  public canMoveCaption() {
    return !this.messageInputField.isEmpty() && this.willAttach.type === 'media';
  }

  public moveCaption(above: boolean) {
    this.willAttach.invertMedia = above || undefined;
  }

  public addFiles(files: File[]) {
    if(this.isSuggestingPost() && this.files.length) return;
    if(this.isSuggestingPost()) files.splice(1);

    const toPush = files.filter((file) => {
      const found = this.files.find((_file) => {
        return _file.lastModified === file.lastModified && _file.name === file.name && _file.size === file.size;
      });

      return !found;
    });

    if(toPush.length) {
      this.files.push(...toPush);

      if(this.willSendPaidMedia() && this.files.length > 10) {
        this.changeSpoilers(false);
      }

      this.attachFiles();
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const {input} = this.messageInputField;
    if(target !== input) {
      if(target.tagName === 'INPUT' || target.isContentEditable || this.isMediaEditorOpen) {
        return;
      }

      input.focus();
      placeCaretAtEnd(input);
    }
  };

  private prepareEditedFileForSending(params: SendFileParams): File | undefined {
    const editResult = params.editResult?.getResult();
    if(!editResult || editResult instanceof Promise) return undefined;

    return this.wrapMediaEditorBlobInFile(params.file, editResult.blob, params.editResult?.isVideo);
  }

  private async send(force = false) {
    let {value: caption, entities} = getRichValueWithCaret(this.messageInputField.input, true, false);
    if(caption.length > this.captionLengthMax) {
      toast(I18n.format('Error.PreviewSender.CaptionTooLong', true));
      return;
    }

    const isSlowModeActive = await this.chat.input.showSlowModeTooltipIfNeeded({
      sendingFew: this.messagesCount() > 1,
      container: this.btnConfirm.parentElement,
      element: this.btnConfirm
    });
    if(isSlowModeActive) {
      return;
    }

    const {input} = this.chat;

    const canSend = await PopupNewMedia.canSend(this.chat.getMessageSendingParams());
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

    if(this.chat.type === ChatType.Scheduled && !force) {
      this.chat.input.scheduleSending(() => {
        this.send(true);
      });

      return;
    }

    const {length} = sendFileDetails;
    const sendingParams = this.chat.getMessageSendingParams();

    const preparedPaymentResult = await this.chat.input.paidMessageInterceptor.prepareStarsForPayment(this.starsState.totalMessages());
    if(preparedPaymentResult === PAYMENT_REJECTED) return;

    sendingParams.confirmedPaymentResult = preparedPaymentResult;

    let effect = this.effect();
    this.iterate((sendFileParams) => {
      if(caption && sendFileParams.length !== length) {
        this.managers.appMessagesManager.sendText({
          ...sendingParams,
          text: caption,
          entities,
          effect
          // clearDraft: true
        });

        caption = entities = effect = undefined;
      }

      const willSendPaidMedia = this.willSendPaidMedia();

      const d: SendFileDetails[] = sendFileParams.map((params) => {
        return {
          ...params,
          file: this.prepareEditedFileForSending(params) || params.scaledBlob || params.file,
          width: params.editResult?.width || params.width,
          height: params.editResult?.height || params.height,
          spoiler: willSendPaidMedia ? undefined : !!params.mediaSpoiler,
          editResult: undefined as MediaEditorFinalResult
        };
      });

      const w = {
        ...willAttach,
        sendFileDetails: d
      };

      if(!willSendPaidMedia) {
        delete w.stars;
      }

      this.managers.appMessagesManager.sendGrouped({
        ...sendingParams,
        caption,
        entities,
        effect,
        isMedia,
        // clearDraft: true,
        ...w
      });

      caption = entities = effect = undefined;
    });

    if(sendingParams.replyToMsgId || sendingParams.suggestedPost) {
      input.onHelperCancel();
    }
    // input.replyToMsgId = this.chat.threadId;
    // input.onMessageSent();
    this.wasDraft = undefined;

    this.hide();
  }

  private modifyMimeTypeForTelegram(mimeType: MTMimeType): MTMimeType {
    return SERVER_IMAGE_MIME_TYPES.has(mimeType) ? 'image/jpeg' : mimeType;
  }

  private async scaleImageForTelegram(image: HTMLImageElement, mimeType: MTMimeType, convertIncompatible?: boolean) {
    const PHOTO_SIDE_LIMIT = 2560;
    let url = image.src, scaledBlob: Blob;
    if(
      mimeType !== 'image/gif' &&
      (Math.max(image.naturalWidth, image.naturalHeight) > PHOTO_SIDE_LIMIT || (convertIncompatible && !SERVER_IMAGE_MIME_TYPES.has(mimeType)))
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

    const editResult = params.editResult;

    let promise: Promise<void>;

    if(editResult) {
      const result = editResult.getResult();

      function addGifLabel(result: MediaEditorFinalResultPayload) {
        if(!canVideoBeAnimated(!result.hasSound, result.blob.size)) return;
        const gifLabel = i18n('AttachGif');
        gifLabel.classList.add('gif-label');
        itemDiv.append(gifLabel);
      }

      if(!(result instanceof Promise)) {
        if(editResult.isVideo) {
          await putEditedImage(editResult.preview);
          await putEditedVideo(result);
          addGifLabel(result);
        } else {
          await putEditedImage(result.blob, true);
        }
      } else {
        await putEditedImage(editResult.preview);

        const div = document.createElement('div');
        const dispose = render(() => RenderProgressCircle({creationProgress: editResult.creationProgress}), div);
        itemDiv.append(div);

        (this.btnConfirmOnEnter as HTMLButtonElement).disabled = true;

        result.then(() => {
          pause(0).then(() => this.attachFiles());
        }).catch(async() => {
          params.editResult = undefined;
          pause(0).then(() => this.attachFiles());

          this.hideActiveActionsMenu();
        }).finally(() => {
          editResult.creationProgress?.dispose();
          div?.remove();
          dispose();
          (this.btnConfirmOnEnter as HTMLButtonElement).disabled = false;

          this.hideActiveActionsMenu();
        });
      }

      async function putEditedImage(blob: Blob, saveObjectURL = false) {
        const url = await apiManagerProxy.invoke('createObjectURL', blob);
        if(saveObjectURL) params.objectURL = url;

        const img = new Image();
        await renderImageFromUrlPromise(img, url);

        img.className = 'popup-item-media-extend-full';

        itemDiv.append(img);

        params.width = editResult.width;
        params.height = editResult.height;
      }

      async function putEditedVideo(result: MediaEditorFinalResultPayload) {
        const video = createVideo({middleware: params.middlewareHelper.get()});
        const url = await apiManagerProxy.invoke('createObjectURL', result.blob);
        video.src = params.objectURL = url;
        video.autoplay = true;
        video.controls = false;
        video.muted = true;
        video.loop = true;

        video.className = 'popup-item-media-extend-full';

        itemDiv.append(video);

        await onMediaLoad(video as HTMLMediaElement)

        params.width = editResult.width;
        params.height = editResult.height;
        params.duration = video.duration;
        params.noSound = !result.hasSound;

        const thumb = result.thumb || await createPosterFromVideo(video);
        const canBeAnimated = canVideoBeAnimated(!result.hasSound, result.blob.size);

        params.thumb = {
          url: await apiManagerProxy.invoke('createObjectURL', thumb.blob),
          isCover: !canBeAnimated && !!result.thumb,
          ...thumb
        };
      }
    } else if(isVideo) {
      const video = createVideo({middleware: params.middlewareHelper.get()});
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
        const promise = onMediaLoad(video as HTMLMediaElement);
        await handleVideoLeak(video, promise);
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

      const mimeType = params.file.type as MTMimeType;
      const scaled = await this.scaleImageForTelegram(img, mimeType, true);
      if(scaled) {
        params.objectURL = scaled.url;
        params.scaledBlob = scaled.blob;
      }

      params.width = img.naturalWidth;
      params.height = img.naturalHeight;

      if(file.type === 'image/gif') {
        params.noSound = true;

        promise = Promise.all([
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
    {
      const showActions = async() => {
        if(this.activeActionsMenuItemDiv === itemDiv || !this.canShowActions || this.destroyed) return;
        const bcr = itemDiv.getBoundingClientRect();
        if(!this.canShowActionsForBcr(bcr)) return;

        this.hideActiveActionsMenu();

        this.activeActionsMenuItemDiv = itemDiv;

        const actions = document.createElement('div');
        this.activeActionsMenu = actions;
        actions.classList.add('popup-item-media-action-menu');
        const itemCls = 'popup-item-media-action';

        const canEditVideo = await supportsVideoEncoding() && file.size <= MAX_EDITABLE_VIDEO_SIZE;

        let equalizeIcon: HTMLSpanElement;
        if(!this.willAttach.stars && file.type !== 'image/gif' && (!isVideo || canEditVideo)) {
          import('../mediaEditor'); // prefetch

          equalizeIcon = Icon('equalizer', itemCls);
          equalizeIcon.addEventListener('click', async() => {
            this.hideActiveActionsMenu();
            MarkupTooltip.getInstance().hide();

            (this.btnConfirmOnEnter as HTMLButtonElement).disabled = true;
            const source = itemDiv.querySelector('video') || itemDiv.querySelector('img');
            if(!source) return;

            const {openMediaEditorFromMedia} = await import('../mediaEditor');

            const sourceSize: NumberPair = source instanceof HTMLVideoElement ? [source.videoWidth, source.videoHeight] : [source.naturalWidth, source.naturalHeight];
            this.isMediaEditorOpen = true;

            openMediaEditorFromMedia({
              source,
              element: itemDiv,
              size: [params.width, params.height],
              mediaType: isVideo ? 'video' : 'image',
              mediaSrc: params.editResult?.originalSrc || params.objectURL,
              mediaBlob: file,
              mediaSize: params.editResult?.originalSize || sourceSize,
              managers: this.managers,
              onEditFinish: (result) => {
                params.editResult = result;
                this.attachFiles();
              },
              editingMediaState: params.editResult?.editingMediaState,
              onClose: (hasGif) => {
                this.isMediaEditorOpen = false;
                if(!hasGif)
                  (this.btnConfirmOnEnter as HTMLButtonElement).disabled = false;
              }
            });
          });
        }

        let spoilerToggle: HTMLSpanElement;
        if(!this.willAttach.stars) {
          spoilerToggle = document.createElement('span');
          spoilerToggle.classList.add(itemCls, 'spoiler-toggle');
          if(params.mediaSpoiler) spoilerToggle.dataset.toggled = 'true';
          spoilerToggle.append(Icon('mediaspoiler'), Icon('mediaspoileroff'));
          spoilerToggle.addEventListener('click', () => {
            if(spoilerToggle.dataset.disabled) return; // Prevent double clicks
            spoilerToggle.dataset.toggled = spoilerToggle.dataset.toggled === 'true' ? 'false' : 'true'
            !params.mediaSpoiler ? this.applyMediaSpoiler(params) : this.removeMediaSpoiler(params);
          });
        }

        const deleteIcon = Icon('delete', itemCls);
        deleteIcon.addEventListener('click', () => {
          const idx = this.files.findIndex((file) => file === params.file);
          if(idx >= 0) {
            this.hideActiveActionsMenu();
            this.files.splice(idx, 1);
            params.editResult?.creationProgress?.dispose();
            this.files.length ? this.attachFiles() : this.destroy();
          }
        });

        const resultPromise = params?.editResult?.getResult();
        let cancelBtn: HTMLDivElement;
        if(resultPromise instanceof Promise) {
          actions.classList.add('popup-item-media-action-menu-cancel');
          cancelBtn = document.createElement('div');
          cancelBtn.append(i18n('Cancel'));
          cancelBtn.classList.add('popup-item-media-action-menu-cancel-btn');
          cancelBtn.addEventListener('click', () => {
            params?.editResult.cancel?.();
          });
        }

        actions.append(...[cancelBtn, equalizeIcon, spoilerToggle, deleteIcon].filter(Boolean));

        actions.style.left = bcr.left + bcr.width / 2 + 'px';
        actions.style.top = bcr.bottom + 'px';

        document.body.append(actions);
        await doubleRaf();
        actions.style.opacity = '1';

        const listener = (e: MouseEvent) => {
          if((e.target as HTMLElement)?.closest?.('.popup-item-media-action-menu') || e.target === itemDiv || itemDiv.contains(e.target as Node)) return;
          this.hideActiveActionsMenu();
        }
        this.actionsMenuListenerSetter.add(document)('pointermove', listener);
        this.actionsMenuListenerSetter.add(document)('keydown', () => {
          this.hideActiveActionsMenu();
        }, {capture: true});
        if(IS_MOBILE) {
          this.actionsMenuListenerSetter.add(document)('pointerdown', listener);
        }
      }

      itemDiv.addEventListener('pointermove', showActions);
      itemDiv.addEventListener('pointerup', showActions);
    }

    return promise;
  }

  private async hideActiveActionsMenu() {
    this.actionsMenuListenerSetter.removeAll();

    const el = this.activeActionsMenu;
    this.activeActionsMenu = this.activeActionsMenuItemDiv = undefined;

    if(!el) return;
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    await delay(200);
    el?.remove();
  }

  private wrapMediaEditorBlobInFile(originalFile: File, editedBlob: Blob, isVideo: boolean) {
    if(this.cachedMediaEditorFiles.has(editedBlob)) return this.cachedMediaEditorFiles.get(editedBlob);

    let name = originalFile.name;
    if(isVideo) name = name.replace(/\.[^.]+$/, '.mp4');

    const result = new File([editedBlob], name, {type: editedBlob.type});
    this.cachedMediaEditorFiles.set(editedBlob, result);

    return result;
  }


  private async attachDocument(params: SendFileParams): ReturnType<PopupNewMedia['attachMedia']> {
    const {itemDiv} = params;
    itemDiv.classList.add('popup-item-document');

    const editResult = await params.editResult?.getResult();
    const file = editResult ?
      this.wrapMediaEditorBlobInFile(params.file, editResult.blob, params.editResult?.isVideo) :
      params.file;

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
      const scaled = await this.scaleImageForTelegram(img, file.type as MTMimeType);
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

  private attachFile = (file: File, oldParams?: Partial<SendFileParams>) => {
    const willAttach = this.willAttach;
    const shouldCompress = this.shouldCompress(file.type);

    const itemDiv = document.createElement('div');
    itemDiv.classList.add('popup-item');

    const params: SendFileParams = {
      file,
      ...(oldParams || {})
    } as any;

    // do not pass these properties to worker
    defineNotNumerableProperties(params, ['scaledBlob', 'middlewareHelper', 'itemDiv', 'mediaSpoiler']);

    params.middlewareHelper = this.lateMiddlewareHelper.get().create();
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
    if(this.element.classList.contains('active')) {
      return;
    }

    this.listenerSetter.add(document.body)('keydown', this.onKeyDown);
    animationIntersector.setOnlyOnePlayableGroup(this.animationGroup);
    this.addEventListener('close', () => {
      animationIntersector.setOnlyOnePlayableGroup();

      if(!this.ignoreInputValue && this.wasDraft) {
        this.chat.input.setDraft(this.wasDraft, false, true);
      }
    });
    this.show();
  }

  private updateConfirmBtnContent(stars: number): void {
    if(!stars) return void replaceContent(this.btnConfirm, i18n('Modal.Send'));

    const span = document.createElement('span');
    span.classList.add('popup-confirm-btn-inner');

    span.append(Icon('star', 'popup-confirm-btn-inner-star'), numberThousandSplitterForStars(stars) + '');

    replaceContent(
      this.btnConfirm,
      span
    );
  }

  private starsState = createRoot(dispose => {
    this.lateMiddlewareHelper.get().onDestroy(() => void dispose());

    const [store, set] = createStore({
      hasMessage: false,
      isGrouped: true,
      attachedFiles: this.files.length,
      starsAmount: this.chat.starsAmount || 0
    });

    const shouldCountMessage = () => +store.hasMessage * +(!store.isGrouped && store.attachedFiles > 1);
    const totalMessages = createMemo(() => +shouldCountMessage() + store.attachedFiles);
    const totalStars = createMemo(() => store.starsAmount * totalMessages());

    createEffect(() => {
      this.updateConfirmBtnContent(totalStars());
    });

    return {store, set, totalMessages};
  });

  public setStarsAmount(starsAmount: number) {
    this.starsState.set({starsAmount});
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
      } else if(foundPhotos) {
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

  private hasGif() {
    const {sendFileDetails} = this.willAttach;

    return sendFileDetails.some((params) => {
      const result = params.editResult?.getResult();
      if(!result || result instanceof Promise) return false;

      return canVideoBeAnimated(!result.hasSound, result.blob.size);
    });
  }

  private canCheckIfHasGif() {
    const {sendFileDetails} = this.willAttach;

    return sendFileDetails.every((params) => !(params?.editResult?.getResult() instanceof Promise));
  }

  private iterate(cb: (sendFileDetails: SendFileParams[]) => void) {
    const {sendFileDetails} = this.willAttach;

    if(!this.willAttach.group || this.hasGif()) {
      sendFileDetails.forEach((p) => cb([p]));
      return;
    }

    const length = sendFileDetails.length;
    for(let i = 0; i < length;) {
      const firstType = sendFileDetails[i].file.type;
      let k = 0, isAudio: boolean;
      for(; k < 10 && i < length; ++i, ++k) {
        const type = sendFileDetails[i].file.type;
        const _isAudio = AUDIO_MIME_TYPES_SUPPORTED.has(type as any);
        isAudio ??= _isAudio;
        if(_isAudio !== isAudio || this.shouldCompress(firstType) !== this.shouldCompress(type)) {
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

    const promises = files.map((file) => {
      const oldParams = oldSendFileDetails.find((o) => o.file === file);
      return this.attachFile(
        file,
        oldParams?.editResult ? {
          editResult: oldParams.editResult
        } : undefined
      );
    });

    this.canShowActions = false;

    Promise.all(promises).then(() => {
      mediaContainer.replaceChildren();
      this.starsState.set({attachedFiles: files.length, isGrouped: this.willAttach?.group && !this.hasGif()});

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
          if(oldParams?.mediaSpoiler || this.willSendPaidMedia()) {
            this.applyMediaSpoiler(params, true);
          }
        });
      });

      this.setUnlockPlaceholders();
    }).then(() => {
      this.onRender();
      this.onScroll();
      doubleRaf().then(() => this.afterRender());
    });
  }

  private isSuggestingPost() {
    return !!this.chat?.input?.suggestedPost;
  }

  private canShowActionsForBcr(bcr: DOMRect) {
    const scrollableBcr = this.scrollable.container.getBoundingClientRect();
    const approximateCenterY = bcr.bottom - 20;

    return approximateCenterY >= scrollableBcr.top && approximateCenterY <= scrollableBcr.bottom;
  }

  private afterRender() {
    setTimeout(() => {
      this.canShowActions = true;
    }, 200);

    this.willAttach.sendFileDetails.forEach((params) => {
      const editResult = params.editResult;
      if(editResult?.animatedPreview) {
        const img = editResult.animatedPreview;
        const bcr = img.getBoundingClientRect();
        const left = bcr.left + bcr.width / 2, top = bcr.top + bcr.height / 2, width = bcr.width, height = bcr.height;
        const targetBcr = params.itemDiv.getBoundingClientRect();
        const leftDiff = (targetBcr.left + targetBcr.width / 2) - left;
        const topDiff = (targetBcr.top + targetBcr.height / 2) - top;
        animateValue(
          0, 1, 200,
          (progress) => {
            img.style.transform = `translate(calc(${
              progress * leftDiff
            }px - 50%), calc(${
              progress * topDiff
            }px - 50%))`;
            img.style.width = lerp(width, targetBcr.width, progress) + 'px';
            img.style.height = lerp(height, targetBcr.height, progress) + 'px';
          },
          {
            onEnd: () => {
              img.remove();
              editResult.animatedPreview = undefined;
            }
          }
        )
      }
    });
  }

  protected destroy() {
    super.destroy();
    this.hideActiveActionsMenu();
  }
}

(window as any).PopupNewMedia = PopupNewMedia;
