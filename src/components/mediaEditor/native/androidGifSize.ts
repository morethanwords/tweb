import {androidPaintingSize, androidPaintingToSource} from '@components/mediaEditor/native/androidPaintAdapter';
import {STICKER_SIZE} from '@components/mediaEditor/finalRender/constants';
import type {NumberPair} from '@components/mediaEditor/types';

/** New GIF creation only. Android 21f7d109: baseStickerSize = floor(Pw*.5),
 * then absolute scale 1.5. This is not an existing web sticker's scale × 1.5.
 * Preserve the existing edge-aligned source conversion, even at a floored edge. */
export function androidGifFrame(source: NumberPair) {
  const painting = androidPaintingSize(source);
  const side = Math.floor(painting[0] * .5) * 1.5;
  const first = androidPaintingToSource([0, 0], source, painting);
  const last = androidPaintingToSource([side, side], source, painting);
  const size: NumberPair = [last[0] - first[0], last[1] - first[1]];
  return {size, scale: size[0] / STICKER_SIZE};
}
