import {Portal, render} from 'solid-js/web';
import {getOverlayRoot} from '@helpers/appWindow';
import {createStore} from 'solid-js/store';

import type Chat from '@components/chat/chat';
import type {MessageSendingParams, SendFileDetails} from '@appManagers/appMessagesManager';
import type {ChatRights} from '@appManagers/appChatsManager';
import PopupElement, {createPopup, PopupContext, PopupContextValue} from './indexTsx';
import {toastNew} from '@components/toast';
import SendContextMenu from '@components/chat/sendContextMenu';
import {createPosterFromMedia, createPosterFromVideo} from '@helpers/createPoster';
import {MyDocument} from '@appManagers/appDocsManager';
import {i18n, LangPackKey} from '@lib/langPack';
import calcImageInBox from '@helpers/calcImageInBox';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import MEDIA_MIME_TYPES_SUPPORTED from '@environment/mediaMimeTypesSupport';
import getGifDuration from '@helpers/getGifDuration';
import gifToVideo, {canConvertGifToVideo, canConvertGifToVideoSync} from '@helpers/gifToVideo';
import movToVideo, {isConvertibleMov} from '@helpers/movToVideo';
import getFileMimeType, {normalizeFileMimeType} from '@helpers/files/getFileMimeType';
import deferredPromise from '@helpers/cancellablePromise';
import {ObjectURLScope} from '@helpers/objectUrl';
import noop from '@helpers/noop';
import toHHMMSS from '@helpers/string/toHHMMSS';
import replaceContent from '@helpers/dom/replaceContent';
import createVideo from '@helpers/dom/createVideo';
import prepareAlbum from '@components/prepareAlbum';
import {makeMediaSize} from '@helpers/mediaSize';
import {ThumbCache} from '@lib/storages/thumbs';
import onMediaLoad from '@helpers/onMediaLoad';
import {SEND_WHEN_ONLINE_TIMESTAMP, SERVER_IMAGE_MIME_TYPES, STARS_CURRENCY, THUMB_TYPE_FULL} from '@appManagers/constants';
import wrapDocument from '@components/wrappers/document';
import wrapVideo from '@components/wrappers/video';
import wrapMediaSpoiler, {toggleMediaSpoiler} from '@components/wrappers/mediaSpoiler';
import {MiddlewareHelper} from '@helpers/middleware';
import animationIntersector, {AnimationItemGroup} from '@components/animationIntersector';
import scaleMediaElement from '@helpers/canvas/scaleMediaElement';
import {doubleRaf, fastRafPromise} from '@helpers/schedulers';
import defineNotNumerableProperties from '@helpers/object/defineNotNumerableProperties';
import {DocumentAttribute, DraftMessage, Photo, PhotoSize} from '@layer';
import {getPreviewBytesFromURL} from '@helpers/bytes/getPreviewURLFromBytes';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import Button from '@components/buttonTsx';
import InputFieldAnimated from '@components/inputFieldAnimated';
import InputFieldMessage from '@components/inputFieldMessage';
import IMAGE_MIME_TYPES_SUPPORTED from '@environment/imageMimeTypesSupport';
import VIDEO_MIME_TYPES_SUPPORTED from '@environment/videoMimeTypesSupport';
import {IS_MOV_SUPPORTED} from '@environment/videoSupport';
import rootScope from '@lib/rootScope';
import shake from '@helpers/dom/shake';
import AUDIO_MIME_TYPES_SUPPORTED from '@environment/audioMimeTypeSupport';
import liteMode from '@helpers/liteMode';
import handleVideoLeak from '@helpers/dom/handleVideoLeak';
import wrapDraft from '@components/wrappers/draft';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {ChatType} from '@components/chat/chatType';
import pause from '@helpers/schedulers/pause';
import {Accessor, createMemo, createRoot, createSignal, onCleanup, onMount, Setter, Signal, useContext} from 'solid-js';
import SelectedEffect from '@components/chat/selectedEffect';
import showMakePaidPopup from '@components/popups/makePaid';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import Icon from '@components/icon';
import {MediaEditorFinalResult, MediaEditorFinalResultPayload} from '@components/mediaEditor/finalRender/createFinalResult';
import RenderProgressCircle from '@components/mediaEditor/renderProgressCircle';
import {delay} from '@components/mediaEditor/utils';
import {IS_MOBILE} from '@environment/userAgent';
import {PAYMENT_REJECTED} from '@components/chat/paidMessagesInterceptor';
import ListenerSetter from '@helpers/listenerSetter';
import canVideoBeAnimated from '@appManagers/utils/docs/canVideoBeAnimated';
import isEphemeralMessageId from '@appManagers/utils/messageId/isEphemeralMessageId';
import MarkupTooltip from '@components/chat/markupTooltip';
import {MAX_EDITABLE_VIDEO_SIZE, supportsVideoEncoding} from '@components/mediaEditor/support';
import {animateValue} from '@helpers/animateValue';
import {lerp} from '@helpers/lerp';
import {attachContextMenuListener} from '@helpers/dom/attachContextMenuListener';
import cancelEvent from '@helpers/dom/cancelEvent';
import ButtonMenu from '@components/buttonMenu';
import contextMenuController from '@helpers/contextMenuController';
import {makeDateFromTimestamp} from '@helpers/date/makeDateFromTimestamp';
import Section from '@components/section';
import classNames from '@helpers/string/classNames';
import {ScrollableContextValue} from '@components/scrollable2';


type SendFileParams = SendFileDetails & {
  file?: File | MyDocument,
  scaledBlob?: Blob,
  itemDiv: HTMLElement,
  mediaSpoiler?: HTMLElement,
  middlewareHelper: MiddlewareHelper,
  objectURLs: ObjectURLScope,
  editResult?: MediaEditorFinalResult
};

type ConstructorInputFile = {
  file: File;
  editResult: MediaEditorFinalResult;
};

type WillAttachType = 'media' | 'document';

type WillAttach = Partial<{
  type: WillAttachType,
  isMedia: true,
  group: boolean,
  sendFileDetails: SendFileParams[],
  invertMedia: boolean,
  stars: number
}>;

export type NewMediaPopupHandle = {
  addFiles: (files: File[]) => void,
  setStarsAmount: (starsAmount: number) => void,
  appendDrops: (element: HTMLElement) => void,
  hide: () => void
};

let currentPopup: NewMediaPopupHandle;

const MAX_WIDTH = 400 - 16;

// A "compressed photo" heavier than this is re-encoded to JPEG at PHOTO_COMPRESSED_QUALITY,
// otherwise the server rejects it with PHOTO_SAVE_FILE_INVALID (a detailed 2560px PNG is
// ~10MB). Used for both the direct send (scaleImageForTelegram) and the edited result
// (passed into the media editor), so the policy lives in one place.
const PHOTO_HEAVY_BYTES = 2 * 1024 * 1024;
const PHOTO_COMPRESSED_QUALITY = 0.9;
// The source size above only predicts the ENCODED size for the formats it names; a
// lossy source (HEIC, WEBP, AVIF) is small on disk yet re-encodes to ~12MB at full
// quality when it is detailed. So the encoded result is checked too, and only a
// result over this budget is compressed — anything that already fits is left alone.
const PHOTO_MAX_BYTES = 6 * 1024 * 1024;

type MediaTitleKind = 'gif' | 'photo' | 'video' | 'file';

const SEND_TITLE_KEYS: {[kind in MediaTitleKind]: LangPackKey} = {
  gif: 'PreviewSender.SendGif',
  photo: 'PreviewSender.SendPhoto',
  video: 'PreviewSender.SendVideo',
  file: 'PreviewSender.SendFile'
};

const REPLACE_TITLE_KEYS: {[kind in MediaTitleKind]: LangPackKey} = {
  gif: 'ReplaceGIF',
  photo: 'ReplacePhoto',
  video: 'ReplaceVideo',
  file: 'ReplaceFile'
};

export function getCurrentNewMediaPopup() {
  return currentPopup;
}

export async function canSendNewMedia({peerId, onlyVisible, threadId}: {peerId?: PeerId, onlyVisible?: boolean, threadId?: number}) {
  const actions: ChatRights[] = [
    'send_photos',
    'send_videos',
    'send_docs',
    'send_audios',
    'send_gifs'
  ];

  const actionsPromises = actions.map((action) => {
    return peerId.isAnyChat() && !onlyVisible ?
      rootScope.managers.appChatsManager.hasRights(peerId.toChatId(), action, undefined, threadId ? true : undefined) :
      true;
  });

  const out: {[action in ChatRights]?: boolean} = {};

  const results = await Promise.all(actionsPromises);
  actions.forEach((action, idx) => {
    out[action] = results[idx];
  })

  return out;
}

