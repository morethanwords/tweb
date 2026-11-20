import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import type {ResizableLayer} from '@components/mediaEditor/types';
import {approximateDeepEqual} from '@components/mediaEditor/utils';
import {unwrap} from 'solid-js/store';
import {isDesktopPlacementHistory} from '@components/mediaEditor/native/desktopPlacementHistory';
import type {HistoryItem} from '@components/mediaEditor/context';

/** Snapshot once before a live transform; the returned completion records at most one edit. */
export default function beginLayerTransform(
  context: Pick<MediaEditorContextValue, 'mediaState' | 'actions' | 'isEditingForAvatar'>,
  layer: ResizableLayer
) {
  const {mediaState, actions} = context;
  const before = structuredClone(unwrap(layer));
  let finished = false;
  return () => {
    if(finished) return;
    finished = true;
    const index = mediaState.resizableLayers.indexOf(layer);
    const rotationDelta = layer.rotation - before.rotation;
    // A history replay or removal may already have replaced the live layer.
    // A round trip through canvas coordinates can introduce rounding; a full turn is unchanged too.
    const shapeState = (value: ResizableLayer) => value.shapeInfo && {
      ...value.shapeInfo, shapeFlip: !!value.shapeInfo.shapeFlip, bend: value.shapeInfo.bend ?? 0
    };
    if(index < 0 || (!!before.stickerFlip === !!layer.stickerFlip &&
      approximateDeepEqual(before.type === 'image' && before.imageReflection, layer.type === 'image' && layer.imageReflection) &&
      approximateDeepEqual(shapeState(before), shapeState(layer)) && approximateDeepEqual(
      [before.position, before.scale, 0],
      [layer.position, layer.scale, Math.atan2(Math.sin(rotationDelta), Math.cos(rotationDelta))]
    ))) return;
    const item: HistoryItem = {
      path: ['resizableLayers', index],
      oldValue: before,
      newValue: structuredClone(unwrap(layer)),
      findBy: {id: layer.id}
    };
    item.desktopPlacement = {version: 1, id: layer.id, type: layer.type};
    if(!isDesktopPlacementHistory(context, item)) delete item.desktopPlacement;
    actions.pushToHistory(item);
  };
}
