import {Accessor, batch, createEffect, createMemo, For, on, onCleanup, onMount, ParentProps, Show} from 'solid-js';
import {createMutable, modifyMutable, produce} from 'solid-js/store';
import {Portal} from 'solid-js/web';

import createContextMenu from '@helpers/dom/createContextMenu';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import positionMenu, {positionMenuTrigger} from '@helpers/positionMenu';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import I18n from '@lib/langPack';

import {observeResize} from '@components/resizeObserver';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import SwipeHandler, {getEvent} from '@components/swipeHandler';

import {HistoryItem, useMediaEditorContext} from '@components/mediaEditor/context';
import {NumberPair, ResizableLayer, ResizableLayerProps} from '@components/mediaEditor/types';
import useIsMobile from '@components/mediaEditor/useIsMobile';

import StickerLayerContent from '@components/mediaEditor/canvas/stickerLayerContent';
import TextLayerContent from '@components/mediaEditor/canvas/textLayerContent';
import useNormalizePoint from '@components/mediaEditor/canvas/useNormalizePoint';
import useProcessPoint from '@components/mediaEditor/canvas/useProcessPoint';


type ProcessedLayer = {
  position: NumberPair;
  rotation: number;
  scale: number;
}

export default function ResizableLayers() {
  const context = useMediaEditorContext();
  const {editorState, mediaState, actions} = context;
  const isTextTab = () => editorState.currentTab === 'text';
  const canClick = () => ['stickers', 'text', 'adjustments'].includes(editorState.currentTab);


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

  const normalizePoint = useNormalizePoint();

  function activateLayerSurface(e: MouseEvent) {
    if(editorState.selectedResizableLayer) {
      editorState.selectedResizableLayer = undefined;
      return;
    }

    if(!isTextTab()) return;

    const bcr = container.getBoundingClientRect();
    const transform = editorState.finalTransform;
    const point = e.detail === 0 ?
      [bcr.width / 2, bcr.height / 2] as NumberPair :
      [e.clientX - bcr.left, e.clientY - bcr.top] as NumberPair;

    const newResizableLayer = {
      id: context.resizableLayersSeed++,
      position: normalizePoint(point),
      rotation: -transform.rotation,
      scale: 1 / transform.scale,
      type: 'text',
      textInfo: {...editorState.currentTextLayerInfo}
    } as ResizableLayer;

    batch(() => {
      mediaState.resizableLayers.push(newResizableLayer);
      editorState.selectedResizableLayer = newResizableLayer.id;

      actions.pushToHistory({
        path: ['resizableLayers', mediaState.resizableLayers.length - 1],
        newValue: newResizableLayer,
        oldValue: HistoryItem.RemoveArrayItem,
        findBy: {
          id: newResizableLayer.id
        }
      });
    });
  }

  const ownedActivateLayerSurface = withCurrentOwner(activateLayerSurface);

  return (
    <div
      class="media-editor__resizable-layers"
      classList={{
        'media-editor__resizable-layers--active': canClick()
      }}
      style={{
        cursor: !editorState.selectedResizableLayer && isTextTab() ? 'text' : undefined
      }}
    >
      <div
        ref={container}
        class="media-editor__resizable-layers-inner"
        style={{
          'opacity': editorState.isAdjusting ? 0 : 1
        }}
      >
        <Show when={isTextTab() || editorState.selectedResizableLayer !== undefined}>
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
            </>
          )}
        </For>
      </div>
    </div>
  );
}

