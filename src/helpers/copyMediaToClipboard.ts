import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyPhoto} from '@appManagers/appPhotosManager';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import IMAGE_MIME_TYPES_SUPPORTED from '@environment/imageMimeTypesSupport';
import {getAppWindow} from '@helpers/appWindow';
import canvasToBlob from '@helpers/canvas/canvasToBlob';
import {canWriteClipboardItem, writeClipboardItem} from '@helpers/clipboard';
import appDownloadManager from '@lib/appDownloadManager';

const CLIPBOARD_MIME_TYPE = 'image/png';

export type CopyableMedia = MyPhoto | MyDocument;

export function canCopyMediaToClipboard(media: CopyableMedia) {
  if(!media || (
    media._ !== 'photo' &&
    (media._ !== 'document' || !IMAGE_MIME_TYPES_SUPPORTED.has(media.mime_type))
  )) {
    return false;
  }

  return canWriteClipboardItem(CLIPBOARD_MIME_TYPE);
}

/**
 * A video is copied as the frame it shows ("Copy Frame"), from its `<video>` (`copyVideoFrameToClipboard`);
 * an image the clipboard takes whole is not a video here, whatever its type says
 */
export function canCopyVideoFrameToClipboard(media: CopyableMedia) {
  if(
    media?._ !== 'document' ||
    IMAGE_MIME_TYPES_SUPPORTED.has(media.mime_type) ||
    (media.type !== 'video' && media.type !== 'gif' && !media.mime_type?.startsWith('video/'))
  ) {
    return false;
  }

  return canWriteClipboardItem(CLIPBOARD_MIME_TYPE);
}

function downloadFullSizeMedia(media: CopyableMedia) {
  return appDownloadManager.downloadMedia({
    media,
    thumb: media._ === 'photo' ? choosePhotoSize(media, Infinity, Infinity) : undefined
  });
}

function drawToCanvas(source: CanvasImageSource, width: number, height: number) {
  const canvas = getAppWindow().document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  return canvas;
}

async function convertToPng(blob: Blob) {
  if(blob.type === CLIPBOARD_MIME_TYPE) {
    return blob;
  }

  const appWindow = getAppWindow();
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let cleanup: () => void;

  if(appWindow.createImageBitmap) {
    const bitmap = await appWindow.createImageBitmap(blob);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    cleanup = () => bitmap.close();
  } else {
    const image = appWindow.document.createElement('img');
    const URLConstructor = (appWindow as any).URL as typeof URL;
    const url = URLConstructor.createObjectURL(blob);
    image.src = url;
    try {
      await image.decode();
    } catch(error) {
      URLConstructor.revokeObjectURL(url);
      throw error;
    }

    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
    cleanup = () => URLConstructor.revokeObjectURL(url);
  }

  let canvas: HTMLCanvasElement;
  try {
    canvas = drawToCanvas(source, width, height);
  } finally {
    cleanup();
  }

  return canvasToBlob(canvas, CLIPBOARD_MIME_TYPE);
}

function writePngToClipboard(blobPromise: Promise<Blob>) {
  try {
    // The write itself must stay in the user-activation tick. ClipboardItem
    // accepts the pending image and resolves it before committing.
    return writeClipboardItem({
      [CLIPBOARD_MIME_TYPE]: blobPromise
    });
  } catch(error) {
    void blobPromise.catch((): void => {});
    return Promise.reject(error);
  }
}

export default function copyMediaToClipboard(media: CopyableMedia) {
  if(!canCopyMediaToClipboard(media)) {
    return Promise.reject(new Error('Media clipboard writing is not supported'));
  }

  return writePngToClipboard(
    Promise.resolve()
    .then(() => downloadFullSizeMedia(media))
    .then(convertToPng)
  );
}

/** The frame `video` shows at the click, as tdesktop's "Copy Frame" */
export function copyVideoFrameToClipboard(video: HTMLVideoElement) {
  if(!video || video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) {
    return Promise.reject(new Error('No video frame to copy'));
  }

  let blobPromise: Promise<Blob>;
  try {
    // * drawn now: the video plays on while the image is encoded
    blobPromise = canvasToBlob(drawToCanvas(video, video.videoWidth, video.videoHeight), CLIPBOARD_MIME_TYPE);
  } catch(error) {
    return Promise.reject(error);
  }

  return writePngToClipboard(blobPromise);
}
