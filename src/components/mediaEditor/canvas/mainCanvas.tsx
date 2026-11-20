import BrushCanvas from '@components/mediaEditor/canvas/brushCanvas';
import DesktopCropBackground from '@components/mediaEditor/canvas/desktopCropBackground';
import {isDesktopCropGeometryActive} from '@components/mediaEditor/native/desktopCropGeometry';
import CropHandles from '@components/mediaEditor/canvas/cropHandles';
import ImageCanvas from '@components/mediaEditor/canvas/imageCanvas';
import PreviewBrushSize from '@components/mediaEditor/canvas/previewBrushSize';
import ResizableLayers from '@components/mediaEditor/canvas/resizableLayers';
import RotationWheel from '@components/mediaEditor/canvas/rotationWheel';
import useFinalTransform from '@components/mediaEditor/canvas/useFinalTransform';
import VideoControls from '@components/mediaEditor/canvas/videoControls';
import {attachOriginalPreview, canPreviewOriginal} from '@components/mediaEditor/canvas/originalPreview';
import styles from '@components/mediaEditor/canvas/originalPreview.module.scss';
import Button from '@components/buttonTsx';
import Modes from '@config/modes';
import I18n from '@lib/langPack';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {observeResize} from '@components/resizeObserver';
import keepLeftToRight from '@helpers/dom/keepLeftToRight';
import {attachDesktopPaintPreview} from '@components/mediaEditor/canvas/desktopPaintPreview';
import {createEffect, onCleanup, onMount, Show} from 'solid-js';
import useIsMobile from '@components/mediaEditor/useIsMobile';


export default function MainCanvas() {
  let container: HTMLDivElement;
  const context = useMediaEditorContext();
  const {editorState, mediaType, isEditingForAvatar} = context;
  const isMobile = useIsMobile();
  const transparentOutside = () => !isMobile() && !isEditingForAvatar;

  useFinalTransform();

  onMount(() => {
    attachDesktopPaintPreview(container, context);
    const preview = attachOriginalPreview(container, context);
    createEffect(() => {
      if(!canPreviewOriginal(context)) preview.reset();
    });
    const unobserve = observeResize(container, ({contentRect: {width, height}}) => {
      if(!width || !height || editorState.canvasSize?.[0] === width && editorState.canvasSize?.[1] === height) return;
      editorState.canvasSize = [width, height];
    });
    onCleanup(() => {
      preview.dispose();
      unobserve();
    });
  });

  return (
    <div
      ref={(el) => {
        container = el;
        // * what is drawn is never mirrored, and nothing laid over it either: a text layer's alignment,
        // * the rotation wheel's scale and the video's timeline run left to right in an RTL layout too
        keepLeftToRight(el);
      }}
      class="media-editor__main-canvas"
      classList={{'media-editor__main-canvas--transparent': transparentOutside()}}
    >
      <Show when={editorState.canvasSize}>
        <Show when={isDesktopCropGeometryActive(context)}><DesktopCropBackground /></Show>
        <ImageCanvas transparentOutside={transparentOutside} />
        <Show when={editorState.isReady}>
          <BrushCanvas />
          <ResizableLayers />
          <PreviewBrushSize />
          {/* WTF ref causes infinite loop when passed without callback */}
          <div ref={(el) => void (editorState.resizeHandlesContainer = el)} class="media-editor__resize-handles-overlay" />
          <CropHandles />
          <Show when={isEditingForAvatar}>
            <RotationWheel />
          </Show>
          <Show when={mediaType === 'video' && !!editorState.renderingPayload}>
            <VideoControls />
          </Show>
        </Show>
      </Show>
      <Show when={Modes.a11y && canPreviewOriginal(context)}>
        <Button class={styles.toggle} text="ShowOriginalButton" aria-pressed={!!editorState.previewOriginal}
          ref={element => {
            createEffect(() => { element.dir = I18n.isRTL() ? 'rtl' : 'ltr'; });
            element.addEventListener('blur', () => { editorState.previewOriginal = false; });
          }}
          onClick={() => { editorState.previewOriginal = !editorState.previewOriginal; }} />
      </Show>
    </div>
  );
}
