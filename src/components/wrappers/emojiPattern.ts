/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import customProperties from '../../helpers/dom/customProperties';
import {Middleware} from '../../helpers/middleware';
import noop from '../../helpers/noop';
import pause from '../../helpers/schedulers/pause';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {applyColorOnContext} from '../../lib/rlottie/rlottiePlayer';
import rootScope from '../../lib/rootScope';
import wrapSticker from './sticker';

export default async function wrapEmojiPattern({
  docId,
  middleware,
  useHighlightingColor,
  colorAsOut,
  container,
  color,
  positions,
  canvasWidth,
  canvasHeight,
  emojiSize,
  onCacheStatus: onCacheStatus
}: {
  docId: DocId | MyDocument,
  middleware: Middleware,
  useHighlightingColor?: boolean,
  colorAsOut?: boolean,
  container?: HTMLElement,
  color?: string,
  positions: [x: number, y: number, size: number, alpha: number][],
  canvasWidth: number,
  canvasHeight: number,
  emojiSize: number,
  onCacheStatus?: (cached: boolean) => void
}) {
  let doc: MyDocument;
  if(typeof docId  === 'object') {
    doc = docId;
  } else {
    const result = await rootScope.managers.acknowledged.appEmojiManager.getCustomEmojiDocument(docId);
    if(!result.cached) onCacheStatus?.(false);
    doc = await result.result;
  }

  const d = document.createElement('div');
  return wrapSticker({
    doc,
    div: d,
    middleware,
    width: emojiSize,
    height: emojiSize,
    // onlyThumb: true,
    static: true,
    withThumb: false,
    exportLoad: 2,
    useCache: false
  }).then(({load, downloaded}) => {
    onCacheStatus?.(downloaded);
    return load();
  }).then((result) => {
    const image = (result as HTMLImageElement[])[0];
    if(!image.naturalWidth) {
      console.warn('should wait for image size', image);
      return pause(100).then(() => image);
    }
    return image;
  }).then((image) => {
    const canvas = document.createElement('canvas');
    canvas.classList.add('emoji-pattern-canvas');
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    const ctx = canvas.getContext('2d');
    const dpr = canvas.dpr = window.devicePixelRatio;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    positions.forEach(([x, y, size, alpha]) => {
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, x * dpr, y * dpr, size * dpr, size * dpr);
    });
    ctx.globalAlpha = 1;

    if(useHighlightingColor) {
      color = '#ffffff';
    } else if(colorAsOut) {
      color = customProperties.getProperty('message-out-primary-color');
    }

    applyColorOnContext(ctx, color, 0, 0, canvas.width, canvas.height);
    if(container) container.prepend(canvas);
    return canvas;
  }).catch(noop) as Promise<HTMLCanvasElement>;
}