export default function showNewMediaPopup(
  chat: Chat,
  inputFiles: (ConstructorInputFile | File)[],
  willAttachType: WillAttachType,
  ignoreInputValue?: boolean,
  gifDocument?: MyDocument,
  ephemeralSnapshot?: MessageSendingParams
) {
  let context: PopupContextValue;

  const [show, setShow] = createSignal(false); // opens once the files have rendered
  const [titleContent, setTitleContent] = createSignal<HTMLElement>();
  const [menuEl, setMenuEl] = createSignal<HTMLElement>();
  const [captionScrolled, setCaptionScrolled] = createSignal(false);
  const [isEphemeralComposer, setIsEphemeralComposer] = createSignal(false);

  let containerEl!: HTMLDivElement;
  let bodyEl!: HTMLDivElement;
  let scrollableEl!: HTMLDivElement;
  let scrollableCtx: ScrollableContextValue;
  let rendered = false;

  const listenerSetter = new ListenerSetter();
  const actionsMenuListenerSetter = new ListenerSetter();
  const closeCallbacks: (() => void)[] = [];

  // the caption's send button lives inside the message input, not in the header
  const btnConfirm = document.createElement('button');
  btnConfirm.classList.add('btn-primary', 'btn-color-primary');

  const mediaContainer = document.createElement('div');
  mediaContainer.classList.add('popup-photo');

  const animationGroup: AnimationItemGroup = 'NEW-MEDIA';

  let willAttach: WillAttach;
  let wasDraft: DraftMessage.draftMessage;
  let messageInputField: InputFieldAnimated;
  let captionLengthMax: number;
  let currentFileSection: HTMLElement;
  let effectAccessor: Accessor<DocId>;
  let setEffectAccessor: Setter<DocId>;

  let activeActionsMenuItemDiv: HTMLElement;
  let activeActionsMenu: HTMLElement;
  let canShowActions = false;
  let isMediaEditorOpen = false;

  const cachedMediaEditorFiles = new WeakMap<Blob, File>;
  const pendingEditResults = new WeakMap<File, MediaEditorFinalResult>;
  const convertedFiles = new WeakMap<File, {file: File, width: number, height: number, duration: number}>;
  const failedConversions = new WeakSet<File>;
  const fileConversions = new Map<File, {promise: Promise<void>, progress: Signal<number>, info: Promise<{width: number, height: number} | undefined>}>;
  // * heavy work (conversions) waits for this so it doesn't jank the open animation
  const openAnimationDeferred = deferredPromise<void>();

  const sendingParams = ephemeralSnapshot || chat.getMessageSendingParams();
  const hasEphemeralReply = sendingParams.replyTo?._ === 'inputReplyToEphemeralMessage' ||
    (!!sendingParams.replyToMsgId && isEphemeralMessageId(sendingParams.replyToMsgId));
  let pinnedEphemeralSendingParams: MessageSendingParams;
  if(sendingParams.ephemeral && hasEphemeralReply) {
    pinnedEphemeralSendingParams = {
      ephemeral: true,
      ephemeralReceiverId: sendingParams.ephemeralReceiverId,
      peerId: sendingParams.peerId,
      threadId: sendingParams.threadId,
      replyToMsgId: sendingParams.replyToMsgId,
      replyTo: sendingParams.replyTo
    };
  }

  let ephemeralComposer = !!sendingParams.ephemeral;
  if(ephemeralComposer && inputFiles.length > 1) {
    inputFiles = inputFiles.slice(0, 1);
    toastNew({langPackKey: 'Ephemeral.SingleAttachment'});
  }

  const files: File[] = inputFiles.map((inputFile) => {
    // The {file, editResult} wrapper is the only variant carrying a `file` field; everything else
    // is a plain File. Cross-realm-safe (a Document PiP window's File isn't `instanceof` the main File).
    if(!('file' in inputFile)) {
      return normalizeFileMimeType(inputFile);
    }
    const file = normalizeFileMimeType(inputFile.file);
    pendingEditResults.set(file, inputFile.editResult);
    return file;
  });

  canConvertGifToVideo(); // warm up the memo for the sync reads

  function createStarsState() {
    const [store, set] = createStore({
      hasMessage: false,
      isGrouped: true,
      attachedFiles: files.length,
      starsAmount: chat.starsAmount || 0
    });

    const shouldCountMessage = () => +store.hasMessage * +(!store.isGrouped && store.attachedFiles > 1);
    const totalMessages = createMemo(() => +shouldCountMessage() + store.attachedFiles);
    const totalStars = createMemo(() => store.starsAmount * totalMessages());

    return {store, set, totalMessages, totalStars};
  }

  let starsState: ReturnType<typeof createStarsState>;

  async function construct() {
    willAttach = {
      type: willAttachType,
      sendFileDetails: [],
      group: true
    };

    const captionMaxLength = await context.managers.apiManager.getLimit('caption');
    captionLengthMax = captionMaxLength;

    const canSend = await canSendNewMedia({
      ...chat.getMessageSendingParams(),
      onlyVisible: true
    });

    const canSendPhotos = canSend.send_photos;
    const canSendVideos = canSend.send_videos;
    const canSendDocs = canSend.send_docs;

    attachClickEvent(btnConfirm, async() => (await pause(0), send()), {listenerSetter});

    const btnMenu = ButtonMenuToggle({
      listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'plusround',
        text: 'Add',
        onClick: () => {
          chat.input.onAttachClick(false, false, false);
        },
        verify: () => canHaveMultipleFiles()
      }, {
        icon: 'image',
        text: 'Popup.Attach.AsMedia',
        onClick: () => changeType('media'),
        verify: () => {
          if(!hasAnyMedia() || willAttach.type !== 'document' || isEditingMediaFromAlbum()) {
            return false;
          }

          if(!canSendPhotos && !canSendVideos) {
            return false;
          }

          if(!canSendPhotos || !canSendVideos) {
            const mimeTypes = canSendPhotos ? IMAGE_MIME_TYPES_SUPPORTED : VIDEO_MIME_TYPES_SUPPORTED;
            const {media, files} = partition(mimeTypes);
            if(files.length) {
              return false;
            }
          }

          return true;
        }
      }, {
        icon: 'document',
        text: 'SendAsFile',
        onClick: () => changeType('document'),
        verify: () => files.length === 1 && willAttach.type !== 'document' && canSendDocs && !isEditingMediaFromAlbum()
      }, {
        icon: 'document',
        text: 'SendAsFiles',
        onClick: () => changeType('document'),
        verify: () => files.length > 1 && willAttach.type !== 'document' && canSendDocs && !isEditingMediaFromAlbum()
      }, {
        icon: 'groupmedia',
        text: 'Popup.Attach.GroupMedia',
        onClick: () => changeGroup(true),
        verify: () => !willAttach.group && canGroupSomething() && canCheckIfHasGif() && !hasGif() && canHaveMultipleFiles()
      }, {
        icon: 'groupmediaoff',
        text: 'Popup.Attach.UngroupMedia',
        onClick: () => changeGroup(false),
        verify: () => willAttach.group && canGroupSomething() && canCheckIfHasGif() && !hasGif() && canHaveMultipleFiles()
      }, {
        icon: 'mediaspoiler',
        text: 'EnablePhotoSpoiler',
        onClick: () => changeSpoilers(true),
        verify: () => canToggleSpoilers(true, true)
      }, {
        icon: 'mediaspoiler',
        text: 'Popup.Attach.EnableSpoilers',
        onClick: () => changeSpoilers(true),
        verify: () => canToggleSpoilers(true, false)
      }, {
        icon: 'mediaspoileroff',
        text: 'DisablePhotoSpoiler',
        onClick: () => changeSpoilers(false),
        verify: () => canToggleSpoilers(false, true)
      }, {
        icon: 'mediaspoileroff',
        text: 'Popup.Attach.RemoveSpoilers',
        onClick: () => changeSpoilers(false),
        verify: () => canToggleSpoilers(false, false)
      }, {
        icon: 'captionup',
        text: 'CaptionAbove',
        onClick: () => moveCaption(true),
        verify: () => canMoveCaption() && !willAttach.invertMedia
      }, {
        icon: 'captiondown',
        text: 'CaptionBelow',
        onClick: () => moveCaption(false),
        verify: () => canMoveCaption() && !!willAttach.invertMedia
      }, {
        icon: 'cash_circle',
        text: 'PaidMedia.Menu.Edit',
        onClick: () => {
          showMakePaidPopup((value) => {
            setPaidMedia(value);
          }, willAttach.stars);
        },
        verify: () => !!willAttach.stars && canSendPaidMedia()
      }, {
        icon: 'cash_circle',
        text: 'PaidMedia.Menu',
        onClick: () => {
          showMakePaidPopup((value) => {
            setPaidMedia(value);
          });
        },
        verify: () => !willAttach.stars && canSendPaidMedia()
      }]
    });

    setMenuEl(btnMenu);

    let draft: DocumentFragment;
    if(!ignoreInputValue) {
      wasDraft = chat.input.getCurrentInputAsDraft();
      if(wasDraft) {
        draft = wrapDraft(wasDraft, {
          wrappingForPeerId: chat.peerId,
          animationGroup,
          middleware: context.middlewareHelper.get()
        });

        chat.input.messageInputField.value = '';
      }
    }

    createRoot((dispose) => {
      context.middlewareHelper.onDestroy(dispose);

      const children = InputFieldMessage({
        maxLength: captionLengthMax,
        animationGroup,
        listenerSetter,
        onScroll,
        onInput: (hasValue) => {
          starsState.set({hasMessage: hasValue});
          updateEphemeralComposer();
        },
        stars: starsState.totalStars,
        draft,
        ref: (inputField) => {
          messageInputField = inputField;
        },
        btnConfirm,
        chatInput: chat.input
      });

      Portal({
        mount: containerEl,
        children
      });
    });
    updateEphemeralComposer();

    listenerSetter.add(scrollableEl)('scroll', onScroll);
    listenerSetter.add(scrollableEl)('scroll', followActiveActionsMenu);

    if(chat.input.editMessage) {
      willAttach.invertMedia = chat.input.editMessage.pFlags?.invert_media;
    }

    attachFiles();

    closeCallbacks.push(() => {
      files.length = 0;
      willAttach.sendFileDetails.length = 0;
      hideActiveActionsMenu();

      if(currentPopup === handle) {
        currentPopup = undefined;
      }
    });

    if(chat.type === ChatType.Scheduled && isEditing()) {
      attachContextMenuListener({
        element: btnConfirm,
        callback: async(e) => {
          cancelEvent(e);

          const element = await ButtonMenu({
            buttons: [{
              text: 'MessageScheduleEditTime',
              icon: 'schedule',
              onClick: () => {
                const editMessage = chat.input.editMessage;
                chat.input.scheduleSending(
                  () => send(true),
                  editMessage?.date ? makeDateFromTimestamp(editMessage.date) : undefined,
                  editMessage?.schedule_repeat_period
                );
              }
            }],
            listenerSetter: listenerSetter
          });
          element.classList.add('menu-send', 'top-left');

          containerEl.append(element);

          await fastRafPromise();
          contextMenuController.openBtnMenu(element, () => {
            setTimeout(() => {
              element.remove();
            }, 400);
          });
        },
        listenerSetter: listenerSetter
      });
    }

    if(chat.type !== ChatType.Scheduled && !isEditing()) {
      createRoot((dispose) => {
        chat.destroyMiddlewareHelper.onDestroy(dispose);
        const [effect, setEffect] = createSignal<DocId>(wasDraft?.effect);
        effectAccessor = effect;
        setEffectAccessor = setEffect;
        btnConfirm.append(SelectedEffect({effect: effectAccessor}) as HTMLElement);
      });

      const sendMenu = new SendContextMenu({
        onSilentClick: () => {
          chat.input.sendSilent = true;
          send();
        },
        onScheduleClick: () => {
          chat.input.scheduleSending(() => {
            send();
          });
        },
        onSendWhenOnlineClick: () => {
          chat.input.setScheduleTimestamp(SEND_WHEN_ONLINE_TIMESTAMP, () => {
            send();
          });
        },
        openSide: 'top-left',
        onContextElement: btnConfirm,
        middleware: context.middlewareHelper.get(),
        canSendWhenOnline: chat.input.canSendWhenOnline,
        onRef: (element) => {
          containerEl.append(element);
        },
        onOpen: () => !ephemeralComposer,
        withEffects: () => chat.peerId.isUser() && chat.peerId !== rootScope.myId,
        effect: effectAccessor,
        onEffect: setEffectAccessor
      });

      sendMenu?.setPeerParams({peerId: chat.peerId, isPaid: !!chat.starsAmount});
    }

    currentPopup = handle;
  }

  function canConvertGif(file: File) {
    return canConvertGifToVideoSync() &&
      file.size <= MAX_EDITABLE_VIDEO_SIZE &&
      !failedConversions.has(file);
  }

  function canConvertMov(file: File | MyDocument): file is File {
    // cross-realm-safe `instanceof File` (a Document PiP window's File isn't `instanceof` the main
    // File): a File is the only variant carrying `lastModified`; no MyDocument variant has it.
    return 'lastModified' in file &&
      isConvertibleMov(file) &&
      !failedConversions.has(file);
  }

  // * a convertible .mov counts as media right away — it becomes an mp4 video
  // * by send time, even in browsers that can't play video/quicktime natively
  function isMediaFile(file: File | MyDocument) {
    return MEDIA_MIME_TYPES_SUPPORTED.has(getFileMimeType(file)) || canConvertMov(file);
  }

  // * the server only allows photos and plain videos in paid media, so GIF files
  // * are sent converted to silent videos — an unconvertible GIF can't be paid.
  // * Same for .mov files in browsers that can't play them natively: unconverted
  // * they go out as documents
  function hasUnpayableMedia() {
    return !!gifDocument || files.some((file) => {
      const mimeType = getFileMimeType(file);
      if(mimeType === 'image/gif') {
        return !convertedFiles.has(file) && !canConvertGif(file);
      }

      if(getFileMimeType(file) === 'video/quicktime' && !IS_MOV_SUPPORTED) {
        return !convertedFiles.has(file) && !canConvertMov(file);
      }

      return false;
    });
  }

  function getEphemeralCommandResolution(caption?: string) {
    if(caption === undefined) {
      if(!messageInputField) {
        return {state: 'none'} as const;
      }

      caption = getRichValueWithCaret(messageInputField.input, true, false).value;
    }

    return chat.input.getEphemeralCommandResolution(caption || '');
  }

  function isEphemeralComposerMode(caption?: string) {
    return !!pinnedEphemeralSendingParams ||
      getEphemeralCommandResolution(caption).state !== 'none';
  }

  async function canSendPaidMedia() {
    if(ephemeralComposer || isEditing() || hasUnpayableMedia()) return false;
    return await context.managers.appPeersManager.isBroadcast(chat.peerId) &&
      !!(await context.managers.appProfileManager.getChannelFull(chat.peerId.toChatId())).pFlags.paid_media_allowed;
  }

  function willSendPaidMedia() {
    return willAttach.stars &&
      willAttach.type === 'media' &&
      !hasUnpayableMedia() &&
      willAttach.sendFileDetails.length <= 10;
  }

  function setPaidMedia(stars: number) {
    willAttach.stars = stars;
    changeSpoilers(!!stars);
    setUnlockPlaceholders();
  }

  function setUnlockPlaceholders() {
    const {stars} = willAttach;
    mediaContainer.querySelectorAll('.popup-item-album, .popup-item-media:not(.grouped-item)').forEach((element) => {
      const className = 'extended-media-buy';
      element.querySelector(`.${className}`)?.remove();

      if(!willSendPaidMedia()) {
        return;
      }

      const priceEl = document.createElement('span');
      priceEl.classList.add(className);
      priceEl.append(i18n('PaidMedia.Unlock', [paymentsWrapCurrencyAmount(stars, STARS_CURRENCY)]));
      element.append(priceEl);
    });
  }

  const onScroll = () => {
    const {input} = messageInputField;
    scrollableCtx.onSizeChange();
    // a caption that scrolls on its own draws the divider itself
    setCaptionScrolled(input.scrollTop > 0 && input.scrollHeight > 130);
  };

  // the open actions menu is absolutely positioned against the item it belongs
  // to, so it has to follow the item (or give up) while the media list scrolls
  const followActiveActionsMenu = (): void => {
    const actions = activeActionsMenu;
    if(!actions || !activeActionsMenuItemDiv) return;

    const bcr = activeActionsMenuItemDiv.getBoundingClientRect();
    if(!canShowActionsForBcr(bcr)) return void hideActiveActionsMenu();

    actions.style.left = bcr.left + bcr.width / 2 + 'px';
    actions.style.top = bcr.bottom + 'px';
  };

  async function applyMediaSpoiler(item: SendFileParams, noAnimation?: boolean) {
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
      animationGroup,
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

  function removeMediaSpoiler(item: SendFileParams) {
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

  function appendDrops(element: HTMLElement) {
    bodyEl.append(element);
  }

  function partition(mimeTypes = MEDIA_MIME_TYPES_SUPPORTED) {
    const media: SendFileParams[] = [], files: SendFileParams[] = [], audio: SendFileParams[] = [];
    willAttach.sendFileDetails.forEach((d) => {
      // * a convertible .mov counts as its converted form — an mp4 video
      if(mimeTypes.has(getFileMimeType(d.file)) || (mimeTypes.has('video/mp4') && canConvertMov(d.file))) {
        media.push(d);
      } else if(AUDIO_MIME_TYPES_SUPPORTED.has(getFileMimeType(d.file) as any)) {
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

  function mediaCount() {
    return partition().media.length;
  }

  function hasAnyMedia() {
    return mediaCount() > 0;
  }

  function messagesCount() {
    let count = 0;
    iterate(() => {
      ++count;
    });

    return count;
  }

  function canGroupSomething() {
    const {media, files, audio} = partition();
    return media.length > 1 || files.length > 1 || audio.length > 1;
  }

  function canToggleSpoilers(toggle: boolean, single: boolean) {
    if(willSendPaidMedia()) return false;

    let good = willAttach.type === 'media' && hasAnyMedia();
    if(single && good) {
      good = !!gifDocument || files.length === 1;
    }

    if(good) {
      const media = willAttach.sendFileDetails
      .filter((d) => isMediaFile(d.file))
      const mediaWithSpoilers = media.filter((d) => d.mediaSpoiler);

      good = single ? true : media.length > 1;

      if(good) {
        good = toggle ? media.length !== mediaWithSpoilers.length : media.length === mediaWithSpoilers.length;
      }
    }

    return good;
  }

  function changeType(type: WillAttachType) {
    if(type === 'document') {
      moveCaption(false);
    }

    willAttach.type = type;
    attachFiles();
  }

  function changeGroup(group: boolean) {
    willAttach.group = group;
    attachFiles();
    starsState.set({isGrouped: group});
  }

  function changeSpoilers(toggle: boolean) {
    partition().media.forEach((item) => {
      if(toggle && !item.mediaSpoiler) {
        applyMediaSpoiler(item);
      } else if(!toggle && item.mediaSpoiler) {
        removeMediaSpoiler(item);
      }
    });
  }

  function canMoveCaption() {
    return !messageInputField.isEmpty() && willAttach.type === 'media';
  }

  function moveCaption(above: boolean) {
    willAttach.invertMedia = above || undefined;
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const {input} = messageInputField;
    if(target !== input) {
      if(target.tagName === 'INPUT' || target.isContentEditable || isMediaEditorOpen) {
        return;
      }

      input.focus();
      placeCaretAtEnd(input);
    }
  };

  function prepareEditedFileForSending(params: SendFileParams): File | undefined {
    const editResult = params.editResult?.getResult();
    if(!editResult || editResult instanceof Promise) return undefined;

    return wrapMediaEditorBlobInFile(params.file as File, editResult.blob, params.editResult?.isVideo);
  }

  // * the send menu stamps the one-shot flags (schedule date / silent) onto the
  // * ChatInput and only then delegates here, and this path never goes through
  // * onMessageSent — so drop them once the attempt is over, sent or rejected,
  // * otherwise the next message inherits them
  async function send(force = false) {
    try {
      return await performSend(force);
    } finally {
      chat.input.resetSendingFlags();
    }
  }

  async function performSend(force = false) {
    if(fileConversions.size) { // * the file to send doesn't exist yet
      return;
    }

    let {value: caption, entities} = getRichValueWithCaret(messageInputField.input, true, false);
    if(caption.length > captionLengthMax) {
      toastNew({langPackKey: 'Error.PreviewSender.CaptionTooLong'});
      return;
    }

    const {input} = chat;
    const ephemeralCommandResolution = getEphemeralCommandResolution(caption);
    if(!pinnedEphemeralSendingParams && !input.verifyEphemeralCommand(caption)) {
      return;
    }

    const ephemeralReceiverId = pinnedEphemeralSendingParams?.ephemeralReceiverId ||
      (
        ephemeralCommandResolution.state === 'resolved' ?
          ephemeralCommandResolution.receiverId :
          undefined
      );
    const isEphemeral = !!pinnedEphemeralSendingParams ||
      ephemeralCommandResolution.state !== 'none';
    if(isEphemeral && !isEditing() && (chat.type === ChatType.Scheduled || input.scheduleDate)) {
      toastNew({langPackKey: 'Ephemeral.CantSchedule'});
      return;
    }

    if(isEphemeral && willAttach.sendFileDetails.length > 1) {
      files.splice(1);
      willAttach.sendFileDetails.splice(1);
      toastNew({langPackKey: 'Ephemeral.SingleAttachment'});
    }

    const isSlowModeActive = () => input.showSlowModeTooltipIfNeeded({
      sendingFew: messagesCount() > 1,
      container: btnConfirm.parentElement,
      element: btnConfirm
    });

    if(!isEditing() && !isEphemeral && await isSlowModeActive()) {
      return;
    }

    const canSend = await canSendNewMedia({
      ...chat.getMessageSendingParams(),
      onlyVisible: isEphemeral
    });
    willAttach.isMedia = willAttach.type === 'media' || undefined;
    const {sendFileDetails, isMedia} = willAttach;

    let foundBad = false;
    iterate((sendFileParams) => {
      if(foundBad) {
        return;
      }

      const isBad: (LangPackKey | boolean)[] = sendFileParams.map((params) => {
        const isVideoFile = () => VIDEO_MIME_TYPES_SUPPORTED.has(getFileMimeType(params.file) as any) || canConvertMov(params.file);
        const a: [Set<string> | (() => boolean), LangPackKey, ChatRights][] = [
          [AUDIO_MIME_TYPES_SUPPORTED, 'GlobalAttachAudioRestricted', 'send_audios'],
          [() => !isMediaFile(params.file), 'GlobalAttachDocumentsRestricted', 'send_docs']
        ];

        if(isMedia) {
          a.unshift(
            [IMAGE_MIME_TYPES_SUPPORTED, 'GlobalAttachPhotoRestricted', 'send_photos'],
            [() => isVideoFile() && params.isAnimated, 'GlobalAttachGifRestricted', 'send_gifs'],
            [isVideoFile, 'GlobalAttachVideoRestricted', 'send_videos']
          );
        }

        const found = a.find(([verify]) => {
          return typeof(verify) === 'function' ? verify() : verify.has(getFileMimeType(params.file));
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
          shake(bodyEl);
        }
      }

      foundBad ||= !!key;
    });

    if(foundBad) {
      return;
    }

    if(chat.type === ChatType.Scheduled && !isEditing() && !force) {
      chat.input.scheduleSending(() => {
        send(true);
      }, chat.input.editMessage?.date ? makeDateFromTimestamp(chat.input.editMessage.date) : undefined);

      return;
    }

    const {length} = sendFileDetails;
    const sendingParams = chat.getMessageSendingParams();
    if(isEphemeral) {
      Object.assign(sendingParams, pinnedEphemeralSendingParams);
      sendingParams.ephemeral = true;
      sendingParams.ephemeralReceiverId = ephemeralReceiverId;
    } else {
      sendingParams.ephemeral = undefined;
      sendingParams.ephemeralReceiverId = undefined;
    }

    const preparedPaymentResult = !isEphemeral && !input.editMsgId ?
      await input.paidMessageInterceptor.prepareStarsForPayment(starsState.totalMessages()) :
      undefined;
    if(preparedPaymentResult === PAYMENT_REJECTED) return;
    sendingParams.confirmedPaymentResult = preparedPaymentResult;

    let effect = effectAccessor?.();
    iterate((sendFileParams) => {
      if(caption && sendFileParams.length !== length) {
        context.managers.appMessagesManager.sendText({
          ...sendingParams,
          text: caption,
          entities,
          effect
          // clearDraft: true
        });

        caption = entities = effect = undefined;
      }

      const isPaidMedia = willSendPaidMedia();

      const d: SendFileDetails[] = sendFileParams.map((params) => {
        return {
          ...params,
          file: prepareEditedFileForSending(params) || convertedFiles.get(params.file as File)?.file || params.scaledBlob || params.file,
          width: params.editResult?.width || params.width,
          height: params.editResult?.height || params.height,
          spoiler: isPaidMedia ? undefined : !!params.mediaSpoiler,
          editResult: undefined as MediaEditorFinalResult
        };
      });

      const w = {
        ...willAttach,
        sendFileDetails: d
      };

      if(!isPaidMedia) {
        delete w.stars;
      }

      if(!chat.input.editMessage) {
        context.managers.appMessagesManager.sendGrouped({
          ...sendingParams,
          caption,
          entities,
          effect,
          isMedia,
          // clearDraft: true,
          ...w
        });
      } else {
        context.managers.appMessagesManager.editMessageMedia({
          message: chat.input.editMessage,
          text: caption,
          options: {
            entities,
            invertMedia: willAttach.invertMedia,
            scheduleDate: sendingParams.scheduleDate,
            isMedia
          },
          sendFileDetails: d[0]
        });

        chat.input.onMessageSent();
      }

      caption = entities = effect = undefined;
    });

    if(isEphemeral && !isEditing()) {
      input.onMessageSent(true, true, true);
    } else if(sendingParams.replyToMsgId || sendingParams.suggestedPost) {
      input.onHelperCancel();
    }
    // input.replyToMsgId = chat.threadId;
    // input.onMessageSent();
    wasDraft = undefined;

    context.hide();
  }

  async function scaleImageForTelegram(
    image: HTMLImageElement,
    mimeType: MTMimeType,
    fileSize: number,
    objectURLs: ObjectURLScope,
    convertIncompatible?: boolean
  ) {
    const PHOTO_SIDE_LIMIT = 2560;
    // PNG/BMP are lossless and can be huge even when ≤2560px (a detailed 2560px
    // screenshot/map is ~10MB), which the server rejects as a compressed photo with
    // PHOTO_SAVE_FILE_INVALID. Re-encode such HEAVY lossless images to JPEG — but
    // only when they're actually heavy, so a normal small PNG keeps its original
    // quality and isn't touched at all.
    const isHeavyLossless = (mimeType === 'image/png' || mimeType === 'image/bmp') && fileSize > PHOTO_HEAVY_BYTES;
    const needsResize = Math.max(image.naturalWidth, image.naturalHeight) > PHOTO_SIDE_LIMIT;
    let url = image.src, scaledBlob: Blob;
    if(
      mimeType !== 'image/gif' &&
      (needsResize || isHeavyLossless || (convertIncompatible && !SERVER_IMAGE_MIME_TYPES.has(mimeType)))
    ) {
      const encode = (quality?: number) => scaleMediaElement({
        media: image,
        // Cap each side at PHOTO_SIDE_LIMIT, but never upscale a smaller image
        // (aspectFitted would otherwise blow a small PNG up to 2560px).
        boxSize: makeMediaSize(
          Math.min(image.naturalWidth, PHOTO_SIDE_LIMIT),
          Math.min(image.naturalHeight, PHOTO_SIDE_LIMIT)
        ),
        mediaSize: makeMediaSize(image.naturalWidth, image.naturalHeight),
        // Whatever came in, what leaves is JPEG: it is the only encoding every
        // re-encode reason wants (a resized photo, a flattened heavy PNG, a
        // format the server has no use for) and the only one every browser can
        // produce — canvas encoding to e.g. image/heic yields nothing at all.
        mimeType: 'image/jpeg',
        quality
      });

      // Only drop quality when compressing a heavy image; a plain >2560 resize or
      // a format conversion keeps the default (near-lossless) quality.
      const initialQuality = isHeavyLossless ? PHOTO_COMPRESSED_QUALITY : undefined;
      let {blob} = await encode(initialQuality);
      if(initialQuality === undefined && blob.size > PHOTO_MAX_BYTES) {
        ({blob} = await encode(PHOTO_COMPRESSED_QUALITY));
      }

      scaledBlob = blob;
      objectURLs.release(url);
      url = objectURLs.create(blob);
      await renderImageFromUrlPromise(image, url);
    }

    return scaledBlob && {url, blob: scaledBlob};
  }

  // * the confirm button is locked while anything is still producing the file
  // * to send — gif/mov conversions and media-editor renders share it
  function updateConfirmLock() {
    const pendingEdit = willAttach.sendFileDetails.some((params) => params.editResult?.getResult() instanceof Promise);
    btnConfirm.disabled = isMediaEditorOpen ||
      pendingEdit ||
      fileConversions.size > 0;
  }

  function mountItemProgress(itemDiv: HTMLElement, creationProgress: Signal<number>, promise: Promise<any>) {
    const div = document.createElement('div');
    const dispose = render(() => RenderProgressCircle({creationProgress}), div);
    itemDiv.append(div);

    promise.finally(() => {
      div.remove();
      dispose();
    }).catch(noop);
  }

  function getMediaConversion(file: File) {
    let conversion = fileConversions.get(file);
    if(!conversion) {
      const progress = createSignal(0);
      const infoDeferred = deferredPromise<{width: number, height: number} | undefined>();
      const convertedPromise = getFileMimeType(file) === 'image/gif' ?
        openAnimationDeferred.then(() => gifToVideo(file, progress[1])) :
        movToVideo(file, progress[1], (info) => infoDeferred.resolve(info), openAnimationDeferred);
      const promise = convertedPromise.then((converted) => {
        convertedFiles.set(file, {
          file: wrapMediaEditorBlobInFile(file, converted.blob, true),
          width: converted.width,
          height: converted.height,
          duration: Math.ceil(converted.duration)
        });
      }, (err) => {
        console.error('media conversion error', err);
        failedConversions.add(file);

        if(!context.destroyed) {
          toastNew({langPackKey: 'Error.AnError'});
          if(willAttach.stars && hasUnpayableMedia()) {
            setPaidMedia(undefined);
          }
        }
      }).finally(() => {
        fileConversions.delete(file);
        infoDeferred.resolve(undefined); // unblock a placeholder awaiting the info of a failed conversion

        if(!context.destroyed) {
          updateConfirmLock();
          pause(0).then(() => attachFiles());
        }
      });

      fileConversions.set(file, conversion = {promise, progress, info: infoDeferred});
      updateConfirmLock();
    }

    return conversion;
  }

  async function convertGifMedia(params: SendFileParams) {
    const {itemDiv} = params;
    const file = params.file as File;

    const img = new Image();
    itemDiv.append(img);
    const url = params.objectURL = params.objectURLs.create(file);
    await renderImageFromUrlPromise(img, url);
    params.width = img.naturalWidth;
    params.height = img.naturalHeight;

    const conversion = getMediaConversion(file);
    mountItemProgress(itemDiv, conversion.progress, conversion.promise);
  }

  async function convertMovMedia(params: SendFileParams) {
    const {itemDiv} = params;
    const file = params.file as File;

    const conversion = getMediaConversion(file);

    // * purely cosmetic — the browser may not be able to play the original
    // * .mov, in which case the placeholder stays blank under the progress
    const video = createVideo({middleware: params.middlewareHelper.get()});
    video.src = params.objectURL = params.objectURLs.create(file);
    video.autoplay = true;
    video.controls = false;
    video.muted = true;
    video.addEventListener('timeupdate', () => {
      video.pause();
    }, {once: true});
    itemDiv.append(video);

    const info = await conversion.info;
    params.width = info?.width || 320;
    params.height = info?.height || 240;

    mountItemProgress(itemDiv, conversion.progress, conversion.promise);
  }

  async function attachMedia(params: SendFileParams) {
    const {itemDiv} = params;
    itemDiv.classList.add('popup-item-media');

    let file = params.file as File;

    // * GIFs are converted to silent videos right away, so they can be edited and
    // * priced (the server rejects animated documents in paid media). params.file
    // * KEEPS the original — files lookups rely on its identity; the converted
    // * file is rendered here and substituted at send time
    if(getFileMimeType(file) === 'image/gif' && file.size <= MAX_EDITABLE_VIDEO_SIZE && !failedConversions.has(file)) {
      const converted = convertedFiles.get(file);
      if(converted) {
        file = converted.file;
        params.width = converted.width;
        params.height = converted.height;
        params.duration = converted.duration;
        params.isAnimated = true;
      } else if(await canConvertGifToVideo()) {
        return convertGifMedia(params);
      }
    } else if(canConvertMov(file)) {
      // * .mov files get the same treatment: remuxed/transcoded to mp4 right away,
      // * so they go out as streamable videos every client can play
      const converted = convertedFiles.get(file);
      if(converted) {
        file = converted.file;
        params.width = converted.width;
        params.height = converted.height;
        params.duration = converted.duration;
      } else {
        return convertMovMedia(params);
      }
    }

    const isVideo = getFileMimeType(file).startsWith('video/');

    const editResult = params.editResult;

    let promise: Promise<void>;

    function addVideoTime() {
      if(params.isAnimated || !params.duration) return;
      const videoTime = document.createElement('span');
      videoTime.classList.add('video-time');
      videoTime.textContent = toHHMMSS(params.duration, false);
      itemDiv.append(videoTime);
    }

    function addGifLabel() {
      if(!params.isAnimated) return;
      const gifLabel = i18n('AttachGif');
      gifLabel.classList.add('video-time');
      itemDiv.append(gifLabel);
    }

    if(editResult) {
      const result = editResult.getResult();

      if(!(result instanceof Promise)) {
        if(editResult.isVideo) {
          await putEditedImage(editResult.preview);
          await putEditedVideo(result);
          addGifLabel();
          addVideoTime();
        } else {
          await putEditedImage(result.blob, true);
        }
      } else {
        await putEditedImage(editResult.preview);

        mountItemProgress(itemDiv, editResult.creationProgress, result);
        updateConfirmLock();

        result.then(() => {
          if(!context.destroyed) {
            pause(0).then(() => !context.destroyed && attachFiles());
          }
        }).catch(async() => {
          params.editResult = undefined;
          if(!context.destroyed) {
            pause(0).then(() => !context.destroyed && attachFiles());
          }

          hideActiveActionsMenu();
        }).finally(() => {
          updateConfirmLock();
          hideActiveActionsMenu();
        });
      }

      async function putEditedImage(blob: Blob, saveObjectURL = false) {
        const url = params.objectURLs.create(blob);
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
        const url = params.objectURLs.create(result.blob);
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
        params.isAnimated = canVideoBeAnimated({
          noSound: !result.hasSound,
          size: result.blob.size,
          isEditingMediaFromAlbum: isEditingMediaFromAlbum()
        });

        const thumb = result.thumb || await createPosterFromVideo(video);

        params.thumb = {
          url: params.objectURLs.create(thumb.blob),
          isCover: !params.isAnimated && !!result.thumb,
          ...thumb
        };
      }
    } else if(isVideo) {
      const video = createVideo({middleware: params.middlewareHelper.get()});
      video.src = params.objectURL = params.objectURLs.create(file);
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
      if(audioDecodedByteCount !== undefined && !params.isAnimated) {
        const noSound = !audioDecodedByteCount;
        params.isAnimated = canVideoBeAnimated({
          noSound,
          size: file.size,
          isEditingMediaFromAlbum: isEditingMediaFromAlbum()
        });
      }

      const thumb = await createPosterFromVideo(video);
      params.thumb = {
        url: params.objectURLs.create(thumb.blob),
        ...thumb
      };

      addGifLabel();
      addVideoTime();
    } else {
      const img = new Image();
      itemDiv.append(img);

      const url = params.objectURL = params.objectURLs.create(file);
      await renderImageFromUrlPromise(img, url);

      const mimeType = getFileMimeType(params.file) as MTMimeType;
      const scaled = await scaleImageForTelegram(img, mimeType, file.size, params.objectURLs, true);
      if(scaled) {
        params.objectURL = scaled.url;
        params.scaledBlob = scaled.blob;
      }

      params.width = img.naturalWidth;
      params.height = img.naturalHeight;

      if(getFileMimeType(file) === 'image/gif') {
        params.isAnimated = true;

        promise = Promise.all([
          getGifDuration(img).then((duration) => {
            params.duration = Math.ceil(duration);
          }),

          createPosterFromMedia(img).then((thumb) => {
            params.thumb = {
              url: params.objectURLs.create(thumb.blob),
              ...thumb
            };
          })
        ]).then(() => {});
      }
    }
    {
      const showActions = async() => {
        if(activeActionsMenuItemDiv === itemDiv || !canShowActions || context.destroyed) return;
        const bcr = itemDiv.getBoundingClientRect();
        if(!canShowActionsForBcr(bcr)) return;

        hideActiveActionsMenu();

        activeActionsMenuItemDiv = itemDiv;

        const actions = document.createElement('div');
        activeActionsMenu = actions;
        actions.classList.add('popup-item-media-action-menu');
        const itemCls = 'popup-item-media-action';

        const canEditVideo = await supportsVideoEncoding() && file.size <= MAX_EDITABLE_VIDEO_SIZE;

        let equalizeIcon: HTMLSpanElement;
        if(!willAttach.stars && getFileMimeType(file) !== 'image/gif' && (!isVideo || canEditVideo)) {
          import('../mediaEditor'); // prefetch

          equalizeIcon = Icon('equalizer', itemCls);
          equalizeIcon.addEventListener('click', async() => {
            hideActiveActionsMenu();
            MarkupTooltip.getInstance().hide();

            btnConfirm.disabled = true;
            const source = itemDiv.querySelector('video') || itemDiv.querySelector('img');
            if(!source) return;

            const {openMediaEditorFromMedia} = await import('../mediaEditor');

            isMediaEditorOpen = true;
            const mediaSrc = params.objectURLs.create(file);

            openMediaEditorFromMedia({
              source,
              rect: itemDiv.getBoundingClientRect(),
              animatedCanvasSize: [params.width, params.height],
              mediaType: isVideo ? 'video' : 'image',
              mediaSrc,
              getMediaBlob: async() => file,
              managers: context.managers,
              // Compressed-photo output: JPEG, and only drop quality for a heavy
              // source (same policy/threshold as the direct send) — a small edit
              // stays near-lossless. (Ignored for the video path.)
              imageType: 'image/jpeg',
              imageQuality: file.size > PHOTO_HEAVY_BYTES ? PHOTO_COMPRESSED_QUALITY : undefined,
              onEditFinish: (result) => {
                params.editResult = result;
                attachFiles();
              },
              editingMediaState: params.editResult?.editingMediaState,
              onClose: (hasGif) => {
                params.objectURLs.release(mediaSrc);
                isMediaEditorOpen = false;
                if(!hasGif) updateConfirmLock();
              },
              canImageResultInGIF: !isEditingMediaFromAlbum() && canEditVideo
            });
          });
        }

        let spoilerToggle: HTMLSpanElement;
        if(!willAttach.stars) {
          spoilerToggle = document.createElement('span');
          spoilerToggle.classList.add(itemCls, 'spoiler-toggle');
          if(params.mediaSpoiler) spoilerToggle.dataset.toggled = 'true';
          spoilerToggle.append(Icon('mediaspoiler', 'spoiler-on'), Icon('mediaspoileroff', 'spoiler-off'));
          spoilerToggle.addEventListener('click', () => {
            if(spoilerToggle.dataset.disabled) return; // Prevent double clicks
            spoilerToggle.dataset.toggled = spoilerToggle.dataset.toggled === 'true' ? 'false' : 'true'
            !params.mediaSpoiler ? applyMediaSpoiler(params) : removeMediaSpoiler(params);
          });
        }

        const deleteIcon = Icon('delete', itemCls);
        deleteIcon.addEventListener('click', () => removeFile(params));

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

        getOverlayRoot().append(actions);
        await doubleRaf();
        actions.style.opacity = '1';

        const listener = (e: MouseEvent) => {
          if(
            (e.target as HTMLElement)?.closest?.('.popup-item-media-action-menu') ||
            e.target === itemDiv ||
            itemDiv.contains(e.target as Node)
          ) return;
          hideActiveActionsMenu();
        }
        actionsMenuListenerSetter.add(document)('pointermove', listener);
        actionsMenuListenerSetter.add(document)('keydown', () => {
          hideActiveActionsMenu();
        }, {capture: true});
        if(IS_MOBILE) {
          actionsMenuListenerSetter.add(document)('pointerdown', listener);
        }
      }

      itemDiv.addEventListener('pointermove', showActions);
      itemDiv.addEventListener('pointerup', showActions);
    }

    return promise;
  }

  function removeFile(params: SendFileParams) {
    const idx = files.findIndex((file) => file === params.file);
    if(idx < 0) return;
    hideActiveActionsMenu();
    files.splice(idx, 1);
    files.length ? attachFiles() : context.destroy();
  }

  async function hideActiveActionsMenu() {
    actionsMenuListenerSetter.removeAll();

    const el = activeActionsMenu;
    activeActionsMenu = activeActionsMenuItemDiv = undefined;

    if(!el) return;
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    await delay(200);
    el?.remove();
  }

  function wrapMediaEditorBlobInFile(originalFile: File, editedBlob: Blob, isVideo: boolean) {
    if(cachedMediaEditorFiles.has(editedBlob)) return cachedMediaEditorFiles.get(editedBlob);

    let name = originalFile.name;

    const imageTypeToExtMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    };

    if(isVideo) name = name.replace(/\.[^.]+$/, '.mp4');
    else if(editedBlob.type in imageTypeToExtMap) {
      const ext = '.' + imageTypeToExtMap[editedBlob.type];
      name = name.replace(/\.[^.]+$/, ext);
      if(!name.endsWith(ext)) name = name.replace(/\.+$/, '') + ext;
    }

    const result = new File([editedBlob], name, {type: editedBlob.type});
    cachedMediaEditorFiles.set(editedBlob, result);

    return result;
  }


  async function attachDocument(params: SendFileParams): ReturnType<typeof attachMedia> {
    const {itemDiv} = params;
    itemDiv.classList.add('popup-item-document');

    const editResult = await params.editResult?.getResult();
    const file = editResult ?
      wrapMediaEditorBlobInFile(params.file as File, editResult.blob, params.editResult?.isVideo) :
      params.file as File;

    const isPhoto = getFileMimeType(file).startsWith('image/');
    const isAudio = AUDIO_MIME_TYPES_SUPPORTED.has(getFileMimeType(file) as any);
    if(isPhoto || isAudio || file.size < 20e6) {
      params.objectURL ||= params.objectURLs.create(file);
    }

    const attributes: DocumentAttribute[] = [];

    let img: HTMLImageElement;
    if(isPhoto && params.objectURL) {
      img = new Image();
      await renderImageFromUrlPromise(img, params.objectURL);
      const scaled = await scaleImageForTelegram(img, file.type as MTMimeType, file.size, params.objectURLs);
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
      middleware: params.middlewareHelper.get(),
      clickable: true,
      cacheContext
    });

    if(isPhoto) {
      params.width = img.naturalWidth;
      params.height = img.naturalHeight;
    }

    itemDiv.append(docDiv);

    createRoot((dispose) => {
      params.middlewareHelper.get().onDestroy(dispose);
      Button.Icon({
        icon: 'delete',
        class: 'popup-item-document-delete',
        noRipple: true,
        onClick: (e) => {
          e.stopPropagation();
          removeFile(params);
        },
        ref: (ref) => itemDiv.append(ref)
      });
    });
  }

  const attachFile = (file: File | MyDocument, oldParams?: Partial<SendFileParams>) => {
    const shouldCompressFile = shouldCompress(file);

    const itemDiv = document.createElement('div');
    itemDiv.classList.add('popup-item');

    const params: SendFileParams = {
      file,
      ...(oldParams || {})
    } as any;

    // do not pass these properties to worker
    defineNotNumerableProperties(params, ['scaledBlob', 'middlewareHelper', 'objectURLs', 'itemDiv', 'mediaSpoiler']);

    params.middlewareHelper = context.middlewareHelper.get().create();
    params.objectURLs = new ObjectURLScope();
    params.itemDiv = itemDiv;

    const middleware = params.middlewareHelper.get();
    middleware.onDestroy(() => params.objectURLs.dispose());

    const promise = gifDocument ?
      attachGifDocument(params) :
      (shouldCompressFile ? attachMedia(params) : attachDocument(params));
    willAttach.sendFileDetails.push(params);
    return promise.catch((err) => {
      itemDiv.style.backgroundColor = '#000';
      console.error('error rendering file', err);
    }).finally(() => {
      if(!middleware()) {
        params.objectURLs.dispose();
      }
    });
  };

  async function attachGifDocument(params: SendFileParams) {
    const itemDiv = params.itemDiv;
    itemDiv.classList.add('popup-item-media');

    const doc = params.file as MyDocument;
    params.width = doc.w;
    params.height = doc.h;
    params.duration = doc.duration;
    params.isAnimated = true;

    const size = calcImageInBox(doc.w, doc.h, MAX_WIDTH, 320);
    itemDiv.style.width = size.width + 'px';
    itemDiv.style.height = size.height + 'px';

    const loadPromises: Promise<any>[] = [];
    await wrapVideo({
      doc,
      container: itemDiv as HTMLDivElement,
      boxWidth: size.width,
      boxHeight: size.height,
      lazyLoadQueue: null,
      noInfo: true,
      group: animationGroup,
      middleware: params.middlewareHelper.get(),
      withoutPreloader: true,
      loadPromises
    });

    await Promise.all(loadPromises);

    const gifLabel = i18n('AttachGif');
    gifLabel.classList.add('video-time');
    itemDiv.append(gifLabel);

    return params;
  }

  function shouldCompress(file: File | MyDocument) {
    return willAttach.type === 'media' && isMediaFile(file);
  }

  function onRender() {
    if(rendered) { // only the first render opens the popup
      return;
    }

    rendered = true;

    listenerSetter.add(getOverlayRoot())('keydown', onKeyDown);
    animationIntersector.setOnlyOnePlayableGroup(animationGroup);
    closeCallbacks.push(() => {
      animationIntersector.setOnlyOnePlayableGroup();

      if(!ignoreInputValue && wasDraft) {
        chat.input.setDraft(wasDraft, false, true);
      }
    });
    setShow(true);

    const resolveOpenAnimation = () => openAnimationDeferred.resolve();
    listenerSetter.add(context.element)('transitionend', resolveOpenAnimation, {once: true});
    pause(400).then(resolveOpenAnimation); // reduced motion has no transition to end
  }

  function appendMediaToContainer(params: SendFileParams) {
    if(shouldCompress(params.file)) {
      currentFileSection = undefined;

      const size = calcImageInBox(params.width, params.height, MAX_WIDTH, 320);
      params.itemDiv.style.width = size.width + 'px';
      params.itemDiv.style.height = size.height + 'px';

      mediaContainer.append(params.itemDiv);
      return;
    }

    if(!currentFileSection) {
      const items = document.createElement('div');
      createRoot((dispose) => {
        Section({
          class: 'popup-send-photo-documents',
          ref: (ref: HTMLDivElement) => {
            currentFileSection = ref;
          },
          children: [items]
        });

        context.middlewareHelper.onDestroy(dispose);
      });
      mediaContainer.append(currentFileSection);
      currentFileSection = items;
    }

    currentFileSection.append(params.itemDiv);
  }

  function hasGif() {
    const {sendFileDetails} = willAttach;

    return sendFileDetails.some((params) => params.isAnimated);
  }

  function canCheckIfHasGif() {
    const {sendFileDetails} = willAttach;

    return sendFileDetails.every((params) => !(params?.editResult?.getResult() instanceof Promise));
  }

  function iterate(cb: (sendFileDetails: SendFileParams[]) => void) {
    const {sendFileDetails} = willAttach;

    // * paid GIFs go out as plain videos, so they don't break the single paid album
    if(!willAttach.group || (hasGif() && !willSendPaidMedia())) {
      sendFileDetails.forEach((p) => cb([p]));
      return;
    }

    const length = sendFileDetails.length;
    for(let i = 0; i < length;) {
      const firstFile = sendFileDetails[i].file;
      let k = 0, isAudio: boolean;
      for(; k < 10 && i < length; ++i, ++k) {
        const file = sendFileDetails[i].file;
        const _isAudio = AUDIO_MIME_TYPES_SUPPORTED.has(getFileMimeType(file) as any);
        isAudio ??= _isAudio;
        if(_isAudio !== isAudio || shouldCompress(firstFile) !== shouldCompress(file)) {
          break;
        }
      }

      cb(sendFileDetails.slice(i - k, i));
    }
  }

  function isSuggestingPost() {
    return !!chat?.input?.suggestedPost;
  }

  function isEditing() {
    return !!chat?.input?.editMessage;
  }

  function isEditingMediaFromAlbum() {
    return !!chat?.input?.editMessage?.grouped_id;
  }

  function canHaveMultipleFiles() {
    return !ephemeralComposer &&
      !isEditing() &&
      !isSuggestingPost() &&
      !gifDocument;
  }

  function canShowActionsForBcr(bcr: DOMRect) {
    const scrollableBcr = scrollableEl.getBoundingClientRect();
    const approximateCenterY = bcr.bottom - 20;

    return approximateCenterY >= scrollableBcr.top && approximateCenterY <= scrollableBcr.bottom;
  }

  function afterRender() {
    setTimeout(() => {
      canShowActions = true;
    }, 200);

    willAttach.sendFileDetails.forEach((params) => {
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

  function updateEphemeralComposer() {
    const nextEphemeralComposer = isEphemeralComposerMode();
    const changed = nextEphemeralComposer !== ephemeralComposer;
    ephemeralComposer = nextEphemeralComposer;
    setIsEphemeralComposer(nextEphemeralComposer);
    if(!changed || !nextEphemeralComposer) {
      return;
    }

    if(files.length > 1) {
      files.splice(1);
      toastNew({langPackKey: 'Ephemeral.SingleAttachment'});
      if(willAttach.sendFileDetails.length) {
        attachFiles();
      }
    }

    if(willAttach.stars) {
      setPaidMedia(undefined);
    }
  }

  function addFiles(newFiles: File[]) {
    newFiles = newFiles.map(normalizeFileMimeType);

    if(!canHaveMultipleFiles() && files.length) {
      if(newFiles.length) {
        files.splice(0, Infinity, newFiles[0]);
        attachFiles();
      }
      return;
    }

    if(!canHaveMultipleFiles()) newFiles.splice(1);

    const toPush = newFiles.filter((file) => {
      const found = files.find((_file) => {
        return _file.lastModified === file.lastModified && _file.name === file.name && _file.size === file.size;
      });

      return !found;
    });

    if(toPush.length) {
      files.push(...toPush);

      if(willAttach.stars) {
        if(hasUnpayableMedia()) {
          // * an unpayable GIF/mov was added — drop the price visibly instead of
          // * silently posting the priced media for free at send time
          setPaidMedia(undefined);
        } else if(files.length > 10) {
          changeSpoilers(false);
        }
      }

      attachFiles();
    }
  }

  function setStarsAmount(starsAmount: number) {
    starsState.set({starsAmount});
  }

  /** What the attachment is, and how many of it — the two things a title has to say. */
  function getTitleSubject(): [MediaTitleKind, number] {
    if(gifDocument) {
      return ['gif', 1];
    }

    if(willAttach.type === 'document') {
      return ['file', files.length];
    }

    let foundPhotos = 0, foundVideos = 0, foundFiles = 0;
    files.forEach((file) => {
      const mimeType = getFileMimeType(file);
      if(mimeType === 'image/gif') ++foundVideos; // gifs are sent converted to videos
      else if(mimeType.startsWith('image/')) ++foundPhotos;
      else if(mimeType.startsWith('video/')) ++foundVideos;
      else ++foundFiles;
    });

    if([foundPhotos, foundVideos, foundFiles].filter((n) => n > 0).length > 1) {
      return ['file', files.length];
    }

    if(foundPhotos) return ['photo', foundPhotos];
    if(foundVideos) return ['video', foundVideos];
    return ['file', foundFiles];
  }

  function setTitle() {
    const [kind, count] = getTitleSubject();

    if(isEditing()) {
      // nothing is being sent here — the one attachment takes the place of the
      // message's current media, so the title names that instead of a count
      setTitleContent(i18n(REPLACE_TITLE_KEYS[kind]));
      return;
    }

    setTitleContent(i18n(SEND_TITLE_KEYS[kind], [count]));
  }

  function attachFiles() {
    // addFiles() already trims later additions; the files the popup OPENED with
    // bypass it, and a drop of several while editing would otherwise render a
    // grid whose title counts one and whose send edits the message once per file
    if(!canHaveMultipleFiles() && files.length > 1) {
      files.splice(1);
    }

    const oldSendFileDetails = willAttach.sendFileDetails.splice(0, willAttach.sendFileDetails.length);

    const getPendingEditResult = (file: File) => {
      const pendingEditResult = pendingEditResults.get(file);
      pendingEditResults.delete(file);
      return pendingEditResult;
    };

    const promises = gifDocument ? [attachFile(gifDocument)] : files.map((file) => {
      const oldParams = oldSendFileDetails.find((o) => o.file === file);
      const editResult = oldParams?.editResult || getPendingEditResult(file);

      return attachFile(
        file,
        editResult ? {
          editResult
        } : undefined
      );
    });

    canShowActions = false;

    Promise.all(promises).then(() => {
      mediaContainer.replaceChildren();
      // * destroy the old items only AFTER they've left the DOM — destroying at
      // * the start of the re-render blanks the still-visible media out for the
      // * whole rebuild (createVideo clears src on middleware destroy)
      oldSendFileDetails.forEach((params) => {
        params.middlewareHelper.destroy();
      });
      currentFileSection = undefined;
      const filesLength = gifDocument ? 1 : files.length;
      starsState.set({attachedFiles: filesLength, isGrouped: willAttach?.group && !hasGif()});

      if(!filesLength) {
        return;
      }

      setTitle();

      iterate((sendFileDetails) => {
        const shouldCompressItems = shouldCompress(sendFileDetails[0].file);
        if(shouldCompressItems && sendFileDetails.length > 1) {
          currentFileSection = undefined;
          const albumContainer = document.createElement('div');
          albumContainer.classList.add('popup-item-album', 'popup-item');
          albumContainer.append(...sendFileDetails.map((s) => s.itemDiv));

          prepareAlbum({
            container: albumContainer,
            items: sendFileDetails.map((o) => ({w: o.width, h: o.height})),
            maxWidth: MAX_WIDTH,
            minWidth: 100,
            spacing: 2
          });

          mediaContainer.append(albumContainer);
        } else {
          sendFileDetails.forEach((params) => {
            appendMediaToContainer(params);
          });
        }

        if(!shouldCompressItems) {
          return;
        }

        sendFileDetails.forEach((params) => {
          const oldParams = oldSendFileDetails.find((o) => o.file === params.file);
          if(oldParams?.mediaSpoiler || willSendPaidMedia()) {
            applyMediaSpoiler(params, true);
          }
        });
      });

      const topLevelItems = mediaContainer.children;
      for(let i = 1; i < topLevelItems.length; ++i) {
        const prev = topLevelItems[i - 1];
        const curr = topLevelItems[i];
        if(prev.classList.contains('popup-item') && curr.classList.contains('popup-item')) {
          curr.classList.add('popup-item-stacked');
        }
      }

      setUnlockPlaceholders();
    }).then(() => {
      onRender();
      onScroll();
      doubleRaf().then(() => afterRender());
    });
  }

  const handle: NewMediaPopupHandle = {
    addFiles,
    setStarsAmount,
    appendDrops,
    hide: () => {
      setShow(false);
    }
  };

  function Inner() {
    context = useContext(PopupContext);
    starsState = createStarsState();

    onCleanup(() => {
      listenerSetter.removeAll();
      actionsMenuListenerSetter.removeAll();
    });

    onMount(() => {
      construct();
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title>{titleContent()}</PopupElement.Title>
          {menuEl()}
        </PopupElement.Header>
        <PopupElement.Body ref={(element) => bodyEl = element}>
          <PopupElement.Scrollable
            ref={(element) => scrollableEl = element}
            contextRef={(ctx) => scrollableCtx = ctx}
            trackEnds
            class="scrollable-y-bordered"
            classList={{
              'scrolled-start': scrollableCtx?.isScrolledToStart,
              'scrolled-end': scrollableCtx?.isScrolledToEnd && !captionScrolled()
            }}
          >
            {mediaContainer}
          </PopupElement.Scrollable>
        </PopupElement.Body>
      </>
    );
  }

  createPopup(() => (
    <PopupElement
      class={classNames('popup-send-photo', 'popup-new-media', isEphemeralComposer() && 'is-ephemeral-composer')}
      closable
      confirmShortcutIsSendShortcut
      animationGroup={animationGroup}
      btnConfirmOnEnter={() => btnConfirm}
      show={show()}
      containerProps={{ref: (element) => containerEl = element}}
      onClose={() => {
        closeCallbacks.splice(0).forEach((callback) => callback());
        hideActiveActionsMenu();
      }}
    >
      <Inner />
    </PopupElement>
  ));

  return handle;
}

(window as any).showNewMediaPopup = showNewMediaPopup;
