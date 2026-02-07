import {adjustmentsConfig, AdjustmentsConfig} from '@components/mediaEditor/adjustments';
import initVideoPlayback from '@components/mediaEditor/canvas/initVideoPlayback';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {cleanupWebGl, snapToAvailableQuality, withCurrentOwner} from '@components/mediaEditor/utils';
import {draw} from '@components/mediaEditor/webgl/draw';
import {initWebGL} from '@components/mediaEditor/webgl/initWebGL';
import createMiddleware from '@helpers/solid/createMiddleware';
import {batch, createEffect, createReaction, onCleanup, onMount} from 'solid-js';


function drawAdjustedImage(gl: WebGLRenderingContext) {
  const {editorState, mediaState} = useMediaEditorContext();

  const payload = editorState.renderingPayload;
  if(!payload) return;

  draw(gl, payload, {
    ...editorState.finalTransform,
    imageSize: [payload.media.width, payload.media.height],
    ...(Object.fromEntries(
      adjustmentsConfig.map(({key, to100}) => {
        const value = mediaState.adjustments[key];
        return [key, value / (to100 ? 100 : 50)];
      })
    ) as Record<AdjustmentsConfig[number]['key'], number>)
  });
}

export default function ImageCanvas() {
  const {editorState, mediaState, mediaSrc, mediaType, actions} = useMediaEditorContext();

  const canvas = (
    <canvas width={editorState.canvasSize[0] * editorState.pixelRatio} height={editorState.canvasSize[1] * editorState.pixelRatio} />
  ) as HTMLCanvasElement;

  const gl = canvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  editorState.imageCanvas = canvas;

  const ownedDrawAdjustedImage = withCurrentOwner(() => drawAdjustedImage(gl));

  const ownedInitVideoPlayback = withCurrentOwner(() =>
    initVideoPlayback({gl, drawAdjustedImage: ownedDrawAdjustedImage})
  );

  const middleware = createMiddleware().get();

  async function init() {
    const payload = await initWebGL({gl, mediaSrc, mediaType, videoTime: mediaState.currentVideoTime, middleware});

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

      if(!mediaState.currentImageRatio) {
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
    drawAdjustedImage(gl);
  });

  onCleanup(() => {
    cleanupWebGl(gl);
  });

  return <>{canvas}</>;
}
