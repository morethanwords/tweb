import {onCleanup, onMount, Show, JSX} from 'solid-js';
import {Transition} from 'solid-transition-group';

import {useMediaEditorContext} from '@components/mediaEditor/context';

import BrushCanvas from '@components/mediaEditor/canvas/brushCanvas';
import CropHandles from '@components/mediaEditor/canvas/cropHandles';
import ImageCanvas from '@components/mediaEditor/canvas/imageCanvas';
import PreviewBrushSize from '@components/mediaEditor/canvas/previewBrushSize';
import ResizableLayers from '@components/mediaEditor/canvas/resizableLayers';
import RotationWheel from '@components/mediaEditor/canvas/rotationWheel';
import useFinalTransform from '@components/mediaEditor/canvas/useFinalTransform';
import VideoControls from '@components/mediaEditor/canvas/videoControls';


export default function MainCanvas() {
  let container: HTMLDivElement;
  const {editorState, mediaType} = useMediaEditorContext();

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
          <Show when={mediaType === 'video' && !!editorState.renderingPayload}>
            <VideoControls />
          </Show>
        </Show>
      </Show>
    </div>
  );
}
