import {onCleanup, onMount, Show, useContext} from 'solid-js';

import {hexToRgb} from '../../../helpers/color';

import MediaEditorContext from '../context';

import CropHandles from './cropHandles';
import RotationWheel from './rotationWheel';
import ResizableLayers from './resizableLayers';
import BrushCanvas from './brushCanvas';
import ImageCanvas from './imageCanvas';
import useFinalTransform from './useFinalTransform';

export default function MainCanvas() {
  let container: HTMLDivElement;
  const context = useContext(MediaEditorContext);
  const [isReady] = context.isReady;
  const [canvasSize, setCanvasSize] = context.canvasSize;
  const [previewBrushSize] = context.previewBrushSize;
  const [currentBrush] = context.currentBrush;
  const [, setResizeHandlesContainer] = context.resizeHandlesContainer;

  useFinalTransform();

  onMount(() => {
    const listener = () => {
      const bcr = container.getBoundingClientRect();
      setCanvasSize([bcr.width, bcr.height]);
    };
    listener();
    window.addEventListener('resize', listener);
    onCleanup(() => {
      window.removeEventListener('resize', listener);
    });
  });

  return (
    <div ref={container} class="media-editor__main-canvas">
      <Show when={canvasSize()}>
        <ImageCanvas />
        <Show when={isReady()}>
          <BrushCanvas />
          <ResizableLayers />
          {previewBrushSize() && (
            <div
              class="media-editor__preview-brush-size"
              style={{
                '--color': !['blur', 'eraser'].includes(currentBrush().brush) ?
                  hexToRgb(currentBrush().color).join(',') :
                  undefined,
                'width': previewBrushSize() + 'px',
                'height': previewBrushSize() + 'px'
              }}
            />
          )}
          <div ref={setResizeHandlesContainer} class="media-editor__resize-handles-overlay" />
          <CropHandles />
          <RotationWheel />
        </Show>
      </Show>
    </div>
  );
}
