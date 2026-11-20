import {batch, createEffect, createSignal, on, onCleanup, untrack} from 'solid-js';
import {createMutable, unwrap} from 'solid-js/store';
import type {BrushType, MediaEditorContextValue} from '@components/mediaEditor/context';
import type {EditorShape, NumberPair} from '@components/mediaEditor/types';
import {androidPaintDocumentLimits, appendAndroidPaintOperation, clearAllAndroidPaint, createAndroidPaintDocument, readAndroidPaintDocument} from '@components/mediaEditor/native/androidPaintDocument';
import type {AndroidPaintDocument, AndroidPaintOperation, AndroidPaintShape} from '@components/mediaEditor/native/androidPaintDocument';
import {androidPaintingSize, androidPaintWebPolicy, drawAndroidPainting, viewToAndroidPainting} from '@components/mediaEditor/native/androidPaintAdapter';
import {createAndroidPaintRenderer} from '@components/mediaEditor/native/androidPaintRenderer';
import {AndroidSamplePreparationV1} from '@components/mediaEditor/native/androidSamplePreparation';
import {AndroidStampPlacementV1, androidStampPlacementVersion} from '@components/mediaEditor/native/androidStampPlacement';
import {androidBaseWeight, androidBrushParameters} from '@components/mediaEditor/webgl/androidStampsContract';
import type {AndroidBrush, AndroidStamp} from '@components/mediaEditor/webgl/androidStampsContract';
import {beginAndroidShapeDrag, createAndroidShapeGeometry, updateAndroidShapeDrag} from '@components/mediaEditor/native/androidShapeGeometry';
import type {AndroidShapeDrag, AndroidShapeGeometry} from '@components/mediaEditor/native/androidShapeGeometry';
import {hexaToRgba} from '@helpers/color';
import I18n from '@lib/langPack';
import sequentialDom from '@helpers/sequentialDom';
import liteMode from '@helpers/liteMode';
import {createAndroidArrowTerminal} from '@components/mediaEditor/native/androidArrowTerminal';
import type {AndroidArrowScheduler} from '@components/mediaEditor/native/androidArrowTerminal';
import type {AndroidPreparedCommand} from '@components/mediaEditor/native/androidSamplePreparation';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';

export function hasAndroidPaint(context: Pick<MediaEditorContextValue, 'mediaState'>) {
  return Object.prototype.hasOwnProperty.call(context.mediaState, 'androidPaintDocument');
}

