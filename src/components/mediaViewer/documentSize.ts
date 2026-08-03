import type {MyDocument} from '@appManagers/appDocsManager';
import {makeMediaSize, MediaSize} from '@helpers/mediaSize';

const MAX_THUMBNAIL_RATIO_DIFFERENCE = 0.1;

export default function getMediaViewerDocumentSize(document: MyDocument): MediaSize | undefined {
  if(document.type !== 'photo' || !document.w || !document.h || document.w === document.h) {
    return;
  }

  let thumbnailWidth = 0;
  let thumbnailHeight = 0;
  let thumbnailArea = 0;
  document.thumbs?.forEach((thumbnail) => {
    if(!('w' in thumbnail) || !('h' in thumbnail) || !thumbnail.w || !thumbnail.h) {
      return;
    }

    const area = thumbnail.w * thumbnail.h;
    if(area > thumbnailArea) {
      thumbnailWidth = thumbnail.w;
      thumbnailHeight = thumbnail.h;
      thumbnailArea = area;
    }
  });

  if(!thumbnailWidth || thumbnailWidth === thumbnailHeight) {
    return;
  }

  const documentIsLandscape = document.w > document.h;
  const thumbnailIsLandscape = thumbnailWidth > thumbnailHeight;
  if(documentIsLandscape === thumbnailIsLandscape) {
    return;
  }

  // JPEG metadata can describe the encoded pixel matrix while Telegram's
  // thumbnail already has the EXIF rotation applied. Only trust that signal
  // when swapping the document dimensions reproduces the thumbnail ratio.
  const rotatedDocumentRatio = document.h / document.w;
  const thumbnailRatio = thumbnailWidth / thumbnailHeight;
  const ratioDifference = Math.abs(rotatedDocumentRatio - thumbnailRatio) / thumbnailRatio;
  if(ratioDifference > MAX_THUMBNAIL_RATIO_DIFFERENCE) {
    return;
  }

  return makeMediaSize(document.h, document.w);
}
