import {useMediaEditorContext} from '@components/mediaEditor/context';
import insertResizableLayer from '@components/mediaEditor/insertResizableLayer';
import useNormalizePoint from '@components/mediaEditor/canvas/useNormalizePoint';
import {NumberPair, ResizableLayer} from '@components/mediaEditor/types';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import useIsMobile from '@components/mediaEditor/useIsMobile';
import {batch, createEffect, on, onCleanup} from 'solid-js';
import {activateTextProfile, prepareFreshText} from '@components/mediaEditor/native/brushStateBank';
import {desktopActionsForCreation} from '@components/mediaEditor/native/desktopObjectActions';

export default function useAddText() {
  const context = useMediaEditorContext();
  const {editorState} = context;
  const isMobile = useIsMobile();
  createEffect(on(isMobile, mobile => {
    if(!context.isEditingForAvatar) activateTextProfile(editorState, mobile ? 'android' : 'desktop');
  }));
  // Shells mount before MainCanvas reports its size; create its geometry memo on first use.
  const createNormalizePoint = withCurrentOwner(useNormalizePoint);
  let normalizePoint: ReturnType<typeof useNormalizePoint>;
  let pending: Promise<void>;
  let disposed = false;
  onCleanup(() => { disposed = true; });
  return (point?: NumberPair) => {
    if(pending || disposed) return pending;
    if(!editorState.canvasSize || !editorState.finalTransform) return;
    // Complete the preceding session before another draft takes its place.
    const work = context.textSessions.afterFinish(() => batch(() => {
      if(disposed) return;
      editorState.editingTextLayer = undefined;
      prepareFreshText(context, isMobile() ? 'android' : 'desktop');
      if(isMobile() && !context.isEditingForAvatar) context.androidShapePreference.prepareText();
      normalizePoint ??= createNormalizePoint();
      point ??= editorState.canvasSize.map(value => value / 2) as NumberPair;
      const transform = editorState.finalTransform;
      const layer: ResizableLayer = {
        id: context.resizableLayersSeed++,
        position: normalizePoint(point),
        rotation: -transform.rotation,
        scale: 1 / transform.scale,
        type: 'text',
        ...desktopActionsForCreation(context, isMobile()),
        textInfo: {
          ...editorState.currentTextLayerInfo,
          ...(!context.isEditingForAvatar && !isMobile() ? {color: editorState.currentBrush.color} : {})
        }
      };
      if(!context.isEditingForAvatar && !isMobile()) {
        editorState.draftTextLayer = layer.id;
        context.mediaState.resizableLayers.push(layer);
        editorState.selectedResizableLayer = layer.id;
      } else {
        insertResizableLayer(context, layer);
      }
      editorState.editingTextLayer = layer.id;
    }));
    if(work) {
      pending = work.finally(() => { pending = undefined; });
      return pending;
    }
  };
}