/** Runtime owner only, not a persisted preference bank or a second history stack. */
export default function createAndroidPaintSession(context: MediaEditorContextValue, newDocument: boolean,
  options: {arrowScheduler?: AndroidArrowScheduler; motion?: () => boolean} = {}) {
  const {mediaState, editorState, actions} = context;
  const weights = createMutable({pen: .25, arrow: .25, marker: .5, neon: .5, eraser: 1});
  const terminal = createAndroidArrowTerminal(options.arrowScheduler);
  const [pendingTerminal, setPendingTerminal] = createSignal(false);
  const [arrowGesture, setArrowGesture] = createSignal(false);
  const motion = options.motion ?? (() => liteMode.isAvailable('motion'));
  const source = context.mediaSrc;
  const managers = context.managers;
  const accountSession = getManagersSession(managers);
  const ownerValid = () => !disposed && source === context.mediaSrc && managers === context.managers &&
    (!accountSession || !isSessionLeaving(accountSession));
  const [error, setError] = createSignal<string>();
  const [ready, setReady] = createSignal(false);
  const [activeShape, setActiveShape] = createSignal<AndroidPaintShape>();
  let document: AndroidPaintDocument;
  let installed: unknown;
  let renderer: Awaited<ReturnType<typeof createAndroidPaintRenderer>>;
  let canvas: HTMLCanvasElement;
  let generation = 0;
  let disposed = false;
  let pointer: number;
  let drag: AndroidShapeDrag;
  let dragStart: AndroidShapeGeometry;
  let prepare: AndroidSamplePreparationV1;
  let placement: AndroidStampPlacementV1;
  let descriptor: Extract<AndroidPaintOperation, {kind: 'stroke' | 'erase'}>['descriptor'];
  let records: AndroidStamp[] = [];
  let captureTransform: string;
  let gestureOrigin: NumberPair;
  let attempted = false;
  const tool = (): AndroidBrush => editorState.currentBrush.brush === 'brush' ? 'marker' : editorState.currentBrush.brush;
  const transformKey = () => JSON.stringify([editorState.finalTransform, editorState.canvasSize, editorState.pixelRatio, mediaState.scale]);
  const report = (key: 'MediaEditor.Paint.ToolUnsupported' | 'MediaEditor.Paint.Unavailable' | 'MediaEditor.Paint.StillOnly') => setError(I18n.format(key, true));
  const redraw = () => {
    if(!canvas || !renderer) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAndroidPainting(ctx, renderer.canvas, editorState.mediaSize, editorState.finalTransform);
  };
  const cancel = (resetInput = true) => {
    if(terminal.pending()) resetInput = true;
    terminal.cancel();
    setPendingTerminal(false);
    setArrowGesture(false);
    if(resetInput) prepare = undefined;
    pointer = undefined;
    gestureOrigin = undefined;
    placement = undefined;
    descriptor = undefined;
    records = [];
    if(dragStart && activeShape()) setActiveShape({...activeShape(), geometry: dragStart});
    drag = undefined;
    dragStart = undefined;
    try { renderer?.cancel(); redraw(); } catch{ setReady(false); report('MediaEditor.Paint.Unavailable'); }
  };
  const install = (operation: AndroidPaintOperation) => {
    if(!ownerValid()) throw new Error('Android paint owner changed');
    const change = appendAndroidPaintOperation(document, operation);
    renderer.commit(); // GL errors/context loss reject before any state/history mutation.
    document = change.newValue;
    batch(() => {
      mediaState.androidPaintDocument = document;
      installed = unwrap(mediaState.androidPaintDocument);
      actions.pushToHistory({path: ['androidPaintDocument'], ...change});
      setActiveShape(undefined);
    });
  };
  // liteMode reads the reactive app-settings store and the shared OS reduced-
  // motion accessor when the a11y layer is active. This subscription exists
  // only while an Arrow gesture/terminal owns work; disposal is root-scoped.
  createEffect(() => {
    if(arrowGesture() && !motion()) {
      cancel();
      report('MediaEditor.Paint.ToolUnsupported');
    }
  });
  const resolveShape = (shape: AndroidPaintShape): AndroidPaintShape => {
    const rgba = hexaToRgba(editorState.currentBrush.color);
    return {kind: 'shape', geometry: {...shape.geometry, color: editorState.currentBrush.color,
      thickness: androidBaseWeight(document.context.paintingSize[0], weights.pen)},
    rgba: [rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, (rgba[3] ?? 255) / 255]};
  };
  const finishShape = () => {
    if(terminal.pending()) return false; // Apply/export must not omit an unfinished Arrow.
    if(!activeShape()) return true;
    if(!ready()) return false;
    try {
      const shape = resolveShape(activeShape());
      renderer.previewShape(shape);
      install(shape);
      editorState.currentBrush.brush = 'pen';
      redraw();
      return true;
    } catch{ cancel(); report('MediaEditor.Paint.Unavailable'); return false; }
  };
  async function rebuild(value: AndroidPaintDocument, mint: boolean) {
    const token = ++generation;
    setReady(false);
    cancel();
    try {
      if(context.mediaType !== 'image' || context.isEditingForAvatar || context.isVideoAvatarMode || mediaState.brushDrawnLines.length ||
        mediaState.resizableLayers.some(layer => layer.type === 'shape')) throw new Error('Invalid Android paint photo context');
      // Solid's raw store arrays can carry private symbol bookkeeping. Detach at
      // this trusted store boundary, then apply the format's strict data reader.
      const nextDocument = readAndroidPaintDocument(structuredClone(unwrap(value)));
      if(nextDocument.context.androidDensity !== androidPaintWebPolicy.density ||
        nextDocument.context.paintingSize.some(size => size > androidPaintWebPolicy.cap)) throw new Error('Unsupported Android paint web policy');
      const next = await createAndroidPaintRenderer(nextDocument);
      if(!ownerValid() || token !== generation) { next.dispose(); return; }
      renderer?.dispose();
      renderer = next;
      document = nextDocument;
      if(mint) {
        batch(() => {
          mediaState.androidPaintDocument = document;
          installed = unwrap(mediaState.androidPaintDocument);
        });
      }
      setReady(true);
      redraw();
    } catch{
      if(token === generation && !disposed) report('MediaEditor.Paint.Unavailable');
    }
  }
  createEffect(on(() => mediaState.androidPaintDocument, value => {
    if(value !== undefined && unwrap(value) === installed) return;
    setActiveShape(undefined);
    if(hasAndroidPaint(context)) void rebuild(value, false);
    else { ++generation; cancel(); setReady(false); }
  }));
  createEffect(on(() => editorState.mediaSize, size => {
    if(attempted || !newDocument || hasAndroidPaint(context) || !size) return;
    attempted = true;
    void rebuild(createAndroidPaintDocument({paintingSize: androidPaintingSize(size), androidDensity: androidPaintWebPolicy.density}), true);
  }));
  createEffect(on(transformKey, () => { if(pointer !== undefined || terminal.pending()) cancel(); redraw(); }));
  createEffect(on(() => editorState.currentTab, tab => { if(tab !== 'brush') cancel(); }));
  createEffect(() => {
    editorState.currentBrush.color;
    weights.pen;
    const shape = activeShape();
    if(!shape || !ready()) return;
    try { renderer.previewShape(resolveShape(shape)); redraw(); } catch{ cancel(); report('MediaEditor.Paint.Unavailable'); }
  });
  onCleanup(() => { disposed = true; ++generation; terminal.cancel(); renderer?.dispose(); });

  const point = (event: PointerEvent): NumberPair => {
    return viewToAndroidPainting([event.clientX - gestureOrigin[0], event.clientY - gestureOrigin[1]], editorState.canvasSize,
      editorState.pixelRatio, editorState.finalTransform, editorState.mediaSize, document.context.paintingSize);
  };
  const acceptCommand = (command: AndroidPreparedCommand) => {
      if(command.kind === 'paint') {
        const result = placement.place({points: command.points, baseWeight: command.baseWeight,
          viewportScale: descriptor.viewportScaleAtCapture, clear: command.clear});
        if(result.status === 'unsupported-native-buffer-state') throw new Error(result.reason);
        if(result.status === 'placed') {
          if(records.length + result.stamps.length + document.stampCount > androidPaintDocumentLimits.stamps) throw new Error('Paint record budget');
          for(const stamp of result.stamps) records.push(stamp);
          renderer.append(result.stamps);
        }
      } else if(command.kind === 'commit') {
        install(descriptor.tool === 'eraser' ? {kind: 'erase', descriptor: {...descriptor, tool: 'eraser'}, stamps: records} :
          {kind: 'stroke', descriptor: descriptor as Extract<AndroidPaintOperation, {kind: 'stroke'}>['descriptor'], stamps: records});
      } else if(command.kind === 'arrow') {
        const token = generation;
        const root = unwrap(mediaState.androidPaintDocument);
        setPendingTerminal(true);
        terminal.start(prepare, acceptCommand,
          () => ownerValid() && token === generation && unwrap(mediaState.androidPaintDocument) === root &&
            captureTransform === transformKey() && motion(),
          () => {
            cancel();
            report(motion() ? 'MediaEditor.Paint.Unavailable' : 'MediaEditor.Paint.ToolUnsupported');
          },
          () => {
            if(!terminal.pending()) {
              setPendingTerminal(false);
              setArrowGesture(false);
              descriptor = undefined;
              records = [];
              placement = undefined;
            }
            redraw();
          });
      }
  };
  const sample = (event: PointerEvent, action: 'down' | 'move' | 'up' | 'cancel') => {
    const p = point(event);
    prepare.process({action, x: p[0], y: p[1], pressure: event.pressure, tool: event.pointerType === 'pen' ? 'stylus' : 'finger',
      viewportScale: descriptor.viewportScaleAtCapture, stylusPrimaryButton: !!(event.buttons & 2)}, acceptCommand);
    redraw();
  };
  const selectTool = (brush: BrushType) => {
    if(brush === 'blur' || brush === 'arrow' && !motion()) { report('MediaEditor.Paint.ToolUnsupported'); return false; }
    if(!finishShape()) return false;
    cancel(pointer !== undefined || !!descriptor);
    editorState.currentBrush.brush = brush;
    setError(undefined);
    return true;
  };
  return {
    ready, error, activeShape, weights, tool,
    pendingTerminal,
    ownsDispatch: () => hasAndroidPaint(context) || newDocument,
    selectTool, cancel, finishShape,
    cancelPending() { ++generation; cancel(); },
    rejectAnimated() { report('MediaEditor.Paint.StillOnly'); },
    selectShape(shape: EditorShape, filled: boolean) {
      if(!ready() || !finishShape()) return false;
      cancel();
      setActiveShape(resolveShape({kind: 'shape', geometry: createAndroidShapeGeometry({shape, filled,
        paintingSize: [...document.context.paintingSize], density: document.context.androidDensity,
        normalizedWeight: weights.pen, color: editorState.currentBrush.color}), rgba: [0, 0, 0, 1]}));
      return true;
    },
    undoDraft() {
      cancel();
      if(!activeShape()) return false;
      setActiveShape(undefined);
      editorState.currentBrush.brush = 'pen';
      return true;
    },
    clearAll() {
      cancel(); // Also cancels an uncommitted first Arrow when history is empty.
      if(!ready() || !mediaState.history.some(item => ['androidPaintDocument', 'resizableLayers'].includes(String(item.path[0])))) return;
      setActiveShape(undefined);
      const next = clearAllAndroidPaint(document).document;
      batch(() => {
        mediaState.androidPaintDocument = next;
        mediaState.resizableLayers = [];
        mediaState.history = mediaState.history.filter(item => !['androidPaintDocument', 'resizableLayers'].includes(String(item.path[0])));
        mediaState.redoHistory = mediaState.redoHistory.filter(item => !['androidPaintDocument', 'resizableLayers'].includes(String(item.path[0])));
        editorState.selectedResizableLayer = undefined;
        editorState.currentBrush.brush = 'pen';
      });
    },
    connect(target: HTMLCanvasElement) {
      canvas = target;
      let measuredOrigin: NumberPair;
      let connected = true;
      const measureOrigin = () => {
        measuredOrigin = undefined;
        void sequentialDom.measure(() => {
          if(!connected) return;
          const rect = target.getBoundingClientRect();
          measuredOrigin = [rect.left, rect.top];
        });
      };
      createEffect(on(transformKey, measureOrigin));
      const viewChanged = () => { if(pointer !== undefined || terminal.pending()) cancel(); measureOrigin(); };
      const view = target.ownerDocument.defaultView;
      view.addEventListener('scroll', viewChanged, true);
      view.addEventListener('resize', viewChanged);
      createEffect(() => { target.width = editorState.canvasSize?.[0] * editorState.pixelRatio; target.height = editorState.canvasSize?.[1] * editorState.pixelRatio; redraw(); });
      const down = (event: PointerEvent) => {
        if(!ready() || terminal.pending() || pointer !== undefined || !event.isPrimary || event.button !== 0) return;
        if(!ownerValid()) { cancel(); return; }
        event.preventDefault();
        try {
          // Read before any gesture writes, once only. Normally the read phase
          // has already supplied this; the first DOWN needs no async latency.
          const rect = measuredOrigin ? undefined : target.getBoundingClientRect();
          const origin: NumberPair = measuredOrigin ? [...measuredOrigin] : [rect.left, rect.top];
          gestureOrigin = origin;
          const p = point(event);
          const shape = activeShape();
          if(shape) {
            drag = beginAndroidShapeDrag(shape.geometry, p);
            if(!drag) { finishShape(); return; } // Consume outside DOWN, never begin Pen here.
            dragStart = shape.geometry;
          } else {
            if(!selectTool(editorState.currentBrush.brush)) return;
            gestureOrigin = origin;
            const brush = tool() as 'pen' | 'arrow' | 'marker' | 'neon' | 'eraser';
            // hexaToRgba returns three channels for an opaque RGB preference,
            // despite its four-channel return type. Construct the wire tuple
            // explicitly, preserving supplied alpha and defaulting only absence.
            const rgba = hexaToRgba(editorState.currentBrush.color);
            descriptor = {version: 1, tool: brush, paintingSize: document.context.paintingSize,
              normalizedWeight: weights[brush], viewportScaleAtCapture: mediaState.scale,
              color: [rgba[0], rgba[1], rgba[2], rgba[3] ?? 255]};
            placement = new AndroidStampPlacementV1({version: androidStampPlacementVersion, brush});
            setArrowGesture(brush === 'arrow');
            const baseWeight = androidBaseWeight(document.context.paintingSize[0], weights[brush]);
            const inputBrush = brush === 'arrow' ? 'arrow' : 'radial';
            if(prepare) prepare.configureStroke({brush: inputBrush, baseWeight});
            else prepare = new AndroidSamplePreparationV1({version: 1, brush: inputBrush, androidDensity: document.context.androidDensity,
              baseWeight, shapeRecognition: 'disabled', longPressFill: 'disabled', processingClockMs: () => Math.floor(performance.now())});
            renderer.begin(descriptor);
            records = [];
            sample(event, 'down');
          }
          pointer = event.pointerId;
          captureTransform = transformKey();
          canvas.setPointerCapture(pointer);
        } catch{ cancel(); report('MediaEditor.Paint.Unavailable'); }
      };
      const move = (event: PointerEvent) => {
        if(terminal.pending()) return;
        if(pointer !== event.pointerId) return;
        if(captureTransform !== transformKey()) { cancel(); return; }
        try {
          if(drag) setActiveShape({...activeShape(), geometry: updateAndroidShapeDrag(activeShape().geometry, drag, point(event))});
          else sample(event, 'move');
        } catch{ cancel(); report('MediaEditor.Paint.Unavailable'); }
      };
      const up = (event: PointerEvent) => {
        if(terminal.pending()) return;
        if(pointer !== event.pointerId) return;
        if(captureTransform !== transformKey()) { cancel(); return; }
        try {
          if(descriptor?.tool === 'arrow' && !motion()) {
            cancel();
            report('MediaEditor.Paint.ToolUnsupported');
            return;
          }
          if(!drag) sample(event, 'up');
          if(descriptor?.tool === 'arrow' && !terminal.pending()) setArrowGesture(false);
          pointer = undefined;
          drag = undefined;
          dragStart = undefined;
          gestureOrigin = undefined;
          if(!terminal.pending()) { descriptor = undefined; records = []; }
        } catch{ cancel(); report('MediaEditor.Paint.Unavailable'); }
      };
      const lost = (event: PointerEvent) => {
        if(terminal.pending()) return; // Native animator ignores even pointer CANCEL.
        if(pointer !== event.pointerId) return;
        try {
          if(descriptor) sample(event, 'cancel');
          cancel(false); // Native CANCEL retains velocity/time, never its path.
        } catch{ cancel(); report('MediaEditor.Paint.Unavailable'); }
      };
      const names = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'] as const;
      const listeners: Record<typeof names[number], (event: PointerEvent) => void> = {
        pointerdown: down, pointermove: move, pointerup: up, pointercancel: lost, lostpointercapture: lost
      };
      for(const name of names) target.addEventListener(name, listeners[name]);
      onCleanup(() => {
        connected = false;
        view.removeEventListener('scroll', viewChanged, true);
        view.removeEventListener('resize', viewChanged);
        cancel();
        for(const name of names) target.removeEventListener(name, listeners[name]);
        canvas = undefined;
      });
      untrack(redraw);
    }
  };
}
