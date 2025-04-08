import {
  Accessor,
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  ParentProps,
  Show,
  Signal,
  useContext
} from 'solid-js';
import {Portal} from 'solid-js/web';
import {createMutable} from 'solid-js/store';

import createContextMenu from '../../../helpers/dom/createContextMenu';

import SwipeHandler, {getEvent} from '../../swipeHandler';
import {observeResize} from '../../resizeObserver';

import {withCurrentOwner} from '../utils';
import MediaEditorContext from '../context';
import {ResizableLayer} from '../types';
import useIsMobile from '../useIsMobile';

import TextLayerContent from './textLayerContent';
import StickerLayerContent from './stickerLayerContent';
import useNormalizePoint from './useNormalizePoint';
import useProcessPoint from './useProcessPoint';

type ResizableContainerProps = {
  layerSignal: Signal<ResizableLayer>;
  onDoubleClick?: () => void;
};

type ProcessedLayer = {
  position: [number, number];
  rotation: number;
  scale: number;
}

export default function ResizableLayers() {
  const context = useContext(MediaEditorContext);
  const [layers, setLayers] = context.resizableLayers;
  const [currentTab] = context.currentTab;
  const isTextTab = () => currentTab() === 'text';
  const canClick = () => ['stickers', 'text', 'adjustments'].includes(currentTab());
  const [currentTextLayerInfo] = context.currentTextLayerInfo;
  const [selectedResizableLayer, setSelectedResizableLayer] = context.selectedResizableLayer;
  const [isAdjusting] = context.isAdjusting;
  const [finalTransform] = context.finalTransform;

  createEffect(
    on(selectedResizableLayer, () => {
      setLayers((prev) => {
        const res = [...(prev || [])];
        const idx = res.findIndex((layer) => layer[0]().id === selectedResizableLayer());
        if(idx > -1) {
          const signal = res[idx];
          res.splice(idx, 1);
          res.push(signal);
          return res;
        }
        return prev;
      });
    })
  );

  createEffect(() => {
    currentTab();
    onCleanup(() => {
      setSelectedResizableLayer();
    });
  });

  let container: HTMLDivElement;

  const normalizePoint = useNormalizePoint();

  function addLayer(e: MouseEvent) {
    if(e.target !== container) return;
    if(selectedResizableLayer()) {
      setSelectedResizableLayer();
      return;
    }

    if(!isTextTab()) return;

    const bcr = container.getBoundingClientRect();
    const transform = finalTransform();

    const newResizableLayer = {
      id: context.resizableLayersSeed++,
      position: normalizePoint([e.clientX - bcr.left, e.clientY - bcr.top]),
      rotation: -transform.rotation,
      scale: 1 / transform.scale,
      type: 'text',
      textInfo: currentTextLayerInfo()
    } as ResizableLayer;

    batch(() => {
      setLayers((prev) => [...prev, createSignal<ResizableLayer>({...newResizableLayer})]);
      setSelectedResizableLayer(newResizableLayer.id);
    });

    let position = -1;
    let deletedLayer: ResizableLayer;
    context.pushToHistory({
      undo() {
        setLayers((prev) => {
          prev = [...prev];
          position = prev.findIndex((layer) => layer[0]().id === newResizableLayer.id);
          if(position > -1) deletedLayer = prev.splice(position, 1)[0]?.[0]();
          return prev;
        });
      },
      redo() {
        setLayers((prev) => {
          prev = [...prev];
          if(position > -1) prev.splice(position, 0, createSignal({...deletedLayer}));
          return prev;
        });
      }
    });
  }

  return (
    <div
      class="media-editor__resizable-layers"
      classList={{
        'media-editor__resizable-layers--active': canClick()
      }}
      style={{
        cursor: !selectedResizableLayer() && isTextTab() ? 'text' : undefined
      }}
    >
      <div
        ref={container}
        class="media-editor__resizable-layers-inner"
        onClick={withCurrentOwner(addLayer)}
        style={{
          'opacity': isAdjusting() ? 0 : 1
        }}
      >
        <For each={layers()}>
          {(layerSignal) => (
            <>
              <Show when={layerSignal[0]().type === 'text'}>
                <TextLayerContent layerSignal={layerSignal} />
              </Show>
              <Show when={layerSignal[0]().type === 'sticker'}>
                <StickerLayerContent layerSignal={layerSignal} />
              </Show>
            </>
          )}
        </For>
      </div>
    </div>
  );
}

