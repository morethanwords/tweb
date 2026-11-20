import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import insertResizableLayer from '@components/mediaEditor/insertResizableLayer';
import selectResizableLayer from '@components/mediaEditor/selectResizableLayer';
import type {NumberPair, ResizableLayer} from '@components/mediaEditor/types';
import {batch} from 'solid-js';
import {unwrap} from 'solid-js/store';

/** Duplicate at an already normalized canvas position as one id-addressed insertion. */
export default function duplicateResizableLayer(context: MediaEditorContextValue, source: ResizableLayer, position: NumberPair) {
  if(!context.mediaState.resizableLayers.some(layer => layer.id === source.id)) return;
  const copy: ResizableLayer = structuredClone(unwrap(source));
  copy.id = context.resizableLayersSeed++;
  copy.position = [...position];
  batch(() => {
    // Selecting a text copy must not apply the previous selection's formatting to it.
    selectResizableLayer(context.editorState, copy);
    context.editorState.editingTextLayer = undefined;
    insertResizableLayer(context, copy);
  });
  return copy;
}
