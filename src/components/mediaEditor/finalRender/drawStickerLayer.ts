import {MediaEditorContextValue} from '../context';
import {snapToViewport} from '../utils';
import {ResizableLayer} from '../types';

import {STICKER_SIZE} from './constants';

export default function drawStickerLayer(
  context: MediaEditorContextValue,
  ctx: CanvasRenderingContext2D,
  layer: ResizableLayer,
  source: CanvasImageSource,
  ratio: number
) {
  const [stickersLayersInfo] = context.stickersLayersInfo;

  const {container} = stickersLayersInfo()[layer.id];
  const stickerChild = container?.lastElementChild;
  if(!stickerChild) return;

  const size = STICKER_SIZE * layer.scale * context.pixelRatio;

  ctx.save();
  ctx.translate(layer.position[0], layer.position[1]);
  ctx.rotate(layer.rotation);

  const [w, h] = snapToViewport(ratio, size, size);

  ctx.drawImage(source, -size / 2 + (size - w) / 2, -size / 2 + (size - h) / 2, w, h);

  ctx.restore();
}
