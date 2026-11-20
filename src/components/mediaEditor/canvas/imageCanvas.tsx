import {adjustmentsConfig, AdjustmentsConfig} from '@components/mediaEditor/adjustments';
import initVideoPlayback from '@components/mediaEditor/canvas/initVideoPlayback';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {canPreviewOriginal} from '@components/mediaEditor/canvas/originalPreview';
import {cleanupWebGl, snapToAvailableQuality, snapToViewport} from '@components/mediaEditor/utils';
import {draw} from '@components/mediaEditor/webgl/draw';
import {initWebGL} from '@components/mediaEditor/webgl/initWebGL';
import createMiddleware from '@helpers/solid/createMiddleware';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import {batch, createEffect, createReaction, onCleanup, onMount} from 'solid-js';
import {useCropOffset} from './useCropOffset';
import {desktopCropSource} from '@components/mediaEditor/native/desktopCropSource';


function drawAdjustedImage(gl: WebGLRenderingContext, transparentOutside: () => boolean) {
  const context = useMediaEditorContext();
  const {editorState, mediaState} = context;

  const payload = editorState.renderingPayload;
  if(!payload) return;

  const original = canPreviewOriginal(context) && editorState.previewOriginal;
  draw(gl, payload, {
    ...editorState.finalTransform,
    previewAffine: editorState.paintPreviewAffine?.forward,
    previewPixelRatio: editorState.pixelRatio,
    processingVersion: mediaState.adjustments.processingVersion,
    original,
    transparentOutside: transparentOutside(),
    native: original ? undefined : mediaState.adjustments.native,
    imageSize: [payload.media.width, payload.media.height],
    ...(Object.fromEntries(
      adjustmentsConfig.map(({key, to100}) => {
        const value = original ? 0 : mediaState.adjustments[key];
        return [key, value / (to100 ? 100 : 50)];
      })
    ) as Record<AdjustmentsConfig[number]['key'], number>)
  });
}

export default function ImageCanvas(props: {transparentOutside?: () => boolean}) {
  const context = useMediaEditorContext();
  const {editorState, mediaState, mediaSrc, mediaType, actions, isEditingForAvatar} = context;

  const cropOffset = useCropOffset();

  const transparentOutside = () => props.transparentOutside?.() || false;
  const canvas = (
    <canvas width={editorState.canvasSize[0] * editorState.pixelRatio} height={editorState.canvasSize[1] * editorState.pixelRatio} />
  ) as HTMLCanvasElement;

  const gl = canvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  editorState.imageCanvas = canvas;

  const ownedDrawAdjustedImage = withCurrentOwner(() => drawAdjustedImage(gl, transparentOutside));

  const ownedInitVideoPlayback = withCurrentOwner(() =>
    initVideoPlayback({gl, drawAdjustedImage: ownedDrawAdjustedImage})
  );

  const middleware = createMiddleware().get();

  async function init() {
    const payload = await initWebGL({gl, mediaSrc, mediaType, videoTime: mediaState.currentVideoTime, middleware});
    if(!middleware() || !payload) return;

    if(context.desktopCropCandidate) {
      // Unsupported sources remain on the legacy path, before any descriptor
      // or source-space transform is created. A present descriptor still owns
      // export and will fail closed instead of being reinterpreted.
      await desktopCropSource(context).qualify(context, [payload.media.width, payload.media.height], middleware).catch(() => {});
      if(!middleware()) return;
    }

    batch(() => {
      editorState.renderingPayload = payload;
      editorState.mediaSize = [payload.media.width, payload.media.height];
      editorState.mediaRatio = payload.media.width / payload.media.height;

      if(!mediaState.videoQuality) {
        const videoQuality = snapToAvailableQuality(payload.media.height);
        actions.updateMediaStateClone(state => {
          state.videoQuality = videoQuality;
        });
        mediaState.videoQuality = videoQuality;
      }

      if(isEditingForAvatar && !mediaState.currentImageRatio) {
        const squareRatio = 1;

        const [w1, h1] = snapToViewport(editorState.mediaRatio, cropOffset().width, cropOffset().height);
        const [w2, h2] = snapToViewport(squareRatio, cropOffset().width, cropOffset().height);

        mediaState.scale = Math.max(w2 / w1, h2 / h1);
        mediaState.currentImageRatio = squareRatio;

        editorState.fixedImageRatioKey = '1x1';

        actions.updateMediaStateClone(state => {
          state.currentImageRatio = squareRatio;
          state.scale = mediaState.scale;
        });
      } else if(!mediaState.currentImageRatio) {
        const ratio = payload.media.width / payload.media.height;
        actions.updateMediaStateClone(state => {
          state.currentImageRatio = ratio;
        });
        mediaState.currentImageRatio = ratio;
      }
    });


    ownedInitVideoPlayback();
  }

  onMount(() => {
    if(editorState.isReady) init(); // When hot reloading
    else {
      const track = createReaction(() => {
        init();
      });

      track(() => editorState.isReady);
    }
  });

  createEffect(() => {
    drawAdjustedImage(gl, transparentOutside);
  });

  onCleanup(() => {
    cleanupWebGl(gl);
  });

  return <>{canvas}</>;
}
