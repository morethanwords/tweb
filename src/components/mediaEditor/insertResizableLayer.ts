import {batch} from 'solid-js';
import {HistoryItem, MediaEditorContextValue} from '@components/mediaEditor/context';
import type {ResizableLayer} from '@components/mediaEditor/types';
import {unwrap} from 'solid-js/store';
import StickerType from '@config/stickerType';

/** Insert an already positioned layer as one undoable edit. */
export default function insertResizableLayer({mediaState, editorState, actions, nativePaint}: MediaEditorContextValue, layer: ResizableLayer) {
  if(nativePaint?.ownsDispatch() && layer.type === 'sticker' && layer.sticker?.sticker !== StickerType.Static) {
    nativePaint.rejectAnimated();
    return;
  }
  const snapshot = structuredClone(unwrap(layer));
  batch(() => {
    mediaState.resizableLayers.push(layer);
    editorState.selectedResizableLayer = layer.id;
    actions.pushToHistory({
      path: ['resizableLayers', mediaState.resizableLayers.length - 1],
      newValue: snapshot,
      oldValue: HistoryItem.RemoveArrayItem,
      findBy: {id: layer.id}
    });
  });
}
