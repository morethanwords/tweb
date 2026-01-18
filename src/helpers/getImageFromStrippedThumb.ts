/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {PhotoSize} from '@layer';
import {MyDocument} from '@appManagers/appDocsManager';
import {MyPhoto} from '@appManagers/appPhotosManager';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import getPreviewURLFromThumb from '@helpers/getPreviewURLFromThumb';
import blur from '@helpers/blur';

export default function getImageFromStrippedThumb(
  photo: MyPhoto | MyDocument,
  thumb: PhotoSize.photoCachedSize | PhotoSize.photoStrippedSize,
  useBlur: boolean | number,
  url = getPreviewURLFromThumb(photo, thumb, false)
) {
  let element: HTMLImageElement | HTMLCanvasElement, loadPromise: Promise<void>;
  if(!useBlur) {
    element = new Image();
    loadPromise = renderImageFromUrlPromise(element, url);
  } else {
    const result = blur(url, typeof(useBlur) === 'number' ? useBlur : undefined);
    element = result.canvas;
    loadPromise = result.promise;
  }

  element.classList.add('thumbnail');

  return {image: element, loadPromise};
}
