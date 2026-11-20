import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import type {ResizableLayer} from '@components/mediaEditor/types';

/** a532622 ItemImage::performFlip mirrors local pixels, not the scene position.
 * Web extension: the existing transform action also records this edit in history.
 * No font/sticker/viewport inference and no legacy backfill on reopen.
 */
export function canFlipImageLayer(context: Pick<MediaEditorContextValue, 'isEditingForAvatar' | 'isVideoAvatarMode'>, layer: ResizableLayer) {
  return !context.isEditingForAvatar && !context.isVideoAvatarMode && layer.type === 'image' &&
    layer.imageReflection?.version === 1 && typeof layer.imageReflection.horizontal === 'boolean';
}

export function imageLayerFlipped(context: Pick<MediaEditorContextValue, 'isEditingForAvatar' | 'isVideoAvatarMode'>, layer: ResizableLayer) {
  return canFlipImageLayer(context, layer) && layer.type === 'image' && layer.imageReflection.horizontal;
}
