import {createEffect, createReaction, onCleanup, onMount} from 'solid-js';
import {modifyMutable, produce} from 'solid-js/store';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import {adjustmentsConfig, AdjustmentsConfig} from '../adjustments';
import {useMediaEditorContext} from '../context';
import {cleanupWebGl, withCurrentOwner} from '../utils';
import {draw} from '../webgl/draw';
import {initWebGL} from '../webgl/initWebGL';
import initVideoPlayback from './initVideoPlayback';


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

    modifyMutable(editorState, produce(state => {
      state.renderingPayload = payload;
      state.imageSize = [payload.media.width, payload.media.height];
    }));

    if(!mediaState.currentImageRatio) {
      const ratio = payload.media.width / payload.media.height;
      actions.setInitialImageRatio(ratio)
      mediaState.currentImageRatio = ratio;
    }

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
