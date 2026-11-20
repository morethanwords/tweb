import type {HistoryItem} from '@components/mediaEditor/context';
import type {ResizableLayer} from '@components/mediaEditor/types';
import {isDesktopActionLayer} from '@components/mediaEditor/native/desktopObjectActions';
import {isDesktopShape} from '@components/mediaEditor/native/desktopShapeGeometry';
import {desktopEditorFonts} from '@components/mediaEditor/fonts';
import {isAllowedStaticImageMime, validStaticImageSize} from '@components/mediaEditor/imageLayer/source';

export type DesktopPlacementIntent = {version: 1; id: number; type: ResizableLayer['type']};
type PlacementContext = {readonly isEditingForAvatar?: boolean};

/** No profile-only fallback: only objects opted in by their creation path qualify. */
export function isDesktopPlacementLayer(context: PlacementContext, layer: ResizableLayer): boolean {
  if(!layer || layer.desktopActions?.version !== 1 || !isDesktopActionLayer({isEditingForAvatar: !!context.isEditingForAvatar}, layer) ||
    !Number.isSafeInteger(layer.id) || !Array.isArray(layer.position) || layer.position.length !== 2 ||
    !layer.position.every(Number.isFinite) || !Number.isFinite(layer.rotation) || !Number.isFinite(layer.scale) || layer.scale <= 0) return false;
  switch(layer.type) {
    case 'shape': return isDesktopShape(layer.shapeInfo) &&
      (layer.shapeInfo.bend === undefined || Number.isFinite(layer.shapeInfo.bend)) &&
      [layer.shapeInfo.width, layer.shapeInfo.height, layer.shapeInfo.strokeWidth].every(value => Number.isFinite(value) && value > 0);
    case 'text': return !!layer.textInfo && Number.isFinite(layer.textInfo.size) && layer.textInfo.size > 0 &&
      desktopEditorFonts.some(({font}) => font === layer.textInfo.font);
    case 'sticker': return layer.sticker?._ === 'document' && layer.sticker.id !== undefined;
    case 'image': return layer.image?.version === 1 && isAllowedStaticImageMime(layer.image.mimeType) &&
      validStaticImageSize(layer.image.width, layer.image.height) &&
      [layer.displayWidth, layer.displayHeight].every(value => Number.isFinite(value) && value > 0);
    default: return false;
  }
}

/** Validate the explicit command before doing any live-layer lookup. Insertion/removal never qualify. */
export function isDesktopPlacementHistory(context: PlacementContext, item: HistoryItem): boolean {
  const intent = item.desktopPlacement;
  return intent?.version === 1 && Number.isSafeInteger(intent.id) &&
    item.path.length === 2 && item.path[0] === 'resizableLayers' && Number.isInteger(item.path[1]) && item.path[1] >= 0 &&
    item.findBy?.id === intent.id &&
    isDesktopPlacementLayer(context, item.oldValue) && isDesktopPlacementLayer(context, item.newValue) &&
    item.oldValue.id === intent.id && item.newValue.id === intent.id &&
    item.oldValue.type === intent.type && item.newValue.type === intent.type;
}
