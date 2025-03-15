import {onCleanup, onMount, Show} from 'solid-js';

import {useMediaEditorContext} from '../context';

import useFinalTransform from './useFinalTransform';
import PreviewBrushSize from './previewBrushSize';
import ResizableLayers from './resizableLayers';
import RotationWheel from './rotationWheel';
import CropHandles from './cropHandles';
import BrushCanvas from './brushCanvas';
import ImageCanvas from './imageCanvas';


export default function MainCanvas() {
  let container: HTMLDivElement;
  const {editorState} = useMediaEditorContext();

  useFinalTransform();

  onMount(() => {
    const listener = () => {
      const bcr = container.getBoundingClientRect();
      editorState.canvasSize = [bcr.width, bcr.height];
    };
    listener();
    window.addEventListener('resize', listener);
    onCleanup(() => {
      window.removeEventListener('resize', listener);
    });
  });

  return (
    <div ref={container} class="media-editor__main-canvas">
      <Show when={editorState.canvasSize}>
        <ImageCanvas />
        <Show when={editorState.isReady}>
          <BrushCanvas />
          <ResizableLayers />
          <PreviewBrushSize />
          {/* WTF ref causes infinite loop when passed without callback */}
          <div ref={(el) => void (editorState.resizeHandlesContainer = el)} class="media-editor__resize-handles-overlay" />
          <CropHandles />
          <RotationWheel />
        </Show>
      </Show>
    </div>
  );
}
