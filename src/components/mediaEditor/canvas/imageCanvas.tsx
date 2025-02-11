import {createEffect, createReaction, onMount, useContext} from 'solid-js';

import MediaEditorContext from '../context';
import {AdjustmentsConfig} from '../adjustments';
import {initWebGL} from '../webgl/initWebGL';
import {draw} from '../webgl/draw';

function drawAdjustedImage(gl: WebGLRenderingContext) {
  const context = useContext(MediaEditorContext);
  const [renderingPayload] = context.renderingPayload;
  const [finalTransform] = context.finalTransform;

  const payload = renderingPayload();
  if(!payload) return;

  draw(gl, payload, {
    ...finalTransform(),
    imageSize: [payload.image.width, payload.image.height],
    ...(Object.fromEntries(
      context.adjustments.map(({key, signal, to100}) => {
        const value = signal[0]();
        return [key, value / (to100 ? 100 : 50)];
      })
    ) as Record<AdjustmentsConfig[number]['key'], number>)
  });
}

export default function ImageCanvas() {
  const context = useContext(MediaEditorContext);
  const [isReady] = context.isReady;
  const [canvasSize] = context.canvasSize;
  const [currentImageRatio, setCurrentImageRatio] = context.currentImageRatio;
  const [, setImageSize] = context.imageSize;
  const [, setImageCanvas] = context.imageCanvas;
  const [, setRenderingPayload] = context.renderingPayload;

  const canvas = (
    <canvas width={canvasSize()[0] * context.pixelRatio} height={canvasSize()[1] * context.pixelRatio} />
  ) as HTMLCanvasElement;
  const gl = canvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  setImageCanvas(canvas);

  async function init() {
    const payload = await initWebGL(gl, context);
    setRenderingPayload(payload);
    setImageSize([payload.image.width, payload.image.height]);
    if(!currentImageRatio()) setCurrentImageRatio(payload.image.width / payload.image.height);
  }

  onMount(() => {
    if(isReady()) init(); // When hot reloading
    else {
      const track = createReaction(() => {
        init();
      });

      track(isReady);
    }
  });

  createEffect(() => {
    drawAdjustedImage(gl);
  });

  return <>{canvas}</>;
}
