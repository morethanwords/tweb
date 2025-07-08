import {createEffect, createMemo, createSignal, on, onCleanup, onMount} from 'solid-js';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import SwipeHandler from '../../swipeHandler';
import {adjustmentsConfig, AdjustmentsConfig} from '../adjustments';
import {HistoryItem, useMediaEditorContext} from '../context';
import {NumberPair} from '../types';
import {cleanupWebGl, distance} from '../utils';
import {draw} from '../webgl/draw';
import {initWebGL, RenderingPayload} from '../webgl/initWebGL';
import BrushPainter, {BrushDrawnLine} from './brushPainter';
import useNormalizePoint from './useNormalizePoint';
import useProcessPoint from './useProcessPoint';


function drawAdjustedImage(gl: WebGLRenderingContext, payload: RenderingPayload) {
  const {mediaState} = useMediaEditorContext();

  if(!payload) return;

  draw(gl, payload, {
    flip: mediaState.flip,
    rotation: 0,
    scale: 1,
    translation: [0, 0],
    imageSize: [payload.media.width, payload.media.height],
    ...(Object.fromEntries(
      adjustmentsConfig.map(({key, to100}) => {
        const value = mediaState.adjustments[key];
        return [key, value / (to100 ? 100 : 50)];
      })
    ) as Record<AdjustmentsConfig[number]['key'], number>)
  });
}