export function ResizableContainer(props: ParentProps<ResizableLayerProps>) {
  const {editorState, mediaState} = useMediaEditorContext();

  const isMobile = useIsMobile();
  const processPoint = useProcessPoint(false);


  const handleTyping = (): HTMLDivElement | undefined => undefined;

  const store = createMutable({
    diff: [0, 0] as NumberPair,
    containerWidth: 0,
    containerHeight: 0,
    leftTopEl: handleTyping(),
    rightTopEl: handleTyping(),
    leftBottomEl: handleTyping(),
    rightBottomEl: handleTyping()
  });

  const circleOffset = () => (isMobile() ? '-6px' : '-4px');
  const canShowHandles = () => editorState.resizeHandlesContainer && props.layer.id === editorState.selectedResizableLayer;
  const isStickerLayer = () => props.layer.type === 'sticker';

  const processedLayer = createMemo(() => ({
    position: processPoint(props.layer.position),
    rotation: props.layer.rotation + mediaState.rotation,
    scale: editorState.finalTransform.scale * props.layer.scale
  }));


  let container: HTMLDivElement, actionsButton: HTMLButtonElement;

  onMount(() => {
    useResizeHandles({
      container,
      leftBottomEl: () => store.leftBottomEl,
      leftTopEl: () => store.leftTopEl,
      rightBottomEl: () => store.rightBottomEl,
      rightTopEl: () => store.rightTopEl,

      layer: props.layer,
      diff: store.diff,
      processedLayer
    });

    useContextMenu({container, layer: props.layer, actionsButton});

    const unobserve = observeResize(container, () => {
      store.containerWidth = container.clientWidth;
      store.containerHeight = container.clientHeight;
    });

    onCleanup(() => {
      unobserve();
    });
  });

  return (
    <div
      class="media-editor__resizable-container"
      style={{
        'left': processedLayer().position[0] + store.diff[0] + 'px',
        'top': processedLayer().position[1] + store.diff[1] + 'px',
        '--rotation': (processedLayer().rotation / Math.PI) * 180 + 'deg',
        '--scale': processedLayer().scale
      }}
      ref={container}
    >
      {props.children}

      <ButtonIconTsx
        ref={actionsButton}
        icon="more"
        class="media-editor__layer-actions"
        style={{display: canShowHandles() ? undefined : 'none'}}
        aria-label={I18n.format('MediaEditor.LayerActions', true)}
        aria-haspopup="menu"
        aria-expanded="false"
      />

      <Show when={isStickerLayer()}>
        <button
          type="button"
          class="media-editor__resizable-container-select"
          aria-label={I18n.format('MediaEditor.SelectStickerLayer', true)}
          onClick={() => {
            editorState.selectedResizableLayer = props.layer.id;
          }}
        />
      </Show>

      {canShowHandles() && <Portal mount={editorState.resizeHandlesContainer}>
        <div
          class="media-editor__resizable-container-handles"
          // The layer menu exposes move/resize/rotate without dragging.
          aria-hidden={true}
          style={{
            'left': processedLayer().position[0] + store.diff[0] + 'px',
            'top': processedLayer().position[1] + store.diff[1] + 'px',
            'width': store.containerWidth * processedLayer().scale + 'px',
            'height': store.containerHeight * processedLayer().scale + 'px',
            '--rotation': (processedLayer().rotation / Math.PI) * 180 + 'deg'
          }}
        >
          <div
            class="media-editor__resizable-container-border media-editor__resizable-container-border--vertical"
            style={{left: 0}}
          />
          <div
            class="media-editor__resizable-container-border media-editor__resizable-container-border--vertical"
            style={{right: 0}}
          />
          <div
            class="media-editor__resizable-container-border media-editor__resizable-container-border--horizontal"
            style={{top: 0}}
          />
          <div
            class="media-editor__resizable-container-border media-editor__resizable-container-border--horizontal"
            style={{bottom: 0}}
          />
          <div
            ref={(el) => store.leftTopEl = el}
            class="media-editor__resizable-container-circle"
            style={{left: circleOffset(), top: circleOffset()}}
          />
          <div
            ref={(el) => store.rightTopEl = el}
            class="media-editor__resizable-container-circle"
            style={{right: circleOffset(), top: circleOffset()}}
          />
          <div
            ref={(el) => store.leftBottomEl = el}
            class="media-editor__resizable-container-circle"
            style={{left: circleOffset(), bottom: circleOffset()}}
          />
          <div
            ref={(el) => store.rightBottomEl = el}
            class="media-editor__resizable-container-circle"
            style={{right: circleOffset(), bottom: circleOffset()}}
          />
        </div>
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
};

function useResizeHandles({
  container,
  leftTopEl,
  rightTopEl,
  leftBottomEl,
  rightBottomEl,
  diff,
  layer,
  processedLayer
}: UseResizeArgs) {
  const {editorState, mediaState} = useMediaEditorContext();

  const normalizePoint = useNormalizePoint();


  let firstTarget: EventTarget;
  let swipeStarted = false;

  const multipliers = [
    {el: leftTopEl, x: -1, y: -1},
    {el: rightTopEl, x: 1, y: -1},
    {el: leftBottomEl, x: -1, y: 1},
    {el: rightBottomEl, x: 1, y: 1}
  ];

  multipliers.forEach(({el, x, y}) => {
    createEffect(() => {
      const element = el();
      if(!element) return;

      const swipeHandler = new SwipeHandler({
        element,
        onStart() {
          element.classList.add('media-editor__resizable-container-circle--anti-flicker');
        },
        onSwipe(_, __, _e) {
          const e = getEvent(_e);

          if(!firstTarget) firstTarget = e.target;
          if(firstTarget !== element) return;

          const initialVector = [
            (container.clientWidth / 2) * x * editorState.finalTransform.scale,
            (container.clientHeight / 2) * y * editorState.finalTransform.scale
          ];
          const bcr = container.getBoundingClientRect();
          const resizedVector = [bcr.left + bcr.width / 2 - e.clientX, bcr.top + bcr.height / 2 - e.clientY];

          const rotationFromHorizon =
            Math.atan2(resizedVector[1], resizedVector[0]) - Math.atan2(initialVector[1], initialVector[0]) + Math.PI;
          const scale = Math.hypot(resizedVector[0], resizedVector[1]) / Math.hypot(initialVector[0], initialVector[1]);

          modifyMutable(layer, produce(s => {
            s.rotation = rotationFromHorizon - mediaState.rotation;
            s.scale = scale;
          }));
        },
        onReset() {
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
      if(!firstTarget) firstTarget = e.target;
      if(multipliers.find(({el}) => el() === firstTarget)) return;

      if(!swipeStarted) {
        // onStart messes up the typing
        swipeStarted = true;
        editorState.selectedResizableLayer = layer.id;
      }

      diff.splice(0, 2, xDiff, yDiff);
    },
    onReset() {
      layer.position = normalizePoint([processedLayer().position[0] + diff[0], processedLayer().position[1] + diff[1]]);
      diff.splice(0, 2, 0, 0);
      swipeStarted = false;
      firstTarget = undefined;
    }
  });

  onCleanup(() => {
    moveHandler.removeListeners();
  });
}


type UseContextMenuArgs = {
  container: HTMLDivElement;
  layer: ResizableLayer;
  actionsButton: HTMLButtonElement;
}

function useContextMenu({container, layer, actionsButton}: UseContextMenuArgs) {
  const {editorState, mediaState, actions} = useMediaEditorContext();
  const processPoint = useProcessPoint(false);
  const normalizePoint = useNormalizePoint();
  const move = (x: number, y: number) => {
    const point = processPoint(layer.position);
    layer.position = normalizePoint([point[0] + x, point[1] + y]);
  };

  function onClick() {
    const layers = mediaState.resizableLayers;
    const idx = layers.findIndex(otherLayer => otherLayer.id === layer.id);
    if(idx < 0) return;

    batch(() => {
      editorState.selectedResizableLayer = undefined;
      const deletedLayer = layers.splice(idx, 1)[0];

      actions.pushToHistory({
        path: ['resizableLayers', idx],
        newValue: HistoryItem.RemoveArrayItem,
        oldValue: deletedLayer,
        findBy: {
          id: deletedLayer.id
        }
      });
    });
  }

  const contextMenu = createContextMenu({
    buttons: [
      {icon: 'up', text: 'MediaEditor.MoveUp', onClick: () => move(0, -10)},
      {icon: 'down', text: 'MediaEditor.MoveDown', onClick: () => move(0, 10)},
      {icon: 'left', text: 'MediaEditor.MoveLeft', onClick: () => move(-10, 0)},
      {icon: 'next', text: 'MediaEditor.MoveRight', onClick: () => move(10, 0)},
      {icon: 'plus', text: 'MediaEditor.EnlargeLayer', onClick: () => layer.scale *= 1.1},
      {icon: 'minus', text: 'MediaEditor.ShrinkLayer', onClick: () => layer.scale /= 1.1},
      {icon: 'rotate', text: 'MediaEditor.RotateLayer', onClick: () => layer.rotation += Math.PI / 12},
      {
        icon: 'delete',
        className: 'danger',
        text: 'Delete',
        onClick
      }
    ],
    listenTo: container,
    findElement: () => actionsButton,
    position: (event, menu) => {
      if('detail' in event && event.detail === 0) positionMenuTrigger(actionsButton, menu, 'bottom-right');
      else positionMenu(event, menu);
    },
    onOpenAfter: () => actionsButton.setAttribute('aria-expanded', 'true'),
    onClose: () => actionsButton.setAttribute('aria-expanded', 'false'),
    onElementReady: (element) => {
      element.classList.add('night');
    }
  });
  const detachClick = attachClickEvent(actionsButton, contextMenu.open);

  onCleanup(() => {
    detachClick();
    contextMenu.destroy();
  });
}
