import {createContext, createRoot, createSignal, Signal} from 'solid-js';

import {AppManagers} from '../../lib/appManagers/managers';

import {AdjustmentsConfig, createAdjustmentsConfig} from './adjustments';
import {ResizableLayer, StickerRenderingInfo, TextLayerInfo, TextRenderingInfo} from './types';
import {RenderingPayload} from './webgl/initWebGL';
import {BrushDrawnLine} from './canvas/brushPainter';
import {MediaEditorProps} from './mediaEditor';
import {FinalTransform} from './canvas/useFinalTransform';

export interface MediaEditorContextValue {
  managers: AppManagers;
  pixelRatio: number;
  imageSrc: string;
  adjustments: AdjustmentsConfig;
  renderingPayload: Signal<RenderingPayload>;
  isReady: Signal<boolean>;

  currentTab: Signal<string>;

  imageSize: Signal<[number, number]>;
  canvasSize: Signal<[number, number]>;
  currentImageRatio: Signal<number>;
  fixedImageRatioKey: Signal<string>;
  scale: Signal<number>;
  rotation: Signal<number>;
  translation: Signal<[number, number]>;
  flip: Signal<[number, number]>;
  finalTransform: Signal<FinalTransform>;

  resizableLayersSeed: number;
  currentTextLayerInfo: Signal<TextLayerInfo>;
  resizableLayers: Signal<Signal<ResizableLayer>[]>;
  selectedResizableLayer: Signal<number>;
  textLayersInfo: Signal<Record<number, TextRenderingInfo>>;
  stickersLayersInfo: Signal<Record<number, StickerRenderingInfo>>;

  imageCanvas: Signal<HTMLCanvasElement>;
  currentBrush: Signal<{
    color: string;
    size: number;
    brush: string;
  }>;
  previewBrushSize: Signal<number>;
  brushDrawnLines: Signal<BrushDrawnLine[]>;

  resizeHandlesContainer: Signal<HTMLElement>;

  history: Signal<HistoryItem[]>;
  redoHistory: Signal<HistoryItem[]>;
  pushToHistory: (item: HistoryItem) => void;

  isAdjusting: Signal<boolean>;
  isMoving: Signal<boolean>;

  redrawBrushes: () => void;
  abortDrawerSlide: () => void;
  resetRotationWheel: () => void;

  gifCreationProgress: Signal<number>;
}

export type HistoryItem = {
  undo: () => void;
  redo: () => void;
};

const MediaEditorContext = createContext<MediaEditorContextValue>();

function createContextValue(props: MediaEditorProps): MediaEditorContextValue {
  const history = createSignal<HistoryItem[]>([]);
  const redoHistory = createSignal<HistoryItem[]>([]);

  function pushToHistory(item: HistoryItem) {
    const [, setHistory] = history;
    const [, setRedoHistory] = redoHistory;
    setHistory((prev) => [...prev, item]);
    setRedoHistory([]);
  }

  return {
    managers: props.managers,
    imageSrc: props.imageURL,
    pixelRatio: Math.min(2, window.devicePixelRatio),
    renderingPayload: createSignal(),
    isReady: createSignal(false),

    adjustments: createAdjustmentsConfig(),
    currentTab: createSignal('adjustments'),
    imageSize: createSignal([0, 0]),
    canvasSize: createSignal(),
    currentImageRatio: createSignal(0),
    scale: createSignal(1),
    rotation: createSignal(0),
    translation: createSignal([0, 0]),
    flip: createSignal([1, 1]),
    fixedImageRatioKey: createSignal(),

    finalTransform: createSignal({
      flip: [1, 1],
      rotation: 0,
      scale: 1,
      translation: [0, 0]
    }),

    resizableLayersSeed: 1,
    resizableLayers: createSignal([]),
    currentTextLayerInfo: createSignal<TextLayerInfo>({
      alignment: 'left',
      style: 'outline',
      color: '#ffffff',
      font: 'roboto',
      size: 40
    }),
    selectedResizableLayer: createSignal(),
    textLayersInfo: createSignal({}),
    stickersLayersInfo: createSignal({}),

    brushDrawnLines: createSignal([]),
    imageCanvas: createSignal(),
    currentBrush: createSignal({
      brush: 'pen',
      color: '#fe4438',
      size: 18
    }),
    previewBrushSize: createSignal(),

    resizeHandlesContainer: createSignal(),

    history,
    redoHistory,
    pushToHistory,

    isAdjusting: createSignal(false),
    isMoving: createSignal(false),

    redrawBrushes: () => {},
    abortDrawerSlide: () => {},
    resetRotationWheel: () => {},

    gifCreationProgress: createSignal(0)
  };
}

export type StandaloneContext = ReturnType<typeof createStandaloneContextValue>;

export function createStandaloneContextValue(props: MediaEditorProps) {
  let dispose: () => void;
  const value = createRoot((_dispose) => {
    dispose = _dispose;
    return createContextValue(props);
  });
  return {
    value,
    dispose
  };
}

export default MediaEditorContext;
