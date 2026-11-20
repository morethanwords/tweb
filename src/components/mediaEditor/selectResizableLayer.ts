import type {MediaEditorState} from '@components/mediaEditor/context';
import type {ResizableLayer} from '@components/mediaEditor/types';
import {batch} from 'solid-js';
import {modifyMutable, reconcile} from 'solid-js/store';

/** Select without entering text editing, keeping the selected text's formatting controls in sync. */
export default function selectResizableLayer(editorState: MediaEditorState, layer: ResizableLayer) {
  batch(() => {
    if(layer.textInfo) modifyMutable(editorState.currentTextLayerInfo, reconcile(layer.textInfo));
    editorState.selectedResizableLayer = layer.id;
  });
}
