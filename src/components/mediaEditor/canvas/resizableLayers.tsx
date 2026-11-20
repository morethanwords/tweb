import {Accessor, batch, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, ParentProps, Show} from 'solid-js';
import {createMutable, modifyMutable, produce} from 'solid-js/store';
import {canFlipImageLayer} from '@components/mediaEditor/imageLayer/reflection';
import {Portal} from 'solid-js/web';

import createContextMenu from '@helpers/dom/createContextMenu';
import contextMenuController from '@helpers/contextMenuController';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import positionMenu, {positionMenuTrigger} from '@helpers/positionMenu';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import findAndSplice from '@helpers/array/findAndSplice';
import I18n from '@lib/langPack';
import Modes from '@config/modes';

import {observeResize} from '@components/resizeObserver';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import Icon from '@components/icon';
import {getIconMirrorClass} from '@/iconsReverse';
import type {ButtonMenuItemOptions, ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import SwipeHandler, {getEvent} from '@components/swipeHandler';

import {useMediaEditorContext} from '@components/mediaEditor/context';
import useAddText from '@components/mediaEditor/useAddText';
import {NumberPair, ResizableLayer, ResizableLayerProps} from '@components/mediaEditor/types';
import useIsMobile from '@components/mediaEditor/useIsMobile';

import StickerLayerContent from '@components/mediaEditor/canvas/stickerLayerContent';
import ImageLayerContent from '@components/mediaEditor/imageLayer/content';
import TextLayerContent from '@components/mediaEditor/canvas/textLayerContent';
import useNormalizePoint from '@components/mediaEditor/canvas/useNormalizePoint';
import shapeDrawingGeometry, {desktopShapeDraftFrame, desktopShapeDragStarted} from '@components/mediaEditor/canvas/shapeDrawingGeometry';
import useProcessPoint from '@components/mediaEditor/canvas/useProcessPoint';
import {getEditorShapeGeometry} from '@components/mediaEditor/shapePath';
import {addEditorShape} from '@components/mediaEditor/shapes';
import insertResizableLayer from '@components/mediaEditor/insertResizableLayer';
import beginLayerTransform from '@components/mediaEditor/canvas/beginLayerTransform';
import {mapPreviewVector, previewLayerMatrix, previewCSSMatrix, type PreviewAffine} from '@components/mediaEditor/canvas/previewAffine';
import layerResizeGeometry, {desktopShapeStretch, shapeLocalVector} from '@components/mediaEditor/canvas/layerResizeGeometry';
import ShapeBendHandle from '@components/mediaEditor/canvas/shapeBendHandle';
import {isDesktopShape} from '@components/mediaEditor/native/desktopShapeGeometry';
import createLayerObjectActions from '@components/mediaEditor/layerObjectActions';
import selectResizableLayer from '@components/mediaEditor/selectResizableLayer';
import createDesktopTextMenu from '@components/mediaEditor/native/desktopTextMenu';
import desktopGuideFrame from '@components/mediaEditor/native/desktopGuideFrame';
import desktopGuideDrag from '@components/mediaEditor/native/desktopGuideDrag';
import desktopGuideCanvas from '@components/mediaEditor/native/desktopGuideCanvas';
import liteMode from '@helpers/liteMode';


type ProcessedLayer = {
  position: NumberPair;
  rotation: number;
  scale: number;
}

export default function ResizableLayers() {
  const context = useMediaEditorContext();
  const {editorState, mediaState} = context;
  const isTextTab = () => editorState.currentTab === 'text';
  const canClick = () => ['stickers', 'text', 'adjustments', 'shapes', 'layers'].includes(editorState.currentTab);
  const normalizePoint = useNormalizePoint();


  function moveSelectedLayerOnTop() {
    const layers = mediaState.resizableLayers;
    const idx = layers.findIndex(layer => layer.id === editorState.selectedResizableLayer);
    if(idx < 0) return;
    const layer = layers.splice(idx, 1)[0];
    layer && layers.push(layer);
  }

  createEffect(
    on(() => editorState.selectedResizableLayer, () => {
      moveSelectedLayerOnTop();
    })
  );

  createEffect(() => {
    editorState.currentTab;
    onCleanup(() => {
      editorState.selectedResizableLayer = undefined;
    });
  });

  let container: HTMLDivElement;
  let shapeLayer: ResizableLayer;
  let shapeStart: NumberPair;
  let shapeOrigin: NumberPair;
  let suppressShapeClick = false;
  let desktopShape = false;
  let shapeMoved = false;
  let shapePointer: number;
  const [draft, setDraft] = createSignal<{id: number, visible: boolean, fits: boolean}>();

  function discardShapeDraft() {
    if(!shapeLayer) return;
    findAndSplice(mediaState.resizableLayers, item => item.id === shapeLayer.id);
    if(editorState.selectedResizableLayer === shapeLayer.id) editorState.selectedResizableLayer = undefined;
    shapeLayer = undefined;
    setDraft(undefined);
    if(container.hasPointerCapture(shapePointer)) container.releasePointerCapture(shapePointer);
  }

  createEffect(() => {
    const tab = editorState.currentTab, tool = editorState.drawingShape;
    if(tab !== 'shapes' || !tool) discardShapeDraft();
  });
  onCleanup(discardShapeDraft);

  function drawShape(e: PointerEvent) {
    if(editorState.currentTab !== 'shapes' || !editorState.drawingShape || e.button !== 0 || shapeLayer) return;
    e.preventDefault();
    suppressShapeClick = true;
    const rect = container.getBoundingClientRect();
    shapeOrigin = [rect.left, rect.top];
    shapeStart = [e.clientX - rect.left, e.clientY - rect.top];
    const tool = editorState.drawingShape;
    shapeLayer = addEditorShape(context, tool.shape, tool.filled, false);
    if(!shapeLayer) return;
    desktopShape = !!container.closest('[data-editor-platform="desktop"]') && !context.isEditingForAvatar;
    shapeMoved = false;
    shapePointer = e.pointerId;
    if(desktopShape) {
      const ratio = shapeLayer.shapeInfo.height / shapeLayer.shapeInfo.width;
      shapeLayer.shapeInfo.width = Math.max(Math.floor(shapeLayer.shapeInfo.width), 1);
      shapeLayer.shapeInfo.height = shapeLayer.shapeInfo.width * ratio;
      const frame = desktopShapeDraftFrame(tool.shape, shapeLayer.shapeInfo.width, shapeLayer.shapeInfo.height, editorState.mediaSize, shapeLayer.shapeInfo.strokeWidth, false);
      shapeLayer.shapeInfo.width = frame.width;
      shapeLayer.shapeInfo.height = frame.height;
      setDraft({id: shapeLayer.id, visible: false, fits: false});
      editorState.selectedResizableLayer = undefined;
    } else shapeLayer.shapeInfo.width = shapeLayer.shapeInfo.height = 1;
    shapeLayer.position = normalizePoint(shapeStart);
    mediaState.resizableLayers.push(shapeLayer);
    // Use the store's proxy for the live preview, then record one completed edit.
    shapeLayer = mediaState.resizableLayers[mediaState.resizableLayers.length - 1];
    container.setPointerCapture(e.pointerId);
  }

  function resizeShape(e: PointerEvent) {
    if(!shapeLayer || e.pointerId !== shapePointer) return;
    const end: NumberPair = [e.clientX - shapeOrigin[0], e.clientY - shapeOrigin[1]];
    if(desktopShape && !shapeMoved && !desktopShapeDragStarted(shapeStart, end)) return;
    if(desktopShape && !shapeMoved) editorState.selectedResizableLayer = shapeLayer.id;
    shapeMoved = true;
    const factor = editorState.pixelRatio / editorState.finalTransform.scale;
    const geometry = shapeDrawingGeometry(shapeLayer.shapeInfo.shape, shapeStart, end, e.shiftKey, shapeLayer.shapeInfo.strokeWidth / factor);
    const frame = desktopShape ? desktopShapeDraftFrame(shapeLayer.shapeInfo.shape, geometry.width * factor, geometry.height * factor, editorState.mediaSize, shapeLayer.shapeInfo.strokeWidth) : undefined;
    batch(() => {
      shapeLayer.position = normalizePoint(geometry.center);
      shapeLayer.rotation = geometry.rotation - editorState.finalTransform.rotation;
      shapeLayer.shapeInfo.width = frame?.width ?? Math.max(1, geometry.width * factor);
      shapeLayer.shapeInfo.height = frame?.height ?? Math.max(1, geometry.height * factor);
      if(desktopShape) setDraft({id: shapeLayer.id, visible: true, fits: frame.fits});
    });
  }

  function finishShape(e: PointerEvent) {
    if(!shapeLayer || e.pointerId !== shapePointer) return;
    const apply = e.type !== 'pointercancel' && (!desktopShape || !shapeMoved || draft().fits);
    const layer: ResizableLayer = structuredClone({...shapeLayer, shapeInfo: {...shapeLayer.shapeInfo}, position: [...shapeLayer.position] as NumberPair});
    discardShapeDraft();
    if(desktopShape && !apply) return;
    if(desktopShape) editorState.drawingShape = undefined;
    editorState.currentTab = 'layers';
    if(apply) insertResizableLayer(context, layer);
  }

  const addText = useAddText();

  function activateLayerSurface(e: MouseEvent) {
    if(suppressShapeClick) { suppressShapeClick = false; return; }
    // without the a11y layer the container itself takes the click, as before
    if(!Modes.a11y && e.target !== container) return;
    if(editorState.selectedResizableLayer) {
      editorState.selectedResizableLayer = undefined;
      return;
    }

    if(!isTextTab()) return;

    const bcr = container.getBoundingClientRect();
    const point = e.detail === 0 ?
      [bcr.width / 2, bcr.height / 2] as NumberPair :
      [e.clientX - bcr.left, e.clientY - bcr.top] as NumberPair;

    addText(point);
  }

  const ownedActivateLayerSurface = withCurrentOwner(activateLayerSurface);

  return (
    <div
      class="media-editor__resizable-layers"
      classList={{
        'media-editor__resizable-layers--active': canClick()
      }}
      style={{
        cursor: editorState.currentTab === 'shapes' ? 'crosshair' : !editorState.selectedResizableLayer && isTextTab() ? 'text' : undefined,
        'touch-action': editorState.currentTab === 'shapes' ? 'none' : undefined
      }}
    >
      <div
        ref={container}
        onPointerDown={drawShape}
        onPointerMove={resizeShape}
        onPointerUp={finishShape}
        onPointerCancel={finishShape}
        class="media-editor__resizable-layers-inner"
        onClick={Modes.a11y ? undefined : ownedActivateLayerSurface}
        style={{
          'opacity': editorState.isAdjusting ? 0 : 1
        }}
      >
        <Show when={Modes.a11y && (isTextTab() || editorState.selectedResizableLayer !== undefined)}>
          <button
            type="button"
            class="media-editor__resizable-layers-surface"
            aria-label={I18n.format(
              editorState.selectedResizableLayer === undefined ?
                'MediaEditor.AddTextLayer' :
                'MediaEditor.DeselectLayer',
              true
            )}
            onClick={ownedActivateLayerSurface}
          />
        </Show>

        <For each={mediaState.resizableLayers}>
          {(layer) => (
            <>
              <Show when={layer.type === 'text'}>
                <TextLayerContent layer={layer} />
              </Show>
              <Show when={layer.type === 'sticker'}>
                <StickerLayerContent layer={layer} />
              </Show>
              <Show when={layer.type === 'image' && layer}>
                {image => <ImageLayerContent layer={image()} />}
              </Show>
              <Show when={layer.type === 'shape'}>
                <Show when={draft()?.id !== layer.id || draft().visible}>
                  <div style={{opacity: draft()?.id === layer.id && !draft().fits ? .5 : 1}}>
                    <ShapeLayerContent layer={layer} />
                  </div>
                </Show>
              </Show>
            </>
          )}
        </For>
      </div>
    </div>
  );
}

function ShapeLayerContent(props: ResizableLayerProps) {
  const {editorState} = useMediaEditorContext();
  const info = () => props.layer.shapeInfo;
  const geometry = createMemo(() => getEditorShapeGeometry(info()));
  const bounds = () => geometry().previewBounds;
  return (
    <ResizableContainer layer={props.layer}>
      <svg
        aria-hidden="true"
        width={bounds().width / editorState.pixelRatio}
        height={bounds().height / editorState.pixelRatio}
        viewBox={`${bounds().x} ${bounds().y} ${bounds().width} ${bounds().height}`}
        style={{display: 'block', overflow: 'visible'}}
      >
        <For each={geometry().parts}>{part => <path
          d={part.path}
          fill={part.fill ? info().color : 'none'}
          stroke={part.stroke ? info().color : 'none'}
          stroke-width={info().strokeWidth}
          stroke-linecap="round"
          stroke-linejoin="round"
        />}</For>
      </svg>
    </ResizableContainer>
  );
}

export function ResizableContainer(props: ParentProps<ResizableLayerProps & {onEditText?: () => void}>) {
  const context = useMediaEditorContext();
  const {editorState, mediaState} = context;

  const isMobile = useIsMobile();
  const processPoint = useProcessPoint(false);


  const handleTyping = (): HTMLDivElement | undefined => undefined;

  const store = createMutable({
    diff: [0, 0] as NumberPair,
    containerWidth: 0,
    containerHeight: 0,
    rotating: false,
    nativeGuides: false,
    guideX: undefined as number | undefined,
    guideY: undefined as number | undefined,
    guideCanvas: undefined as ReturnType<typeof desktopGuideCanvas>,
    leftTopEl: handleTyping(),
    rightTopEl: handleTyping(),
    leftBottomEl: handleTyping(),
    rightBottomEl: handleTyping()
  });

  const circleOffset = () => (isMobile() ? '-6px' : '-4px');
  const canShowHandles = () => editorState.resizeHandlesContainer && props.layer.id === editorState.selectedResizableLayer && editorState.editingTextLayer !== props.layer.id;
  const isStickerLayer = () => props.layer.type === 'sticker';

  const processedLayer = createMemo(() => ({
    position: processPoint(props.layer.position),
    rotation: props.layer.rotation + mediaState.rotation,
    scale: editorState.finalTransform.scale * props.layer.scale
  }));
  // Physical media coordinates, independent of interface direction. Individual
  // translation precedes the existing centered rotation/scale transform.
  const translation = createMemo(() => `${processedLayer().position[0] + store.diff[0]}px ${processedLayer().position[1] + store.diff[1]}px`);
  const contentMatrix = createMemo(() => {
    const preview = editorState.paintPreviewAffine;
    if(!preview) return;
    const m = previewLayerMatrix(preview.forward, props.layer.position, props.layer.rotation, props.layer.scale, editorState.pixelRatio);
    // Position is applied exactly once, through the individual CSS translate.
    return [m[0], m[1], m[2], m[3], 0, 0] as const;
  });
  // Project the frame, not its controls: every knob and border keeps its CSS size.
  const anchor = (x: number, y: number): NumberPair => {
    const p = mapPreviewVector(contentMatrix(), [x * store.containerWidth / 2, y * store.containerHeight / 2]);
    return [p[0] + processedLayer().position[0] + store.diff[0], p[1] + processedLayer().position[1] + store.diff[1]];
  };
  const knobStyle = (x: number, y: number) => {
    if(!contentMatrix()) return {};
    const p = anchor(x, y);
    return {left: p[0] + 'px', top: p[1] + 'px', right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)'};
  };
  const edgeStyle = (x1: number, y1: number, x2: number, y2: number) => {
    if(!contentMatrix()) return {};
    const a = anchor(x1, y1), b = anchor(x2, y2);
    return {left: a[0] + 'px', top: a[1] + 'px', right: 'auto', bottom: 'auto',
      width: Math.hypot(b[0] - a[0], b[1] - a[1]) + 'px', height: '1px',
      'transform-origin': '0 0', transform: `rotate(${Math.atan2(b[1] - a[1], b[0] - a[0])}rad)`};
  };


  let container: HTMLDivElement;
  const [actionsButton, setActionsButton] = createSignal<HTMLButtonElement>();
  const renderActions = (screen = false) => <ButtonIconTsx
    ref={setActionsButton}
    icon="more"
    class="media-editor__layer-actions"
    style={{display: editorState.selectedResizableLayer === props.layer.id ? undefined : 'none',
      ...(screen ? knobStyle(1, -1) : {})}}
    aria-label={I18n.format('MediaEditor.LayerActions', true)}
    aria-haspopup="menu"
    aria-expanded="false"
  />;

  onMount(() => {
    useResizeHandles({
      container,
      leftBottomEl: () => store.leftBottomEl,
      leftTopEl: () => store.leftTopEl,
      rightBottomEl: () => store.rightBottomEl,
      rightTopEl: () => store.rightTopEl,

      layer: props.layer,
      diff: store.diff,
      processedLayer,
      onGuides: (native, guides, canvas) => batch(() => {
        store.nativeGuides = native;
        store.guideX = guides.x;
        store.guideY = guides.y;
        store.guideCanvas = canvas;
      }),
      onRotate: (value) => store.rotating = value
    });

    useContextMenu({container, layer: props.layer, actionsButton, onEditText: props.onEditText});

    const unobserve = observeResize(container, entry => {
      // Handles must use the same fractional border box as the rendered layer.
      // clientWidth rounds before scaling, magnifying the error on a resized layer.
      const box = entry.borderBoxSize?.[0];
      store.containerWidth = box?.inlineSize ?? container.clientWidth;
      store.containerHeight = box?.blockSize ?? container.clientHeight;
    });

    onCleanup(() => {
      unobserve();
    });
  });

  return (
    <div
      class="media-editor__resizable-container"
      style={{
        'translate': translation(),
        '--rotation': (processedLayer().rotation / Math.PI) * 180 + 'deg',
        '--scale': processedLayer().scale,
        'transform': contentMatrix() ? `${previewCSSMatrix(contentMatrix())} translate(-50%, -50%)` : undefined
      }}
      onClick={Modes.a11y ? undefined : () => {
        selectResizableLayer(editorState, props.layer);
      }}
      ref={container}
    >
      {props.children}

      <Show when={Modes.a11y}>
        <Show when={contentMatrix()} fallback={renderActions()}>
          <Portal mount={editorState.resizeHandlesContainer}>{renderActions(true)}</Portal>
        </Show>
      </Show>

      <Show when={Modes.a11y && (isStickerLayer() || props.layer.type === 'shape')}>
        <button
          type="button"
          class="media-editor__resizable-container-select"
          aria-label={I18n.format(isStickerLayer() ? 'MediaEditor.SelectStickerLayer' : 'MediaEditor.LayerActions', true)}
          onClick={() => {
            editorState.selectedResizableLayer = props.layer.id;
          }}
        />
      </Show>

      {canShowHandles() && <Portal mount={editorState.resizeHandlesContainer}>
        <Show when={store.nativeGuides} fallback={<Show when={store.diff[0] !== 0 || store.diff[1] !== 0}>
          <div class="media-editor__layer-guide media-editor__layer-guide--vertical" style={{left: editorState.canvasSize[0] / 2 + 'px'}} />
          <div class="media-editor__layer-guide media-editor__layer-guide--horizontal" style={{top: editorState.canvasSize[1] / 2 + 'px'}} />
        </Show>}>
          <Show when={store.guideX !== undefined}><div class="media-editor__layer-guide media-editor__layer-guide--vertical" style={{left: store.guideX + 'px', top: store.guideCanvas.y + 'px', bottom: 'auto', height: store.guideCanvas.height + 'px'}} /></Show>
          <Show when={store.guideY !== undefined}><div class="media-editor__layer-guide media-editor__layer-guide--horizontal" style={{top: store.guideY + 'px', left: store.guideCanvas.x + 'px', right: 'auto', width: store.guideCanvas.width + 'px'}} /></Show>
        </Show>
        <div
          class="media-editor__resizable-container-handles"
          // The layer menu exposes move/resize/rotate without dragging.
          aria-hidden={true}
          style={{
            'translate': contentMatrix() ? 'none' : translation(),
            'transform': contentMatrix() ? 'none' : undefined,
            'width': contentMatrix() ? '0px' : store.containerWidth * processedLayer().scale + 'px',
            'height': contentMatrix() ? '0px' : store.containerHeight * processedLayer().scale + 'px',
            '--rotation': (processedLayer().rotation / Math.PI) * 180 + 'deg'
          }}
        >
          <Show when={store.rotating}>
            <Show when={!contentMatrix()}><div class="media-editor__rotation-guide" /></Show>
            <span class="media-editor__rotation-angle" dir="ltr" style={contentMatrix() ? knobStyle(0, -1) : undefined}>{Math.round(processedLayer().rotation * 180 / Math.PI)}°</span>
          </Show>
          <div
            class="media-editor__resizable-container-border media-editor__resizable-container-border--vertical"
            style={{left: 0, ...edgeStyle(-1, -1, -1, 1)}}
          />
          <div
            class="media-editor__resizable-container-border media-editor__resizable-container-border--vertical"
            style={{right: 0, ...edgeStyle(1, -1, 1, 1)}}
          />
          <div
            class="media-editor__resizable-container-border media-editor__resizable-container-border--horizontal"
            style={{top: 0, ...edgeStyle(-1, -1, 1, -1)}}
          />
          <div
            class="media-editor__resizable-container-border media-editor__resizable-container-border--horizontal"
            style={{bottom: 0, ...edgeStyle(-1, 1, 1, 1)}}
          />
          <div
            ref={(el) => store.leftTopEl = el}
            class="media-editor__resizable-container-circle"
            style={{left: circleOffset(), top: isMobile() ? circleOffset() : 'calc(50% - 4px)', ...knobStyle(-1, isMobile() ? -1 : 0)}}
          />
          <div
            ref={(el) => store.rightTopEl = el}
            class="media-editor__resizable-container-circle"
            style={{right: circleOffset(), top: isMobile() ? circleOffset() : 'calc(50% - 4px)', ...knobStyle(1, isMobile() ? -1 : 0)}}
          />
          <div
            ref={(el) => store.leftBottomEl = el}
            class="media-editor__resizable-container-circle"
            style={{left: circleOffset(), bottom: circleOffset(), display: isMobile() ? undefined : 'none', ...knobStyle(-1, 1)}}
          />
          <div
            ref={(el) => store.rightBottomEl = el}
            class="media-editor__resizable-container-circle"
            style={{right: circleOffset(), bottom: circleOffset(), display: isMobile() ? undefined : 'none', ...knobStyle(1, 1)}}
          />
        </div>
        <Show when={!isMobile() && !context.isEditingForAvatar && props.layer.shapeInfo?.shape === 'arrow' && isDesktopShape(props.layer.shapeInfo)}>
          <ShapeBendHandle layer={props.layer} processed={() => ({...processedLayer(), position: [
            processedLayer().position[0] + store.diff[0], processedLayer().position[1] + store.diff[1]
          ]})} container={() => container} />
        </Show>
      </Portal>}
    </div>
  );
}


type UseResizeArgs = {
  container: HTMLDivElement;
  leftTopEl: () => HTMLDivElement;
  rightTopEl: () => HTMLDivElement;
  leftBottomEl: () => HTMLDivElement;
  rightBottomEl: () => HTMLDivElement;

  diff: NumberPair;
  layer: ResizableLayer;
  processedLayer: Accessor<ProcessedLayer>;
  onRotate: (rotating: boolean) => void;
  onGuides: (native: boolean, guides: {x?: number; y?: number}, canvas?: ReturnType<typeof desktopGuideCanvas>) => void;
};

function useResizeHandles({
  container,
  leftTopEl,
  rightTopEl,
  leftBottomEl,
  rightBottomEl,
  diff,
  layer,
  processedLayer,
  onGuides,
  onRotate
}: UseResizeArgs) {
  const context = useMediaEditorContext();
  const {editorState, mediaState} = context;

  const normalizePoint = useNormalizePoint();
  let firstTarget: EventTarget;
  let swipeStarted = false;
  let finishMove: () => void;
  let guideDrag: ReturnType<typeof desktopGuideDrag>;

  const handleElements = [leftTopEl, rightTopEl, leftBottomEl, rightBottomEl];

  handleElements.forEach(el => {
    createEffect(() => {
      const element = el();
      if(!element) return;
      let initialVector: NumberPair;
      let initialScreenVector: NumberPair;
      let center: NumberPair;
      let initialScale: number;
      let initialRotation: number;
      let stretchStarted: boolean;
      let finishResize: () => void;
      let inverse: PreviewAffine;

      const swipeHandler = new SwipeHandler({
        element,
        onStart() {
          finishResize = beginLayerTransform(context, layer);
          initialVector = undefined;
          initialScreenVector = undefined;
          stretchStarted = false;
          const rect = container.getBoundingClientRect();
          center = [rect.left + rect.width / 2, rect.top + rect.height / 2];
          initialScale = layer.scale;
          initialRotation = layer.rotation;
          inverse = editorState.paintPreviewAffine?.inverse;
          onRotate(true);
          element.classList.add('media-editor__resizable-container-circle--anti-flicker');
        },
        onSwipe(_, __, _e) {
          const e = getEvent(_e);

          if(!firstTarget) firstTarget = e.target;
          if(firstTarget !== element) return;

          const screenVector: NumberPair = [e.clientX - center[0], e.clientY - center[1]];
          const vector = inverse ? mapPreviewVector(inverse, screenVector) : screenVector;
          // SwipeHandler delivers the press itself before any movement.
          initialVector ??= vector;
          initialScreenVector ??= screenVector;
          const shift = 'shiftKey' in _e && _e.shiftKey === true;
          if(!shift && 'ctrlKey' in _e && _e.ctrlKey && !context.isEditingForAvatar &&
            container.closest('[data-editor-platform="desktop"]') && isDesktopShape(layer.shapeInfo)) {
            if(!stretchStarted && Math.hypot(screenVector[0] - initialScreenVector[0], screenVector[1] - initialScreenVector[1]) < 4) return;
            stretchStarted = true;
            const local = shapeLocalVector(vector, initialRotation + (inverse ? 0 : mediaState.rotation),
              inverse ? initialScale : editorState.finalTransform.scale * initialScale / editorState.pixelRatio);
            const frame = desktopShapeStretch(layer.shapeInfo, local, editorState.mediaSize);
            batch(() => {
              layer.shapeInfo.width = frame.width;
              layer.shapeInfo.height = frame.height;
            });
            return;
          }
          const geometry = layerResizeGeometry(initialVector, vector, initialScale, initialRotation, inverse ? 0 : mediaState.rotation, shift);

          modifyMutable(layer, produce(s => {
            s.rotation = geometry.rotation;
            s.scale = geometry.scale;
          }));
        },
        onReset() {
          finishResize?.();
          finishResize = undefined;
          onRotate(false);
          element.classList.remove('media-editor__resizable-container-circle--anti-flicker');
          firstTarget = undefined;
        }
      });
      onCleanup(() => {
        swipeHandler.removeListeners();
      });
    });
  });


  const moveHandler = new SwipeHandler({
    element: container,
    onSwipe(xDiff, yDiff, e) {
      if(editorState.editingTextLayer === layer.id) return;
      if(!firstTarget) firstTarget = e.target;
      if(handleElements.some(el => el() === firstTarget)) return;

      if(!swipeStarted) {
        // onStart messes up the typing
        swipeStarted = true;
        finishMove = beginLayerTransform(context, layer);
        selectResizableLayer(editorState, layer);
        if(container.closest('[data-editor-platform="desktop"]')) {
          const processed = processedLayer();
          const frame = desktopGuideFrame(context, layer, processed.rotation, processed.scale);
          const canvasBounds = desktopGuideCanvas(context);
          if(frame && canvasBounds) {
            guideDrag = desktopGuideDrag({
              document: container.ownerDocument, center: [...processed.position], canvasBounds, ...frame,
              motion: () => liteMode.isAvailable('motion'),
              write: (value, guides) => batch(() => { diff.splice(0, 2, ...value); onGuides(true, guides, canvasBounds); })
            });
          }
        }
      }

      if(guideDrag) {
        guideDrag.update(xDiff, yDiff, 'shiftKey' in e && e.shiftKey === true);
        return;
      }
      const position = processedLayer().position;
      const center = editorState.canvasSize.map(value => value / 2);
      diff.splice(0, 2,
        Math.abs(position[0] + xDiff - center[0]) < 6 ? center[0] - position[0] : xDiff,
        Math.abs(position[1] + yDiff - center[1]) < 6 ? center[1] - position[1] : yDiff
      );
    },
    onReset() {
      if(!swipeStarted) { firstTarget = undefined; return; }
      guideDrag?.dispose();
      guideDrag = undefined;
      batch(() => {
        if(diff[0] || diff[1]) {
          layer.position = normalizePoint([processedLayer().position[0] + diff[0], processedLayer().position[1] + diff[1]]);
        }
        finishMove?.();
        finishMove = undefined;
        diff.splice(0, 2, 0, 0);
        onGuides(false, {});
      });
      swipeStarted = false;
      firstTarget = undefined;
    }
  });

  onCleanup(() => {
    guideDrag?.dispose();
    moveHandler.removeListeners();
  });
}


type UseContextMenuArgs = {
  container: HTMLDivElement;
  layer: ResizableLayer;
  actionsButton: Accessor<HTMLButtonElement>;
  onEditText?: () => void;
}

function useContextMenu({container, layer, actionsButton, onEditText}: UseContextMenuArgs) {
  const context = useMediaEditorContext();
  const isMobile = useIsMobile();
  const hasDesktopTextMenu = () => !context.isEditingForAvatar && !isMobile() && layer.type === 'text';
  const hasAndroidTextMenu = () => !context.isEditingForAvatar && isMobile() && layer.type === 'text' && !!onEditText;
  const objectActions = createLayerObjectActions(context);
  const processPoint = useProcessPoint(false);
  const normalizePoint = useNormalizePoint();
  const transform = (change: () => void) => {
    const finish = beginLayerTransform(context, layer);
    change();
    finish();
  };
  const move = (x: number, y: number) => {
    transform(() => {
      const point = processPoint(layer.position);
      layer.position = normalizePoint([point[0] + x, point[1] + y]);
    });
  };
  const nativeShape = () => !isMobile() && !context.isEditingForAvatar && isDesktopShape(layer.shapeInfo);
  const stretch = (widthFactor: number, heightFactor: number) => transform(() => {
    const info = layer.shapeInfo;
    const frame = desktopShapeStretch(info, [info.width * widthFactor / 2, info.height * heightFactor / 2], context.editorState.mediaSize);
    info.width = frame.width;
    info.height = frame.height;
  });

  // * the layer moves across the picture, which is never mirrored: these arrows stay as drawn in RTL
  const physicalArrow = (icon: Icon) => {
    const element = Icon(icon);
    element.classList.remove(getIconMirrorClass(icon));
    return element;
  };

  // the move/resize/rotate items and the actions button stand in for dragging — a11y layer only
  const a11y = Modes.a11y;
  let formatting: ButtonMenuItemOptions[] = [];
  const contextMenu = createContextMenu({
    buttons: [
      ...(a11y ? [
        {icon: 'up', text: 'MediaEditor.MoveUp', onClick: () => move(0, -10)},
        {icon: 'down', text: 'MediaEditor.MoveDown', onClick: () => move(0, 10)},
        {iconElement: physicalArrow('left'), text: 'MediaEditor.MoveLeft', onClick: () => move(-10, 0)},
        {iconElement: physicalArrow('next'), text: 'MediaEditor.MoveRight', onClick: () => move(10, 0)},
        {icon: 'plus', text: 'MediaEditor.EnlargeLayer', onClick: () => transform(() => layer.scale *= 1.1)},
        {icon: 'minus', text: 'MediaEditor.ShrinkLayer', onClick: () => transform(() => layer.scale /= 1.1)},
        {icon: 'rotate', text: 'MediaEditor.RotateLayer', onClick: () => transform(() => layer.rotation += Math.PI / 12)}
      ] as ButtonMenuItemOptionsVerifiable[] : []),
      ...(a11y && nativeShape() ? [
        {icon: 'plus', text: 'MediaEditor.WidenShape', onClick: () => stretch(1.1, 1)},
        {icon: 'minus', text: 'MediaEditor.NarrowShape', onClick: () => stretch(1 / 1.1, 1)},
        ...(layer.shapeInfo.shape !== 'arrow' ? [
          {icon: 'plus', text: 'MediaEditor.TallerShape', onClick: () => stretch(1, 1.1)},
          {icon: 'minus', text: 'MediaEditor.ShorterShape', onClick: () => stretch(1, 1 / 1.1)}
        ] : [])
      ] as ButtonMenuItemOptionsVerifiable[] : []),
      ...(canFlipImageLayer(context, layer) || layer.type === 'sticker' || !isMobile() && !context.isEditingForAvatar && isDesktopShape(layer.shapeInfo) &&
        (layer.shapeInfo.shape === 'arrow' || layer.shapeInfo.shape === 'bubble') ? [{
        icon: 'flip',
        text: 'MediaEditor.FlipHorizontal',
        onClick: () => transform(() => {
          if(layer.type === 'sticker') layer.stickerFlip = !layer.stickerFlip;
          else if(layer.type === 'image' && canFlipImageLayer(context, layer)) layer.imageReflection.horizontal = !layer.imageReflection.horizontal;
          else layer.shapeInfo.shapeFlip = !layer.shapeInfo.shapeFlip;
        })
      }] as ButtonMenuItemOptionsVerifiable[] : []),
      {
        icon: 'copy',
        text: 'Copy',
        onClick: () => { objectActions.duplicate(layer.id); }
      },
      {
        icon: 'delete',
        className: 'danger',
        text: 'Delete',
        onClick: () => { objectActions.delete(layer.id); }
      }
    ],
    onOpen: () => {
      if(!hasDesktopTextMenu() && !hasAndroidTextMenu()) return;
      // createContextMenu awaits onOpen before building/exposing any action.
      return context.textSessions.afterFinish(() => {
        context.editorState.editingTextLayer = undefined;
        if(context.mediaState.resizableLayers.some(item => item.id === layer.id)) {
          selectResizableLayer(context.editorState, layer);
        }
      });
    },
    filterButtons: async(buttons) => {
      formatting = [];
      if(hasAndroidTextMenu()) {
        if(!context.mediaState.resizableLayers.some(item => item.id === layer.id && item.type === 'text')) return [];
        // Android 21f7d109 LPhotoPaintView.java:2660–2677: edit the existing text entity.
        return [...buttons, {icon: 'edit', text: 'Edit', onClick: () => {
          contextMenuController.close();
          onEditText();
        }}];
      }
      if(!hasDesktopTextMenu()) return buttons;
      if(!context.mediaState.resizableLayers.some(item => item.id === layer.id)) return [];
      // Built at open time: checked styles/fonts always belong to this layer.
      formatting = createDesktopTextMenu(context, layer);
      const objectButtons = buttons.map((button, index) => index === 0 ? {...button, separator: true} : button);
      return [...formatting, ...objectButtons];
    },
    listenTo: container,
    ...(a11y ? {
      findElement: actionsButton,
      position: (event: MouseEvent | TouchEvent, menu: HTMLElement) => {
        if('detail' in event && event.detail === 0) positionMenuTrigger(actionsButton(), menu, 'bottom-right');
        else positionMenu(event, menu);
      },
      onOpenAfter: () => actionsButton()?.setAttribute('aria-expanded', 'true')
    } : {}),
    onClose: () => {
      if(a11y) actionsButton()?.setAttribute('aria-expanded', 'false');
      formatting.forEach(item => { item.onClose?.(); item.dispose?.(); });
    },
    onElementReady: (element) => {
      element.classList.add('night');
      formatting.forEach(item => item.onOpen?.());
    }
  });
  if(a11y) createEffect(() => {
    const button = actionsButton();
    if(button) onCleanup(attachClickEvent(button, contextMenu.open));
  });

  onCleanup(() => {
    contextMenu.destroy();
  });
}
