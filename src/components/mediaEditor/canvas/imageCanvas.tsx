import {createEffect, createReaction, onMount} from 'solid-js';
import {modifyMutable, produce} from 'solid-js/store';

import {adjustmentsConfig, AdjustmentsConfig} from '../adjustments';
import {useMediaEditorContext} from '../context';
import {initWebGL} from '../webgl/initWebGL';
import {draw} from '../webgl/draw';

function drawAdjustedImage(gl: WebGLRenderingContext) {
  const {editorState, mediaState} = useMediaEditorContext();

  const payload = editorState.renderingPayload;
  if(!payload) return;

  draw(gl, payload, {
    ...editorState.finalTransform,
    imageSize: [payload.image.width, payload.image.height],
    ...(Object.fromEntries(
      adjustmentsConfig.map(({key, to100}) => {
        const value = mediaState.adjustments[key];
        return [key, value / (to100 ? 100 : 50)];
      })
    ) as Record<AdjustmentsConfig[number]['key'], number>)
  });
}

export default function ImageCanvas() {
  const {editorState, imageSrc} = useMediaEditorContext();

  const canvas = (
    <canvas width={editorState.canvasSize[0] * editorState.pixelRatio} height={editorState.canvasSize[1] * editorState.pixelRatio} />
  ) as HTMLCanvasElement;
  const gl = canvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  editorState.imageCanvas = canvas;

  async function init() {
    const payload = await initWebGL(gl, imageSrc);
    modifyMutable(editorState, produce(state => {
      state.renderingPayload = payload;
      state.imageSize = [payload.image.width, payload.image.height];
      state.currentImageRatio = payload.image.width / payload.image.height;
    }));
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