export function ResizableContainer(props: ParentProps<ResizableContainerProps>) {
  const context = useContext(MediaEditorContext);
  const [rotation] = context.rotation;
  const [selectedResizableLayer, setSelectedResizableLayer] = context.selectedResizableLayer;
  const [finalTransform] = context.finalTransform;
  const [resizeHandlesContainer] = context.resizeHandlesContainer;

  const isMobile = useIsMobile();
  const processPoint = useProcessPoint(false);

  const [layer] = props.layerSignal;


  const handleTyping = (): HTMLDivElement | undefined => undefined;

  const store = createMutable({
    diff: [0, 0] as [number, number],
    containerWidth: 0,
    containerHeight: 0,
    leftTopEl: handleTyping(),
    rightTopEl: handleTyping(),
    leftBottomEl: handleTyping(),
    rightBottomEl: handleTyping()
  });

  const circleOffset = () => (isMobile() ? '-6px' : '-4px');
  const canShowHandles = () => resizeHandlesContainer() && layer().id === selectedResizableLayer();

  const processedLayer = createMemo(() => ({
    position: processPoint(layer().position),
    rotation: layer().rotation + rotation(),
    scale: finalTransform().scale * layer().scale
  }));


  let container: HTMLDivElement;

  onMount(() => {
    useResizeHandles({
      container,
      leftBottomEl: () => store.leftBottomEl,
      leftTopEl: () => store.leftTopEl,
      rightBottomEl: () => store.rightBottomEl,
      rightTopEl: () => store.rightTopEl,

      onDiffChange: (diff) => store.diff = diff,
      layerSignal: props.layerSignal,
      diff: () => store.diff,
      processedLayer
    });

    useContextMenu({container, layer});

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
        setSelectedResizableLayer(layer().id);
      }}
      ref={container}
    >
      {props.children}

      {canShowHandles() && <Portal mount={resizeHandlesContainer()}>
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

  diff: Accessor<[number, number]>;
  onDiffChange: (diff: [number, number]) => void;
  layerSignal: Signal<ResizableLayer>;
  processedLayer: Accessor<ProcessedLayer>;
};

function useResizeHandles({
  container,
  leftTopEl,
  rightTopEl,
  leftBottomEl,
  rightBottomEl,
  diff,
  onDiffChange,
  layerSignal,
  processedLayer
}: UseResizeArgs) {
  const context = useContext(MediaEditorContext);
  const [rotation] = context.rotation;
  const [, setSelectedResizableLayer] = context.selectedResizableLayer;
  const [finalTransform] = context.finalTransform;

  const normalizePoint = useNormalizePoint();

  const [layer, setLayer] = layerSignal;


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
            (container.clientWidth / 2) * x * finalTransform().scale,
            (container.clientHeight / 2) * y * finalTransform().scale
          ];
          const bcr = container.getBoundingClientRect();
          const resizedVector = [bcr.left + bcr.width / 2 - e.clientX, bcr.top + bcr.height / 2 - e.clientY];

          const rotationFromHorizon =
            Math.atan2(resizedVector[1], resizedVector[0]) - Math.atan2(initialVector[1], initialVector[0]) + Math.PI;
          const scale = Math.hypot(resizedVector[0], resizedVector[1]) / Math.hypot(initialVector[0], initialVector[1]);

          setLayer((prev) => ({...prev, rotation: rotationFromHorizon - rotation(), scale}));
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
        setSelectedResizableLayer(layer().id);
      }

      onDiffChange([xDiff, yDiff]);
    },
    onReset() {
      setLayer((prev) => ({
        ...prev,
        position: normalizePoint([processedLayer().position[0] + diff()[0], processedLayer().position[1] + diff()[1]])
      }));
      onDiffChange([0, 0]);
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
  layer: Accessor<ResizableLayer>;
}

function useContextMenu({container, layer}: UseContextMenuArgs) {
  const context = useContext(MediaEditorContext);
  const [, setSelectedResizableLayer] = context.selectedResizableLayer;
  const [, setLayers] = context.resizableLayers;

  function onClick() {
    let position = -1;
    let deletedLayer: ResizableLayer;

    setLayers((prev) => {
      prev = [...prev];
      position = prev.findIndex((other) => other[0]().id === layer().id);
      if(position > -1) deletedLayer = prev.splice(position, 1)?.[0][0]?.();
      return prev;
    });
    setSelectedResizableLayer();

    context.pushToHistory({
      undo() {
        setLayers((prev) => {
          prev = [...prev];
          if(position > -1) prev.splice(position, 0, createSignal({...deletedLayer}));
          return prev;
        });
      },
      redo() {
        setLayers((prev) => {
          prev = [...prev];
          position = prev.findIndex((layer) => layer[0]().id === deletedLayer.id);
          if(position > -1) deletedLayer = prev.splice(position, 1)[0]?.[0]();
          return prev;
        });
      }
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
