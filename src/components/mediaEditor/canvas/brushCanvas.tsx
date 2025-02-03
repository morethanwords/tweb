import {createEffect, createMemo, createSignal, on, onCleanup, onMount, useContext} from 'solid-js';

import SwipeHandler from '../../swipeHandler';

import MediaEditorContext from '../context';
import {initWebGL, RenderingPayload} from '../webgl/initWebGL';
import {draw} from '../webgl/draw';
import {AdjustmentsConfig} from '../adjustments';
import {distance} from '../utils';

import BrushPainter, {BrushDrawnLine} from './brushPainter';
import useNormalizePoint from './useNormalizePoint';
import useProcessPoint from './useProcessPoint';

function drawAdjustedImage(gl: WebGLRenderingContext, payload: RenderingPayload) {
  const context = useContext(MediaEditorContext);
  const [flip] = context.flip;

  if(!payload) return;

  draw(gl, payload, {
    flip: flip(),
    rotation: 0,
    scale: 1,
    translation: [0, 0],
    imageSize: [payload.image.width, payload.image.height],
    ...(Object.fromEntries(
      context.adjustments.map(({key, signal, to100}) => {
        const value = signal[0]();
        return [key, value / (to100 ? 100 : 50)];
      })
    ) as Record<AdjustmentsConfig[number]['key'], number>)
  });
}

export default function BrushCanvas() {
  const context = useContext(MediaEditorContext);
  const [imageCanvas] = context.imageCanvas;
  const [imageSize] = context.imageSize;
  const [canvasSize] = context.canvasSize;
  const [currentBrush] = context.currentBrush;
  const [currentTab] = context.currentTab;
  const [, setSelectedTextLayer] = context.selectedResizableLayer;
  const [lines, setLines] = context.brushDrawnLines;
  const [isAdjusting] = context.isAdjusting;
  const [finalTransform] = context.finalTransform;
  const [isMoving] = context.isMoving;

  const [fullImageGLPayload, setFullImageGLPayload] = createSignal<RenderingPayload>();

  const normalizePoint = useNormalizePoint();
  const processPoint = useProcessPoint();

  function processLine(line: BrushDrawnLine): BrushDrawnLine {
    const transform = finalTransform();
    return {
      ...line,
      size: line.size * transform.scale,
      points: line.points.map(processPoint)
    };
  }

  const processedLines = createMemo(() => lines().map(processLine));

  const [lastLine, setLastLine] = createSignal<BrushDrawnLine>();

  const canvas = (
    <canvas
      class="media-editor__brush-canvas"
      classList={{
        'media-editor__brush-canvas--active': currentTab() === 'brush'
      }}
      style={{
        'opacity': isAdjusting() ? 0 : 1
      }}
      width={canvasSize()[0] * context.pixelRatio}
      height={canvasSize()[1] * context.pixelRatio}
    ></canvas>
  ) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');

  const fullImageMultiplier = () =>
    Math.min(canvasSize()[0] / imageSize()[0], canvasSize()[1] / imageSize()[1]) * 2 * context.pixelRatio;

  const fullImageCanvas = (<canvas width={imageSize()[0]} height={imageSize()[1]} />) as HTMLCanvasElement;
  const gl = fullImageCanvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  const fullBrushesCanvas = (
    <canvas width={imageSize()[0] * fullImageMultiplier()} height={imageSize()[1] * fullImageMultiplier()} />
  ) as HTMLCanvasElement;

  let brushPainter = new BrushPainter({
    imageCanvas: imageCanvas(),
    targetCanvas: canvas
  });

  let fullBrushPainter: BrushPainter;

  onMount(async() => {
    setFullImageGLPayload(await initWebGL(gl, context));
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
    on(canvasSize, () => {
      brushPainter = new BrushPainter({
        imageCanvas: imageCanvas(),
        targetCanvas: canvas
      });
      redraw();
    })
  );

  function resetLastLine() {
    setLastLine({
      color: currentBrush().color,
      brush: currentBrush().brush,
      size: (currentBrush().size * context.pixelRatio) / finalTransform().scale,
      points: []
    });
  }

  createEffect(() => {
    resetLastLine();
  });

  createEffect(() => {
    if(isMoving()) {
      const transform = finalTransform();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      ctx.translate(transform.translation[0] + canvas.width / 2, transform.translation[1] + canvas.height / 2);
      ctx.rotate(transform.rotation);
      ctx.scale(transform.scale, transform.scale);

      const [w, h] = imageSize();
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
            (point[0] + imageSize()[0] / 2) * fullImageMultiplier(),
            (point[1] + imageSize()[1] / 2) * fullImageMultiplier()
          ] as [number, number]
      )
    };
  }

  function redrawFull() {
    if(!fullBrushPainter) return;

    fullBrushPainter.clear();
    fullBrushPainter.saveLastLine();

    lines().forEach((line) => fullBrushPainter.drawLine(processLineForFullImage(line)));
  }

  createEffect(
    on(imageSize, () => {
      if(!imageSize()?.[0]) return;
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
    if(isAdjusting()) {
      onCleanup(() => {
        redraw();
        redrawFull();
      });
    }
  });

  context.redrawBrushes = () => {
    redraw();
    redrawFull();
  };
  onCleanup(() => {
    context.redrawBrushes = () => {};
  });

  onMount(() => {
    let initialPosition: [number, number];
    let points: [number, number][] = [];

    let builtUpDistance = 0;

    function saveLastLine() {
      const prevLines = [...lines()];
      const newLines = [...lines(), lastLine()];
      setLines(newLines);
      fullBrushPainter.updateBlurredImage();
      fullBrushPainter.drawLine(processLineForFullImage(lastLine()));
      resetLastLine();
      brushPainter.saveLastLine();

      context.pushToHistory({
        undo() {
          setLines(prevLines);
          context.redrawBrushes();
        },
        redo() {
          setLines(newLines);
          context.redrawBrushes();
        }
      });

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

      setSelectedTextLayer();
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

    new SwipeHandler({
      element: canvas,
      cursor: '',
      onSwipe: (xDiff, yDiff, _e) => {
        const point = normalizePoint([initialPosition[0] + xDiff, initialPosition[1] + yDiff]);

        if(points.length > 0) {
          const lastPoint = points[points.length - 1];
          builtUpDistance += distance(processPoint(lastPoint), processPoint(point));
        }
        if(builtUpDistance < Math.min(lastLine().size, 12) * context.pixelRatio && points.length > 1) {
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
  });

  return <>{canvas}</>;
}