export default function BrushCanvas() {
  const {editorState, mediaState, actions, mediaSrc, mediaType} = useMediaEditorContext();

  const [fullImageGLPayload, setFullImageGLPayload] = createSignal<RenderingPayload>();

  const normalizePoint = useNormalizePoint();
  const processPoint = useProcessPoint();

  function processLine(line: BrushDrawnLine): BrushDrawnLine {
    const transform = editorState.finalTransform;
    return {
      ...line,
      size: line.size * transform.scale,
      points: line.points.map(processPoint)
    };
  }

  const processedLines = createMemo(() => mediaState.brushDrawnLines.map(processLine));

  const [lastLine, setLastLine] = createSignal<BrushDrawnLine>();

  const canvas = (
    <canvas
      class="media-editor__brush-canvas"
      classList={{
        'media-editor__brush-canvas--active': editorState.currentTab === 'brush'
      }}
      style={{
        'opacity': editorState.isAdjusting ? 0 : 1
      }}
      width={editorState.canvasSize?.[0] * editorState.pixelRatio}
      height={editorState.canvasSize?.[1] * editorState.pixelRatio}
    ></canvas>
  ) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');

  editorState.brushCanvas = canvas;

  const fullImageMultiplier = () =>
    Math.min(
      editorState.canvasSize?.[0] / editorState.imageSize?.[0],
      editorState.canvasSize?.[1] / editorState.imageSize?.[1]
    ) * 2 * editorState.pixelRatio;

  const fullImageCanvas = (<canvas width={editorState.imageSize?.[0]} height={editorState.imageSize?.[1]} />) as HTMLCanvasElement;
  const gl = fullImageCanvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  const fullBrushesCanvas = (
    <canvas width={editorState.imageSize?.[0] * fullImageMultiplier()} height={editorState.imageSize?.[1] * fullImageMultiplier()} />
  ) as HTMLCanvasElement;

  let brushPainter = new BrushPainter({
    imageCanvas: editorState.imageCanvas,
    targetCanvas: canvas
  });

  let fullBrushPainter: BrushPainter;

  onMount(async() => {
    if(mediaType !== 'image') return;
    const middleware = createMiddleware().get();
    setFullImageGLPayload(await initWebGL({gl, mediaSrc, mediaType, videoTime: 0, middleware}));
  });

  onCleanup(() => {
    cleanupWebGl(gl);
  });

  createEffect(() => {
    const payload = fullImageGLPayload();
    drawAdjustedImage(gl, payload);
  });

  createEffect(on(fullImageGLPayload, () => {
    const payload = fullImageGLPayload();
    if(payload) setTimeout(() => redrawFull(), 100);
  }));

  createEffect(
    on(() => editorState.canvasSize, () => {
      brushPainter = new BrushPainter({
        imageCanvas: editorState.imageCanvas,
        targetCanvas: canvas
      });
      redraw();
    })
  );

  function resetLastLine() {
    setLastLine({
      color: editorState.currentBrush.color,
      brush: editorState.currentBrush.brush,
      size: (editorState.currentBrush.size * editorState.pixelRatio) / editorState.finalTransform.scale,
      points: []
    });
  }

  createEffect(() => {
    resetLastLine();
  });

  createEffect(() => {
    if(editorState.isMoving) {
      const transform = editorState.finalTransform;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      ctx.translate(transform.translation[0] + canvas.width / 2, transform.translation[1] + canvas.height / 2);
      ctx.rotate(transform.rotation);
      ctx.scale(transform.scale, transform.scale);

      const [w, h] = editorState.imageSize;
      ctx.drawImage(fullBrushesCanvas, -(w / 2), -(h / 2), w, h);

      ctx.restore();
    } else {
      redraw();
      redrawFull();
    }
  });

  function redraw() {
    brushPainter.clear();
    brushPainter.saveLastLine();
    processedLines().forEach((line) => brushPainter.drawLine(line));
  }

  function processLineForFullImage(line: BrushDrawnLine) {
    return {
      ...line,
      size: line.size * fullImageMultiplier(),
      points: line.points.map(
        (point) =>
          [
            (point[0] + editorState.imageSize?.[0] / 2) * fullImageMultiplier(),
            (point[1] + editorState.imageSize?.[1] / 2) * fullImageMultiplier()
          ] as NumberPair
      )
    };
  }

  function redrawFull() {
    if(!fullBrushPainter) return;

    fullBrushPainter.clear();
    fullBrushPainter.saveLastLine();

    mediaState.brushDrawnLines.forEach((line) => fullBrushPainter.drawLine(processLineForFullImage(line)));
  }

  createEffect(
    on(() => editorState.imageSize, () => {
      if(!editorState.imageSize?.[0]) return;
      fullBrushPainter = new BrushPainter({
        imageCanvas: fullImageCanvas,
        targetCanvas: fullBrushesCanvas,
        blurAmount: BrushPainter.defaultBlurAmount * fullImageMultiplier()
      });

      redraw();
      redrawFull();
    })
  );

  createEffect(() => {
    if(editorState.isAdjusting) {
      onCleanup(() => {
        redraw();
        redrawFull();
      });
    }
  });

  actions.redrawBrushes = () => {
    redraw();
    redrawFull();
  };
  onCleanup(() => {
    actions.redrawBrushes = () => {};
  });

  onMount(() => {
    let initialPosition: NumberPair;
    let points: NumberPair[] = [];

    let builtUpDistance = 0;

    function saveLastLine() {
      mediaState.brushDrawnLines.push(lastLine());
      actions.pushToHistory({
        path: ['brushDrawnLines', mediaState.brushDrawnLines.length - 1],
        newValue: lastLine(),
        oldValue: HistoryItem.RemoveArrayItem
      });

      fullBrushPainter.updateBlurredImage();
      fullBrushPainter.drawLine(processLineForFullImage(lastLine()));
      resetLastLine();
      brushPainter.saveLastLine();

      points = [];
      initialPosition = undefined;
    }

    function startSwipe(x: number, y: number) {
      const bcr = canvas.getBoundingClientRect();

      initialPosition = [x - bcr.left, y - bcr.top];
      const point = normalizePoint(initialPosition);
      points = [point];

      setLastLine((prev) => ({...prev, points}));
      brushPainter.updateBlurredImage();
      brushPainter.previewLine(processLine(lastLine()));

      editorState.selectedResizableLayer = undefined;
    }

    function endSwipe() {
      if(points.length === 1) {
        saveLastLine();
      }
    }

    canvas.addEventListener('mousedown', (e) => {
      startSwipe(e.clientX, e.clientY);
    });
    canvas.addEventListener('touchstart', (e) => {
      startSwipe(e.touches[0].clientX, e.touches[0].clientY);
    });

    canvas.addEventListener('mouseup', () => {
      endSwipe();
    });
    canvas.addEventListener('touchend', () => {
      endSwipe();
    });

    const swipeHandler = new SwipeHandler({
      element: canvas,
      cursor: '',
      onSwipe: (xDiff, yDiff, _e) => {
        const point = normalizePoint([initialPosition[0] + xDiff, initialPosition[1] + yDiff]);

        if(points.length > 0) {
          const lastPoint = points[points.length - 1];
          builtUpDistance += distance(processPoint(lastPoint), processPoint(point));
        }
        if(builtUpDistance < Math.min(lastLine().size, 12) * editorState.pixelRatio && points.length > 1) {
          points[points.length - 1] = point;
        } else {
          points.push(point);
          builtUpDistance = 0;
        }

        setLastLine((prev) => ({...prev, points}));
        brushPainter.previewLine(processLine(lastLine()));
      },
      onReset() {
        (async() => {
          builtUpDistance = 0;
          if(lastLine().brush === 'arrow') {
            await brushPainter.animateArrowBrush(processLine(lastLine()));
          }
          saveLastLine();
        })();
      }
    });

    onCleanup(() => {
      swipeHandler.removeListeners();
    })
  });

  return <>{canvas}</>;
}
