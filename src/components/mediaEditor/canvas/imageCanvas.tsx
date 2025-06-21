import {createEffect, createReaction, onCleanup, onMount} from 'solid-js';
import {modifyMutable, produce} from 'solid-js/store';

import {animate} from '../../../helpers/animation';

import {adjustmentsConfig, AdjustmentsConfig} from '../adjustments';
import {useMediaEditorContext} from '../context';
import {withCurrentOwner} from '../utils';
import {draw} from '../webgl/draw';
import {initWebGL} from '../webgl/initWebGL';

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

  const hey = withCurrentOwner((): void => void drawAdjustedImage(gl));

  const initVideoThing = withCurrentOwner(() => {
    const {editorState: {renderingPayload}} = useMediaEditorContext();

    const fn = () => {
      gl.bindTexture(gl.TEXTURE_2D, renderingPayload.texture);
      // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);

      hey();
      console.log('[my-debug] drawing');
    }

    let cleaned = false;
    const video = renderingPayload.media.video;
    // video?.addEventListener('timeupdate', fn);

    animate(() => {
      fn();
      return !cleaned;
    });

    onCleanup(() => {
      cleaned = true;
      // video?.removeEventListener('timeupdate', fn);
    });
  });

  async function init() {
    const payload = await initWebGL({gl, mediaSrc, mediaType});

    modifyMutable(editorState, produce(state => {
      state.renderingPayload = payload;
      state.imageSize = [payload.media.width, payload.media.height];
    }));

    if(!mediaState.currentImageRatio) {
      const ratio = payload.media.width / payload.media.height;
      actions.setInitialImageRatio(ratio)
      mediaState.currentImageRatio = ratio;
    }

    initVideoThing();
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

  return <>{canvas}</>;
}
