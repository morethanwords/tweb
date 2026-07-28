import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyPhoto} from '@appManagers/appPhotosManager';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import IMAGE_MIME_TYPES_SUPPORTED from '@environment/imageMimeTypesSupport';
import {getAppWindow} from '@helpers/appWindow';
import canvasToBlob from '@helpers/canvas/canvasToBlob';
import {canWriteClipboardItem, writeClipboardItem} from '@helpers/clipboard';
import appDownloadManager from '@lib/appDownloadManager';

const CLIPBOARD_MIME_TYPE = 'image/png';

type CopyableMedia = MyPhoto | MyDocument;

export function canCopyMediaToClipboard(media: CopyableMedia) {
  if(!media || (
    media._ !== 'photo' &&
    (media._ !== 'document' || !IMAGE_MIME_TYPES_SUPPORTED.has(media.mime_type))
  )) {
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

async function convertToPng(blob: Blob) {
  if(blob.type === CLIPBOARD_MIME_TYPE) {
    return blob;
  }

  const appWindow = getAppWindow();
  const canvas = appWindow.document.createElement('canvas');
  const context = canvas.getContext('2d');
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

  canvas.width = width;
  canvas.height = height;

  try {
    context.drawImage(source, 0, 0);
    return await canvasToBlob(canvas, CLIPBOARD_MIME_TYPE);
  } finally {
    cleanup();
  }
}

export default function copyMediaToClipboard(media: CopyableMedia) {
  if(!canCopyMediaToClipboard(media)) {
    return Promise.reject(new Error('Media clipboard writing is not supported'));
  }

  const blobPromise = Promise.resolve()
  .then(() => downloadFullSizeMedia(media))
  .then(convertToPng);

  try {
    // The write itself must stay in the user-activation tick. ClipboardItem
    // accepts the pending full-size download and resolves it before committing.
    return writeClipboardItem({
      [CLIPBOARD_MIME_TYPE]: blobPromise
    });
  } catch(error) {
    void blobPromise.catch((): void => {});
    return Promise.reject(error);
  }
}
