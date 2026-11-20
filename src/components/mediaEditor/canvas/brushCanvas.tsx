import {Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack} from 'solid-js';
import createMiddleware from '@helpers/solid/createMiddleware';
import ListenerSetter from '@helpers/listenerSetter';
import {adjustmentsConfig, AdjustmentsConfig} from '@components/mediaEditor/adjustments';
import {HistoryItem, useMediaEditorContext} from '@components/mediaEditor/context';
import {NumberPair} from '@components/mediaEditor/types';
import {cleanupWebGl, distance, snapToAngle} from '@components/mediaEditor/utils';
import {draw} from '@components/mediaEditor/webgl/draw';
import {initWebGL, RenderingPayload} from '@components/mediaEditor/webgl/initWebGL';
import BrushPainter, {BrushDrawnLine} from '@components/mediaEditor/canvas/brushPainter';
import useNormalizePoint from '@components/mediaEditor/canvas/useNormalizePoint';
import useProcessPoint from '@components/mediaEditor/canvas/useProcessPoint';
import useIsMobile from '@components/mediaEditor/useIsMobile';
import createAffineBrushPreview from '@components/mediaEditor/canvas/affineBrushPreview';


function drawAdjustedImage(gl: WebGLRenderingContext, payload: RenderingPayload) {
  const {mediaState} = useMediaEditorContext();

  if(!payload) return;

  draw(gl, payload, {
    flip: mediaState.flip,
    processingVersion: mediaState.adjustments.processingVersion,
    native: mediaState.adjustments.native,
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
  const context = useMediaEditorContext();
  return <Show when={context.nativePaint?.ownsDispatch()} fallback={<LegacyBrushCanvas />}>
    <NativePaintCanvas />
  </Show>;
}

function NativePaintCanvas() {
  const {nativePaint, editorState} = useMediaEditorContext();
  const canvas = <canvas class="media-editor__brush-canvas" classList={{'media-editor__brush-canvas--active': editorState.currentTab === 'brush'}}
    style={{opacity: editorState.isAdjusting || !nativePaint.ready() ? 0 : 1}} /> as HTMLCanvasElement;
  editorState.brushCanvas = canvas;
  nativePaint.connect(canvas);
  return canvas;
}

function LegacyBrushCanvas() {
  const {editorState, mediaState, actions, mediaSrc, mediaType, isEditingForAvatar} = useMediaEditorContext();
  const isMobile = useIsMobile();

  const [fullImageGLPayload, setFullImageGLPayload] = createSignal<RenderingPayload>();

  const normalizePoint = useNormalizePoint();
  const processPoint = useProcessPoint();
  const processScreenPoint = useProcessPoint(false);

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
      editorState.canvasSize?.[0] / editorState.mediaSize?.[0],
      editorState.canvasSize?.[1] / editorState.mediaSize?.[1]
    ) * 2 * editorState.pixelRatio;

  const fullImageCanvas = (<canvas width={editorState.mediaSize?.[0]} height={editorState.mediaSize?.[1]} />) as HTMLCanvasElement;
  // Preview-affine hook: legacy only, not NativePaintCanvas/Android dispatch.
  const affinePreview = createAffineBrushPreview(useMediaEditorContext(), canvas, fullImageCanvas, () => redraw());
  const gl = fullImageCanvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  const fullBrushesCanvas = (
    <canvas width={editorState.mediaSize?.[0] * fullImageMultiplier()} height={editorState.mediaSize?.[1] * fullImageMultiplier()} />
  ) as HTMLCanvasElement;

  let brushPainter = new BrushPainter({
    imageCanvas: editorState.imageCanvas,
    targetCanvas: canvas
  });

  let fullBrushPainter: BrushPainter;

  onMount(async() => {
    if(mediaType !== 'image') return;
    const middleware = createMiddleware().get();
    const payload = await initWebGL({gl, mediaSrc, mediaType, videoTime: 0, middleware});
    if(middleware() && payload) setFullImageGLPayload(payload);
  });

  onCleanup(() => {
    cleanupWebGl(gl);
  });

  createEffect(() => {
    const payload = fullImageGLPayload();
    drawAdjustedImage(gl, payload);
    if(payload && affinePreview.active()) untrack(affinePreview.redraw);
  });

  createEffect(on(fullImageGLPayload, () => {
    const payload = fullImageGLPayload();
    if(payload) setTimeout(() => redrawFull(), 100);
  }));

  createEffect(
    on(() => editorState.canvasSize, () => {
      brushPainter.cancelPreview();
      brushPainter = new BrushPainter({
        imageCanvas: editorState.imageCanvas,
        targetCanvas: canvas
      });
      redraw();
    })
  );

  function resetLastLine() {
    const nativeStyle = isEditingForAvatar ? undefined : isMobile() ? 'android' : 'desktop';
    setLastLine({
      color: editorState.currentBrush.color,
      brush: editorState.currentBrush.brush,
      size: (editorState.currentBrush.size * editorState.pixelRatio) / editorState.finalTransform.scale,
      nativeStyle,
      rendererVersion: nativeStyle === 'desktop' && editorState.currentBrush.brush === 'arrow' ? 1 : undefined,
      blurRadiusRatio: nativeStyle === 'desktop' ? 20 / editorState.currentBrush.size : undefined,
      points: []
    });
  }

  createEffect(() => {
    if(affinePreview.active()) {
      affinePreview.redraw();
    } else if(editorState.isMoving) {
      const transform = editorState.finalTransform;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      ctx.translate(transform.translation[0] + canvas.width / 2, transform.translation[1] + canvas.height / 2);
      ctx.rotate(transform.rotation);
      ctx.scale(transform.scale, transform.scale);

      const [w, h] = editorState.mediaSize;
      ctx.drawImage(fullBrushesCanvas, -(w / 2), -(h / 2), w, h);

      ctx.restore();
    } else {
      redraw();
      redrawFull();
    }
  });

  function redraw() {
    if(affinePreview.active()) { affinePreview.redraw(); return; }
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
            (point[0] + editorState.mediaSize?.[0] / 2) * fullImageMultiplier(),
            (point[1] + editorState.mediaSize?.[1] / 2) * fullImageMultiplier()
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
    on(() => editorState.mediaSize, () => {
      if(!editorState.mediaSize?.[0]) return;
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

    // Holding Shift keeps the stroke straight, like in other graphic editors: the points from
    // `straightAnchorIndex` (where Shift went down) onwards collapse into a single segment that snaps
    // to a multiple of 45° — measured on screen, so the snapped angle is the one the user sees
    let isShiftPressed = false;
    let straightAnchorIndex: number;

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
      if(affinePreview.active()) affinePreview.saveLastLine();
      initialPosition = undefined;
    }

    function startSwipe(x: number, y: number) {
      const bcr = canvas.getBoundingClientRect();
      // Capture the shell at pointerdown, never reinterpret saved strokes after a resize.
      resetLastLine();

      isShiftPressed = false;
      straightAnchorIndex = undefined;

      initialPosition = [x - bcr.left, y - bcr.top];
      const point = normalizePoint(initialPosition);
      points = [point];

      setLastLine((prev) => ({...prev, points}));
      if(affinePreview.active()) affinePreview.previewLine(lastLine());
      else {
        brushPainter.updateBlurredImage();
        brushPainter.previewLine(processLine(lastLine()));
      }

      editorState.selectedResizableLayer = undefined;
    }

    const listeners = new ListenerSetter();
    let pointerId: number;
    let finishing = false;
    let strokeGeneration = 0;
    let startX: number, startY: number;
    listeners.add(canvas)('pointerdown', (e) => {
      if(finishing || pointerId !== undefined || !e.isPrimary || e.button !== 0) return;
      e.preventDefault();
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      canvas.setPointerCapture(pointerId);
      startSwipe(e.clientX, e.clientY);
    });

    listeners.add(canvas)('pointermove', (_e) => {
      if(pointerId !== _e.pointerId || !initialPosition) return;
      const position: NumberPair = [initialPosition[0] + _e.clientX - startX, initialPosition[1] + _e.clientY - startY];

      const shiftKey = _e.shiftKey;
      if(shiftKey !== isShiftPressed) {
        isShiftPressed = shiftKey;
        straightAnchorIndex = undefined;
      }

      if(isShiftPressed) {
        straightAnchorIndex ??= Math.max(points.length - 1, 0);
        const anchor = points[straightAnchorIndex];
        const point = normalizePoint(snapToAngle(processScreenPoint(anchor), position));

        points.length = straightAnchorIndex + 1;
        points.push(point);
        builtUpDistance = 0;
      } else {
        const point = normalizePoint(position);

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
      }

      setLastLine((prev) => ({...prev, points}));
      if(affinePreview.active()) affinePreview.previewLine(lastLine());
      else brushPainter.previewLine(processLine(lastLine()));
    });
    const finishStroke = (event: PointerEvent) => {
      if(pointerId !== event.pointerId) return;
      pointerId = undefined;
      builtUpDistance = 0;
      const painter = brushPainter;
      const generation = ++strokeGeneration;
      const animation = affinePreview.active() ? affinePreview.finishLine(lastLine()) : painter.finishLine(processLine(lastLine()));
      if(!animation) {
        saveLastLine();
        return;
      }
      finishing = true;
      animation.then(completed => {
        if(generation !== strokeGeneration) return;
        finishing = false;
        if(completed && painter === brushPainter) saveLastLine();
      });
    };
    function abortStroke() {
      ++strokeGeneration;
      const capturedId = pointerId;
      pointerId = undefined;
      if(capturedId !== undefined && canvas.hasPointerCapture(capturedId)) canvas.releasePointerCapture(capturedId);
      finishing = false;
      points = [];
      initialPosition = undefined;
      builtUpDistance = 0;
      brushPainter.cancelPreview();
      if(affinePreview.active()) affinePreview.cancelPreview();
    }
    const cancelStroke = (event: PointerEvent) => {
      // pointerup has already relinquished ownership: its normal capture loss
      // must not cancel the terminal animation or the committed stroke.
      if(pointerId === event.pointerId) abortStroke();
    };
    listeners.add(canvas)('pointerup', finishStroke);
    listeners.add(canvas)('pointercancel', cancelStroke);
    listeners.add(canvas)('lostpointercapture', cancelStroke);

    createEffect(on(() => editorState.currentTab, () => {
      if(editorState.currentTab !== 'brush' && (initialPosition || finishing)) abortStroke();
    }));

    onCleanup(() => {
      abortStroke();
      listeners.removeAll();
    })
  });

  return <>{canvas}</>;
}
