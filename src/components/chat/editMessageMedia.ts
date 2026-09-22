/*
 * The pieces every "edit the media of an existing message" entry point needs:
 * what the media editor has to be handed for a given message, and — derived
 * from that — whether the entry point may be offered at all.
 *
 * Lives outside input.ts because the chat input is no longer the only way in:
 * the bubble context menu and the media viewer offer the same action.
 */

import type {MediaEditorProps} from '@components/mediaEditor/mediaEditor';
import type {LangPackKey} from '@lib/langPack';
import {MAX_EDITABLE_VIDEO_SIZE} from '@components/mediaEditor/support';
import {getMediaTypeForMessage} from '@components/chat/utils';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import deferredPromise from '@helpers/cancellablePromise';
import {getFileNameByLocation} from '@helpers/fileName';
import {Middleware} from '@helpers/middleware';
import onMediaLoad from '@helpers/onMediaLoad';
import {NumberPair} from '@components/mediaEditor/types';
import type {DownloadMediaOptions} from '@appManagers/apiFileManager';
import getDocumentDownloadOptions from '@appManagers/utils/docs/getDocumentDownloadOptions';
import getPhotoDownloadOptions from '@appManagers/utils/photos/getPhotoDownloadOptions';
import {Document, Message, MessageMedia, Photo, PhotoSize} from '@layer';

export type OpenMediaPayload = {
  fileName: string;
  mediaType: MediaEditorProps['mediaType']
  createCanvasSource: (url: string, middleware: Middleware) => Promise<HTMLImageElement | HTMLVideoElement>;
  /** what to hand appDownloadManager — the downloader itself stays out of this module */
  downloadOptions: DownloadMediaOptions;
};

export function getOpenMediaPayload(media: MessageMedia | null | undefined) {
  if(!media) return;
  if(media._ === 'messageMediaPhoto' && media.photo?._ === 'photo') return getOpenMediaPhotoPayload(media.photo);
  if(media._ === 'messageMediaDocument' && media.document?._ === 'document') return getOpenMediaVideoPayload(media.document);
}

export function canEditMediaWithEditor(media: MessageMedia) {
  return !!getOpenMediaPayload(media);
}

/**
 * Whether this message's own media can be reopened in the media editor and sent
 * back as a replacement. Photos and playable videos/gifs only — a file, a voice
 * note or an oversized video has nothing for the editor to work with.
 *
 * Says nothing about the right to edit the message itself: callers still have to
 * pass `appMessagesManager.canEditMessage`.
 */
export function canEditMessageMediaWithEditor(message: Message.message | null | undefined) {
  return getMediaTypeForMessage(message) === 'media' && canEditMediaWithEditor(message.media);
}

/** How every entry point into that flow labels itself. */
export function getEditMediaLangKey(message: Message.message | null | undefined): LangPackKey {
  return message?.media?._ === 'messageMediaPhoto' ? 'EditThisPhoto' : 'EditThisVideo';
}

function getOpenMediaPhotoPayload(photo: Photo.photo): OpenMediaPayload {
  const photoSizes = photo.sizes.slice().filter((size) => (size as PhotoSize.photoSize).w) as PhotoSize.photoSize[];
  photoSizes.sort((a, b) => b.size - a.size);
  const fullPhotoSize = photoSizes?.[0];

  if(!fullPhotoSize?.w || !fullPhotoSize?.h) return;

  return {
    fileName: tryGetFileName(() => getFileNameByLocation(getPhotoDownloadOptions(photo, fullPhotoSize).location)),
    mediaType: 'image',
    createCanvasSource: createImageSource,
    downloadOptions: {
      media: photo,
      thumb: fullPhotoSize
    }
  };
}

function getOpenMediaVideoPayload(document: Document.document): OpenMediaPayload {
  if(!document.size || document.size > MAX_EDITABLE_VIDEO_SIZE) return;

  return {
    fileName: tryGetFileName(() => document.file_name || getFileNameByLocation(getDocumentDownloadOptions(document).location)),
    mediaType: 'video',
    createCanvasSource: createVideoSource,
    downloadOptions: {
      media: document,
      thumb: undefined
    }
  };
}

async function createImageSource(url: string) {
  const img = new Image();
  await renderImageFromUrlPromise(img, url);
  return img;
}

async function createVideoSource(url: string, middleware: Middleware) {
  // loaded here and not at the top so that merely ASKING whether a message can be
  // edited does not drag the video/streaming stack into the caller's bundle
  const {default: createVideo} = await import('@helpers/dom/createVideo');
  const video = createVideo({middleware});

  video.playsInline = true;
  video.src = url;
  video.controls = false;
  video.muted = true;
  video.preload = 'auto';

  const deferred = deferredPromise<void>();
  video.requestVideoFrameCallback(() => {
    deferred.resolve();
  });

  await onMediaLoad(video);

  await deferred;

  return video;
}

export function getSourceSize(source: HTMLVideoElement | HTMLImageElement): NumberPair {
  return source instanceof HTMLVideoElement ? [source.videoWidth, source.videoHeight] : [source.naturalWidth, source.naturalHeight];
}

function tryGetFileName(fn: () => string) {
  const defaultFileName = 'edited-media';
  try {
    return fn() || defaultFileName;
  } catch{
    return 'edited-media';
  }
}
