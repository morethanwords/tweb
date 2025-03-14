import {Accessor, batch, createEffect, createMemo, For, on, onCleanup, onMount, ParentProps, Show} from 'solid-js';
import {createMutable, modifyMutable, produce} from 'solid-js/store';
import {Portal} from 'solid-js/web';

import createContextMenu from '../../../helpers/dom/createContextMenu';

import SwipeHandler, {getEvent} from '../../swipeHandler';
import {observeResize} from '../../resizeObserver';

import {NumberPair, ResizableLayer, ResizableLayerProps} from '../types';
import {HistoryItem, useMediaEditorContext} from '../context';
import {withCurrentOwner} from '../utils';
import useIsMobile from '../useIsMobile';

import StickerLayerContent from './stickerLayerContent';
import useNormalizePoint from './useNormalizePoint';
import TextLayerContent from './textLayerContent';
import useProcessPoint from './useProcessPoint';


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

  function addLayer(e: MouseEvent) {
    if(e.target !== container) return;
    if(editorState.selectedResizableLayer) {
      editorState.selectedResizableLayer = undefined;
      return;
    }

    if(!isTextTab()) return;

    const bcr = container.getBoundingClientRect();
    const transform = editorState.finalTransform;

    const newResizableLayer = {
      id: context.resizableLayersSeed++,
      position: normalizePoint([e.clientX - bcr.left, e.clientY - bcr.top]),
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
        onClick={withCurrentOwner(addLayer)}
        style={{
          'opacity': editorState.isAdjusting ? 0 : 1
        }}
      >
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

  const processedLayer = createMemo(() => ({
    position: processPoint(props.layer.position),
    rotation: props.layer.rotation + mediaState.rotation,
    scale: editorState.finalTransform.scale * props.layer.scale
  }));


  let container: HTMLDivElement;

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

    useContextMenu({container, layer: props.layer});

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
      onClick={() => {
        editorState.selectedResizableLayer = props.layer.id;
      }}
      ref={container}
    >
      {props.children}

      {canShowHandles() && <Portal mount={editorState.resizeHandlesContainer}>
        <div
          class="media-editor__resizable-container-handles"
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
}

function useContextMenu({container, layer}: UseContextMenuArgs) {
  const {editorState, mediaState, actions} = useMediaEditorContext();

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
      {
        icon: 'delete',
        className: 'danger',
        text: 'Delete',
        onClick
      }
    ],
    listenTo: container,
    onElementReady: (element) => {
      element.classList.add('night');
    }
  });

  onCleanup(() => {
    contextMenu.destroy();
  });
}
