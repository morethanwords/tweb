import {MediaEditorContextValue} from '@components/mediaEditor/context';
import {snapToViewport} from '@components/mediaEditor/utils';
import {ResizableLayer} from '@components/mediaEditor/types';

import {STICKER_SIZE} from '@components/mediaEditor/finalRender/constants';

export default function drawStickerLayer(
  context: MediaEditorContextValue,
  ctx: CanvasRenderingContext2D,
  layer: ResizableLayer,
  source: CanvasImageSource,
  ratio: number,
  densityAware = true
) {
  const {editorState: {stickersLayersInfo, pixelRatio}} = context;

  const {container} = stickersLayersInfo[layer.id];
  const stickerChild = container?.lastElementChild;
  if(!stickerChild) return;

  const size = STICKER_SIZE * layer.scale * (densityAware ? pixelRatio : 1);

  ctx.save();
  ctx.translate(layer.position[0], layer.position[1]);
  ctx.rotate(layer.rotation);

  const [w, h] = snapToViewport(ratio, size, size);

  ctx.drawImage(source, -size / 2 + (size - w) / 2, -size / 2 + (size - h) / 2, w, h);

  ctx.restore();
}
