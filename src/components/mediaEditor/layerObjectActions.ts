import {batch} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {HistoryItem, MediaEditorContextValue} from '@components/mediaEditor/context';
import duplicateResizableLayer from '@components/mediaEditor/duplicateResizableLayer';
import invertCanvasTransform from '@components/mediaEditor/canvas/invertCanvasTransform';
import {desktopDuplicatePosition} from '@components/mediaEditor/native/desktopObjectActions';

/** Menu and keyboard object commands share selection, placement and history semantics. */
export default function createLayerObjectActions(context: MediaEditorContextValue) {
  const {editorState, mediaState, actions} = context;
  const find = (id = editorState.selectedResizableLayer) => mediaState.resizableLayers.find(layer => layer.id === id);

  return {
    duplicate(id?: number) {
      const layer = find(id);
      if(!layer) return false;
      const nativePosition = desktopDuplicatePosition(context, layer);
      if(nativePosition === false) return false;
      if(nativePosition) return !!duplicateResizableLayer(context, layer, nativePosition);
      if(!editorState.canvasSize || !editorState.finalTransform.scale) return false;
      // An offset is a vector: translation cancels. Reuse the canvas inverse for its
      // rotation/scale, so 20 CSS pixels remain physically down-right even in RTL.
      const offset = invertCanvasTransform([20 * editorState.pixelRatio, 20 * editorState.pixelRatio], {
        ...editorState.finalTransform,
        translation: [0, 0]
      });
      return !!duplicateResizableLayer(context, layer, [layer.position[0] + offset[0], layer.position[1] + offset[1]]);
    },
    delete(id?: number) {
      const layer = find(id);
      if(!layer) return false;
      const idx = mediaState.resizableLayers.indexOf(layer);
      const snapshot = structuredClone(unwrap(layer));
      batch(() => {
        editorState.selectedResizableLayer = undefined;
        if(editorState.editingTextLayer === layer.id) editorState.editingTextLayer = undefined;
        mediaState.resizableLayers.splice(idx, 1);
        actions.pushToHistory({
          path: ['resizableLayers', idx],
          newValue: HistoryItem.RemoveArrayItem,
          oldValue: snapshot,
          findBy: {id: layer.id}
        });
      });
      return true;
    }
  };
}
